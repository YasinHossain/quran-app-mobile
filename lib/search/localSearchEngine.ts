/**
 * Offline verse search over the SQLite FTS5 index.
 *
 * The engine is storage-agnostic: callers pass a `SearchIndexReader`, which the app
 * implements with expo-sqlite and tests implement with `node:sqlite`.
 *
 * Index layout
 * - `search_translation_fts`: one row per (translation, verse) with normalized text.
 *   rowid = translationId * 10000 + verseId, so rows can be replaced or removed per
 *   translation without lookups.
 * - `search_arabic_fts`: one row per verse (rowid = verseId) with normalized Imlaei
 *   text and an Arabic light form. Display text comes from `offline_verses`.
 * - `search_translation_vocab` / `search_arabic_vocab`: fts5vocab views of those tables,
 *   read for each query word's document frequency (rare words weigh more in ranking).
 */

import { scoreSearchMatch } from './searchRanking';
import { getSearchSynonyms } from './searchSynonyms';
import {
  buildArabicFtsMatchExpression,
  buildArabicIndexColumns,
  buildFtsMatchExpression,
  canPrefixMatch,
  isArabicScriptToken,
  tokenizeSearchText,
} from './searchText';

export const SEARCH_TRANSLATION_FTS_TABLE = 'search_translation_fts';
export const SEARCH_ARABIC_FTS_TABLE = 'search_arabic_fts';
const SEARCH_TRANSLATION_VOCAB_TABLE = 'search_translation_vocab';
const SEARCH_ARABIC_VOCAB_TABLE = 'search_arabic_vocab';
export const TRANSLATION_INDEX_ROWID_FACTOR = 10_000;

// Text is pre-tokenized by `tokenizeSearchText`, which keeps only letters, numbers, and
// marks. Treating marks as token characters keeps Indic vowel signs inside words.
const FTS_TOKENIZER = `tokenize = "unicode61 remove_diacritics 0 categories 'L* N* M* Co'"`;

export const SEARCH_INDEX_DDL: readonly string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_TRANSLATION_FTS_TABLE} USING fts5(
    text,
    translation_id UNINDEXED,
    verse_key UNINDEXED,
    ${FTS_TOKENIZER}
  );`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_ARABIC_FTS_TABLE} USING fts5(
    imlaei,
    light,
    verse_key UNINDEXED,
    ${FTS_TOKENIZER}
  );`,
];

/** Term statistics views over the FTS tables. They store nothing themselves. */
export const SEARCH_VOCAB_DDL: readonly string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_TRANSLATION_VOCAB_TABLE} USING fts5vocab(${SEARCH_TRANSLATION_FTS_TABLE}, row);`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_ARABIC_VOCAB_TABLE} USING fts5vocab(${SEARCH_ARABIC_FTS_TABLE}, col);`,
];

/** Statement head for multi-row inserts; each row takes `buildTranslationIndexParams`. */
export const INSERT_TRANSLATION_INDEX_SQL = `INSERT OR REPLACE INTO ${SEARCH_TRANSLATION_FTS_TABLE}(rowid, text, translation_id, verse_key)`;
export const UPSERT_TRANSLATION_INDEX_SQL = `${INSERT_TRANSLATION_INDEX_SQL} VALUES (?, ?, ?, ?);`;
export const DELETE_TRANSLATION_INDEX_SQL = `DELETE FROM ${SEARCH_TRANSLATION_FTS_TABLE} WHERE rowid BETWEEN ? AND ?;`;
export const UPSERT_ARABIC_INDEX_SQL = `INSERT OR REPLACE INTO ${SEARCH_ARABIC_FTS_TABLE}(rowid, imlaei, light, verse_key) VALUES (?, ?, ?, ?);`;

export type SearchSqlParam = string | number;

export interface SearchIndexReader {
  getAll<T>(sql: string, params: readonly SearchSqlParam[]): Promise<T[]>;
}

export type LocalSearchMatch = {
  verseKey: string;
  verseId: number;
  surahNumber: number;
  verseNumber: number;
  source: 'arabic' | 'translation';
  /** Matched translation, or null for an Arabic match. */
  translationId: number | null;
  score: number;
};

export type LocalSearchDisplay = {
  arabicText: string;
  translationId: number | null;
  translationText: string;
};

const DEFAULT_CANDIDATE_LIMIT = 300;
// When requiring every word finds fewer verses than this, also accept partial matches.
const BROADEN_BELOW_COUNT = 20;
const PREFERRED_TRANSLATION_BONUS = 25;
// Floor for words that appear almost everywhere ("the"), so they still count a little.
const MIN_TERM_WEIGHT = 0.1;
// Above every valid character, so `term < prefix + this` bounds a prefix range.
const PREFIX_RANGE_END = '\u{10FFFF}';

export function getTranslationIndexRowId(translationId: number, verseId: number): number {
  return translationId * TRANSLATION_INDEX_ROWID_FACTOR + verseId;
}

/** Parameters for `DELETE_TRANSLATION_INDEX_SQL`: every rowid of one translation. */
export function getTranslationIndexRowRange(translationId: number): [number, number] {
  const start = translationId * TRANSLATION_INDEX_ROWID_FACTOR;
  return [start, start + TRANSLATION_INDEX_ROWID_FACTOR - 1];
}

/** Parameters for `UPSERT_TRANSLATION_INDEX_SQL`. */
export function buildTranslationIndexParams(
  translationId: number,
  verseId: number,
  verseKey: string,
  text: string
): SearchSqlParam[] {
  return [
    getTranslationIndexRowId(translationId, verseId),
    tokenizeSearchText(text).join(' '),
    translationId,
    verseKey,
  ];
}

/** Parameters for `UPSERT_ARABIC_INDEX_SQL`. */
export function buildArabicIndexParams(
  verseId: number,
  verseKey: string,
  imlaei: string
): SearchSqlParam[] {
  const columns = buildArabicIndexColumns(imlaei);
  return [verseId, columns.imlaei, columns.light, verseKey];
}

function parseVerseKey(verseKey: string): { surahNumber: number; verseNumber: number } {
  const [surah, verse] = verseKey.split(':');
  return {
    surahNumber: Number.parseInt(surah ?? '', 10) || 0,
    verseNumber: Number.parseInt(verse ?? '', 10) || 0,
  };
}

async function fetchCandidates<T extends { rowid: number; verse_key: string }>(
  reader: SearchIndexReader,
  sql: string,
  buildExpression: (mode: 'all' | 'any') => string,
  canBroaden: boolean,
  limit: number
): Promise<T[]> {
  const strict = await reader.getAll<T>(sql, [buildExpression('all'), limit]);
  // Count verses, not rows: several translations of one verse are one result.
  const strictVerseCount = new Set(strict.map((row) => row.verse_key)).size;
  if (!canBroaden || strictVerseCount >= BROADEN_BELOW_COUNT) return strict;

  const seen = new Set(strict.map((row) => row.rowid));
  const broad = await reader.getAll<T>(sql, [buildExpression('any'), limit]);
  return [...strict, ...broad.filter((row) => !seen.has(row.rowid))];
}

function toRetrievalRank(index: number, count: number): number {
  return count > 1 ? 1 - index / (count - 1) : 1;
}

export type SearchTermIndex = 'translation' | 'arabic';

/**
 * Inverse document frequency of each token in an index, aligned with `tokens`. A token
 * counts the documents of every word it matches: its prefix extensions and synonyms.
 * Returns undefined for an empty or unreadable index, so ranking falls back to word length
 * instead of failing the search.
 */
export async function loadSearchTermWeights(
  reader: SearchIndexReader,
  tokens: readonly string[],
  index: SearchTermIndex
): Promise<number[] | undefined> {
  if (tokens.length === 0) return undefined;
  try {
    return await readTermWeights(reader, tokens, index);
  } catch {
    return undefined;
  }
}

async function readTermWeights(
  reader: SearchIndexReader,
  tokens: readonly string[],
  index: SearchTermIndex
): Promise<number[] | undefined> {

  const table = index === 'arabic' ? SEARCH_ARABIC_FTS_TABLE : SEARCH_TRANSLATION_FTS_TABLE;
  const [countRow] = await reader.getAll<{ count: number }>(
    `SELECT count(*) AS count FROM ${table};`,
    []
  );
  const total = Number(countRow?.count ?? 0);
  if (total === 0) return undefined;

  const vocab =
    index === 'arabic'
      ? `${SEARCH_ARABIC_VOCAB_TABLE} WHERE col = 'imlaei' AND`
      : `${SEARCH_TRANSLATION_VOCAB_TABLE} WHERE`;
  const selects: string[] = [];
  const params: SearchSqlParam[] = [];
  tokens.forEach((token, tokenIndex) => {
    if (canPrefixMatch(token)) {
      selects.push(`SELECT ${tokenIndex} AS token_index, doc FROM ${vocab} term >= ? AND term < ?`);
      params.push(token, token + PREFIX_RANGE_END);
    } else {
      selects.push(`SELECT ${tokenIndex} AS token_index, doc FROM ${vocab} term = ?`);
      params.push(token);
    }
    if (index === 'arabic') return;
    for (const synonym of getSearchSynonyms(token)) {
      selects.push(`SELECT ${tokenIndex} AS token_index, doc FROM ${vocab} term = ?`);
      params.push(synonym);
    }
  });

  const rows = await reader.getAll<{ token_index: number; doc: number }>(
    `${selects.join(' UNION ALL ')};`,
    params
  );
  const documentCounts = new Array<number>(tokens.length).fill(0);
  for (const row of rows) {
    documentCounts[Number(row.token_index)]! += Number(row.doc);
  }

  // bm25's IDF. Prefix sums can double-count a document, so cap them at the total.
  return documentCounts.map((count) => {
    const documents = Math.min(count, total);
    return Math.max(MIN_TERM_WEIGHT, Math.log(1 + (total - documents + 0.5) / (documents + 0.5)));
  });
}

/** Term weights for re-ranking results of `query` outside the offline index. */
export function loadQueryTermWeights(
  reader: SearchIndexReader,
  query: string
): Promise<number[] | undefined> {
  const tokens = tokenizeSearchText(query);
  const index = tokens.every(isArabicScriptToken) ? 'arabic' : 'translation';
  return loadSearchTermWeights(reader, tokens, index);
}

/**
 * Searches installed translations and, for Arabic-script queries, the Arabic text.
 * Returns one best match per verse, best first.
 */
export async function searchLocalIndex(
  reader: SearchIndexReader,
  query: string,
  options: { preferredTranslationIds?: readonly number[]; candidateLimit?: number } = {}
): Promise<LocalSearchMatch[]> {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return [];

  const limit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const preferred = new Set(options.preferredTranslationIds ?? []);
  const arabicTokens = queryTokens.filter(isArabicScriptToken);
  const bestByVerse = new Map<string, LocalSearchMatch>();
  const translationWeights = await loadSearchTermWeights(reader, queryTokens, 'translation');

  const keep = (match: LocalSearchMatch): void => {
    const existing = bestByVerse.get(match.verseKey);
    if (!existing || match.score > existing.score) bestByVerse.set(match.verseKey, match);
  };

  const translationRows = await fetchCandidates<{
    rowid: number;
    translation_id: number;
    verse_key: string;
    text: string;
  }>(
    reader,
    `SELECT rowid, translation_id, verse_key, text
     FROM ${SEARCH_TRANSLATION_FTS_TABLE}
     WHERE ${SEARCH_TRANSLATION_FTS_TABLE} MATCH ?
     ORDER BY bm25(${SEARCH_TRANSLATION_FTS_TABLE})
     LIMIT ?;`,
    (mode) => buildFtsMatchExpression(queryTokens, mode),
    queryTokens.length > 1,
    limit
  );

  translationRows.forEach((row, index) => {
    const translationId = Number(row.translation_id);
    keep({
      verseKey: row.verse_key,
      verseId: row.rowid % TRANSLATION_INDEX_ROWID_FACTOR,
      ...parseVerseKey(row.verse_key),
      source: 'translation',
      translationId,
      score: scoreSearchMatch(queryTokens, {
        tokens: row.text.split(' '),
        retrievalRank: toRetrievalRank(index, translationRows.length),
        bonus: preferred.has(translationId) ? PREFERRED_TRANSLATION_BONUS : 0,
        termWeights: translationWeights,
      }),
    });
  });

  if (arabicTokens.length > 0) {
    const arabicWeights = await loadSearchTermWeights(reader, arabicTokens, 'arabic');
    const arabicRows = await fetchCandidates<{
      rowid: number;
      verse_key: string;
      imlaei: string;
    }>(
      reader,
      `SELECT rowid, verse_key, imlaei
       FROM ${SEARCH_ARABIC_FTS_TABLE}
       WHERE ${SEARCH_ARABIC_FTS_TABLE} MATCH ?
       ORDER BY bm25(${SEARCH_ARABIC_FTS_TABLE}, 2.0, 1.0)
       LIMIT ?;`,
      (mode) => buildArabicFtsMatchExpression(arabicTokens, mode),
      arabicTokens.length > 1,
      limit
    );

    arabicRows.forEach((row, index) => {
      keep({
        verseKey: row.verse_key,
        verseId: row.rowid,
        ...parseVerseKey(row.verse_key),
        source: 'arabic',
        translationId: null,
        score: scoreSearchMatch(arabicTokens, {
          tokens: row.imlaei.split(' '),
          retrievalRank: toRetrievalRank(index, arabicRows.length),
          termWeights: arabicWeights,
        }),
      });
    });
  }

  return [...bestByVerse.values()].sort((a, b) => b.score - a.score || a.verseId - b.verseId);
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

/**
 * Loads display text for matches: the Uthmani verse plus the matched translation, or
 * for Arabic matches the first preferred translation that is installed.
 * `getFallbackArabicText` covers verses missing from `offline_verses`, which only
 * holds verses of installed translations.
 */
export async function loadLocalSearchDisplay(
  reader: SearchIndexReader,
  matches: readonly LocalSearchMatch[],
  preferredTranslationIds: readonly number[],
  getFallbackArabicText: (verseKey: string) => string = () => ''
): Promise<Map<string, LocalSearchDisplay>> {
  const display = new Map<string, LocalSearchDisplay>();
  if (matches.length === 0) return display;

  const arabicRows = await reader.getAll<{ verse_key: string; arabic_uthmani: string }>(
    `SELECT verse_key, arabic_uthmani FROM offline_verses WHERE verse_key IN (${placeholders(matches.length)});`,
    matches.map((match) => match.verseKey)
  );
  const arabicByVerseKey = new Map(arabicRows.map((row) => [row.verse_key, row.arabic_uthmani]));

  const translationMatches = matches.filter((match) => match.translationId !== null);
  const translationRows =
    translationMatches.length > 0
      ? await reader.getAll<{ translation_id: number; verse_key: string; text: string }>(
          `SELECT translation_id, verse_key, text
           FROM offline_translations
           WHERE (translation_id, verse_key) IN (VALUES ${translationMatches.map(() => '(?, ?)').join(', ')});`,
          translationMatches.flatMap((match) => [match.translationId!, match.verseKey])
        )
      : [];
  const translationByKey = new Map(
    translationRows.map((row) => [`${row.translation_id}|${row.verse_key}`, row.text])
  );

  const arabicMatches = matches.filter((match) => match.translationId === null);
  const fallbackIds = preferredTranslationIds.filter((id) => Number.isFinite(id) && id > 0);
  const fallbackRows =
    arabicMatches.length > 0 && fallbackIds.length > 0
      ? await reader.getAll<{ translation_id: number; verse_key: string; text: string }>(
          `SELECT translation_id, verse_key, text
           FROM offline_translations
           WHERE translation_id IN (${placeholders(fallbackIds.length)})
             AND verse_key IN (${placeholders(arabicMatches.length)});`,
          [...fallbackIds, ...arabicMatches.map((match) => match.verseKey)]
        )
      : [];
  const fallbackByVerse = new Map<string, { translationId: number; text: string }>();
  for (const id of fallbackIds) {
    for (const row of fallbackRows) {
      if (Number(row.translation_id) === id && !fallbackByVerse.has(row.verse_key)) {
        fallbackByVerse.set(row.verse_key, { translationId: id, text: row.text });
      }
    }
  }

  for (const match of matches) {
    const translation =
      match.translationId !== null
        ? {
            translationId: match.translationId,
            text: translationByKey.get(`${match.translationId}|${match.verseKey}`) ?? '',
          }
        : fallbackByVerse.get(match.verseKey);
    display.set(match.verseKey, {
      arabicText: arabicByVerseKey.get(match.verseKey) || getFallbackArabicText(match.verseKey),
      translationId: translation?.translationId ?? null,
      translationText: translation?.text ?? '',
    });
  }

  return display;
}

// ============================================================================
// Surah name navigation
// ============================================================================

export type SurahNameEntry = {
  id: number;
  name_simple: string;
  name_arabic: string;
  translated_name?: { name: string };
};

export type SurahNameMatch = { surahId: number; name: string };

const LATIN_ARTICLES = new Set(['al', 'an', 'ar', 'as', 'ash', 'at', 'ath', 'ad', 'adh', 'az']);
const TRANSLATED_NAME_STOPWORDS = new Set(['the', 'of', 'a', 'an']);
const SURAH_WORD_PATTERN = /^(?:surah|surat|sura|chapter|سورة|سوره)\s+/i;

function compact(text: string): string {
  return tokenizeSearchText(text).join('');
}

// Consonant outline so transliteration variants (baqara/baqarah, yasin/yaseen) meet.
function consonantSkeleton(text: string): string {
  const value = compact(text);
  if (!value) return '';
  return (value[0] + value.slice(1).replace(/[aeiouy]/g, ''))
    .replace(/(.)\1+/g, '$1')
    .replace(/h$/, '');
}

function getSurahNameKeys(chapter: SurahNameEntry): { latin: string[]; arabic: string[] } {
  const simpleTokens = tokenizeSearchText(chapter.name_simple);
  const latin = [simpleTokens.join('')];
  if (simpleTokens.length > 1 && LATIN_ARTICLES.has(simpleTokens[0]!)) {
    latin.push(simpleTokens.slice(1).join(''));
  }
  for (const word of tokenizeSearchText(chapter.translated_name?.name ?? '')) {
    if (!TRANSLATED_NAME_STOPWORDS.has(word)) latin.push(word);
  }

  const arabicName = compact(chapter.name_arabic);
  const arabic = [arabicName];
  if (arabicName.startsWith('ال') && arabicName.length > 3) arabic.push(arabicName.slice(2));
  return { latin, arabic };
}

/** Matches surah names in Latin transliteration, English meaning, or Arabic. */
export function findSurahNameMatches(
  query: string,
  chapters: readonly SurahNameEntry[],
  limit = 5
): SurahNameMatch[] {
  const stripped = query.trim().replace(SURAH_WORD_PATTERN, '');
  const queryKey = compact(stripped);
  if (Array.from(queryKey).length < 3) return [];

  const isArabic = isArabicScriptToken(queryKey);
  const querySkeleton = isArabic ? '' : consonantSkeleton(stripped);

  const scored: Array<{ chapter: SurahNameEntry; score: number }> = [];
  for (const chapter of chapters) {
    const keys = getSurahNameKeys(chapter);
    let score = 0;
    for (const key of isArabic ? keys.arabic : keys.latin) {
      if (key === queryKey) score = Math.max(score, 3);
      else if (key.startsWith(queryKey)) score = Math.max(score, 2);
      else if (
        !isArabic &&
        querySkeleton.length >= 2 &&
        consonantSkeleton(key).startsWith(querySkeleton)
      ) {
        score = Math.max(score, 1);
      }
    }
    if (score > 0) scored.push({ chapter, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.chapter.id - b.chapter.id)
    .slice(0, limit)
    .map(({ chapter }) => {
      const meaning = chapter.translated_name?.name ?? '';
      // Some meanings only repeat the transliteration (Ya-Sin / Ya Sin).
      const showMeaning = meaning && compact(meaning) !== compact(chapter.name_simple);
      return {
        surahId: chapter.id,
        name: showMeaning ? `${chapter.name_simple} (${meaning})` : chapter.name_simple,
      };
    });
}
