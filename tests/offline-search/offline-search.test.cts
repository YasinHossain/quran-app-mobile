declare function require(id: string): any;
declare const __dirname: string;

const assert = require('node:assert/strict') as {
  equal(actual: unknown, expected: unknown, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): void;
};
const test = require('node:test') as (name: string, callback: () => unknown) => void;
const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string): string[];
};
const path = require('node:path') as { join(...parts: string[]): string };
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (location: string) => {
    exec(sql: string): void;
    prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown };
  };
};

import {
  DELETE_TRANSLATION_INDEX_SQL,
  INSERT_TRANSLATION_INDEX_SQL,
  SEARCH_INDEX_DDL,
  SEARCH_TRANSLATION_FTS_TABLE,
  SEARCH_VOCAB_DDL,
  UPSERT_ARABIC_INDEX_SQL,
  UPSERT_TRANSLATION_INDEX_SQL,
  buildArabicIndexParams,
  buildTranslationIndexParams,
  findSurahNameMatches,
  getTranslationIndexRowRange,
  loadLocalSearchDisplay,
  searchLocalIndex,
  type SearchIndexReader,
} from '../../lib/search/localSearchEngine.js';
import { getExactNavigationResult } from '../../lib/api/search.js';
import { insertRowsAsync } from '../../src/core/infrastructure/db/insertRows.js';
import { rankSearchResults, scoreSearchMatch } from '../../lib/search/searchRanking.js';
import { SEARCH_SYNONYM_GROUPS } from '../../lib/search/searchSynonyms.js';
import {
  highlightSearchMatches,
  toArabicLightForm,
  tokenizeSearchText,
} from '../../lib/search/searchText.js';

// Compiled to .artifacts/offline-search-tests/tests/offline-search, four levels below the root.
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const readJson = (relativePath: string): any =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

type TranslationPack = { verses: Array<{ verseKey: string; arabicUthmani: string; text: string }> };

const readTranslationPack = (translationId: number): TranslationPack => {
  const dir = path.join('dist/translation-packs/translations', String(translationId));
  const [version] = fs.readdirSync(path.join(ROOT, dir));
  return readJson(path.join(dir, version!, 'payload.json')) as TranslationPack;
};

const SAHEEH_ID = 20;
const saheeh = readTranslationPack(SAHEEH_ID);
// More English translations, so ranking is tested across several wordings of each verse:
// Bridges, Maududi, and Hilali & Khan.
const OTHER_TRANSLATION_IDS = [149, 95, 203];
const imlaei = readJson('src/data/search/quran-imlaei.json') as { chapters: string[][] };
const chapters = readJson('src/data/chapters.en.json');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE offline_verses(
    verse_key TEXT PRIMARY KEY NOT NULL,
    arabic_uthmani TEXT NOT NULL
  );
  CREATE TABLE offline_translations(
    translation_id INTEGER NOT NULL,
    verse_key TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY(translation_id, verse_key)
  );
`);
for (const statement of [...SEARCH_INDEX_DDL, ...SEARCH_VOCAB_DDL]) db.exec(statement);

const insertVerse = db.prepare('INSERT INTO offline_verses(verse_key, arabic_uthmani) VALUES (?, ?)');
const insertTranslation = db.prepare(
  'INSERT INTO offline_translations(translation_id, verse_key, text) VALUES (?, ?, ?)'
);
const upsertTranslationIndex = db.prepare(UPSERT_TRANSLATION_INDEX_SQL);
const upsertArabicIndex = db.prepare(UPSERT_ARABIC_INDEX_SQL);
const imlaeiVerses = imlaei.chapters.flat();

db.exec('BEGIN');
saheeh.verses.forEach((verse, index) => {
  const verseId = index + 1;
  insertVerse.run(verse.verseKey, verse.arabicUthmani);
  insertTranslation.run(SAHEEH_ID, verse.verseKey, verse.text);
  upsertTranslationIndex.run(...buildTranslationIndexParams(SAHEEH_ID, verseId, verse.verseKey, verse.text));
  upsertArabicIndex.run(...buildArabicIndexParams(verseId, verse.verseKey, imlaeiVerses[index]!));
});
for (const translationId of OTHER_TRANSLATION_IDS) {
  readTranslationPack(translationId).verses.forEach((verse, index) => {
    insertTranslation.run(translationId, verse.verseKey, verse.text);
    upsertTranslationIndex.run(
      ...buildTranslationIndexParams(translationId, index + 1, verse.verseKey, verse.text)
    );
  });
}
db.exec('COMMIT');

const reader: SearchIndexReader = {
  async getAll<T>(sql: string, params: readonly (string | number)[]): Promise<T[]> {
    return db.prepare(sql).all(...params) as T[];
  },
};

async function topVerseKeys(query: string, count: number): Promise<string[]> {
  const matches = await searchLocalIndex(reader, query, { preferredTranslationIds: [SAHEEH_ID] });
  return matches.slice(0, count).map((match) => match.verseKey);
}

test('bundled texts line up verse for verse', () => {
  assert.equal(saheeh.verses.length, 6236);
  assert.equal(imlaeiVerses.length, 6236);
  imlaei.chapters.forEach((verses, index) => {
    assert.equal(verses.length, chapters[index].verses_count, `surah ${index + 1} verse count`);
  });
});

test('normalization ignores footnote markers, diacritics, and Arabic spelling variants', () => {
  assert.deepEqual(tokenizeSearchText('In the name of Allāh, 1 the Entirely Merciful. 2'), [
    'in', 'the', 'name', 'of', 'allah', 'the', 'entirely', 'merciful',
  ]);
  assert.deepEqual(tokenizeSearchText('রহমান, রহীম [১]'), ['রহমান', 'রহীম']);
  // Uthmani and Imlaei spellings of the same word share a light form.
  const [uthmani] = tokenizeSearchText('ٱلْعَـٰلَمِينَ');
  const [imlaeiWord] = tokenizeSearchText('الْعَالَمِينَ');
  assert.equal(toArabicLightForm(uthmani!), toArabicLightForm(imlaeiWord!));
  assert.deepEqual(tokenizeSearchText('قُلْ هُوَ ٱللَّهُ أَحَدٌ'), ['قل', 'هو', 'الله', 'احد']);
});

test('ranks the expected verse first for well-known English phrases', async () => {
  const cases: Array<[string, string]> = [
    ['light upon light', '24:35'],
    ['no compulsion in religion', '2:256'],
    ['say he is allah one', '112:1'],
    ['created man in the best of stature', '95:4'],
    ['allah the entirely merciful', '1:1'],
  ];
  for (const [query, expected] of cases) {
    const [top] = await topVerseKeys(query, 1);
    assert.equal(top, expected, `"${query}"`);
  }
});

test('rare words outweigh common ones, and word extensions count less than the word', async () => {
  // Several translations word 40:49 "call upon your Lord to lighten", which is not about
  // light. Counting a verse once per translation also used to stop partial matches.
  const top = await topVerseKeys('light upon light', 10);
  assert.equal(top[0], '24:35');
  assert.ok(!top.includes('40:49'), `40:49 ranked in ${top.join(', ')}`);
});

test('falls back to partial matches when no verse has every word', async () => {
  // "comes" is not in Saheeh International's wording of 94:5-6.
  const top = await topVerseKeys('with hardship comes ease', 2);
  assert.deepEqual([...top].sort(), ['94:5', '94:6']);
});

test('prefix matching finds plural and inflected forms', async () => {
  const matches = await searchLocalIndex(reader, 'prophet');
  const display = await loadLocalSearchDisplay(reader, matches.slice(0, 200), [SAHEEH_ID]);
  const texts = [...display.values()].map((entry) => entry.translationText.toLowerCase());
  assert.ok(texts.some((text) => /\bprophets\b/.test(text)), 'includes "prophets"');
});

test('ranks Arabic queries typed in modern spelling against the Quran text', async () => {
  assert.equal((await topVerseKeys('الحمد لله رب العالمين', 1))[0], '1:2');
  assert.equal((await topVerseKeys('قل هو الله احد', 1))[0], '112:1');
  assert.ok((await topVerseKeys('العالمين', 100)).includes('1:2'));
});

test('loads Uthmani display text and a translation for Arabic matches', async () => {
  // Pasted Uthmani text matches the Imlaei index through the light form.
  assert.equal((await topVerseKeys('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ', 1))[0], '1:2');

  const matches = await searchLocalIndex(reader, 'قل هو الله احد', {
    preferredTranslationIds: [SAHEEH_ID],
  });
  const display = await loadLocalSearchDisplay(reader, matches.slice(0, 1), [SAHEEH_ID]);
  const entry = display.get('112:1');
  assert.equal(entry?.arabicText, saheeh.verses.find((verse) => verse.verseKey === '112:1')?.arabicUthmani);
  assert.equal(entry?.translationId, SAHEEH_ID);
  assert.ok(entry?.translationText.startsWith('Say'));
});

test('removing a translation removes it from search', async () => {
  const removedId = 999;
  insertTranslation.run(removedId, '1:1', 'zzqx marker text');
  upsertTranslationIndex.run(...buildTranslationIndexParams(removedId, 1, '1:1', 'zzqx marker text'));
  assert.equal((await searchLocalIndex(reader, 'zzqx')).length, 1);

  db.prepare(DELETE_TRANSLATION_INDEX_SQL).run(...getTranslationIndexRowRange(removedId));
  assert.equal((await searchLocalIndex(reader, 'zzqx')).length, 0);
  assert.ok((await searchLocalIndex(reader, 'light upon light')).length > 0, 'other rows remain');
});

test('multi-row pack imports keep every verse across statement chunks', async () => {
  const importDb = new DatabaseSync(':memory:');
  importDb.exec(`CREATE TABLE offline_translations(
    translation_id INTEGER NOT NULL,
    verse_key TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY(translation_id, verse_key)
  );`);
  for (const statement of SEARCH_INDEX_DDL) importDb.exec(statement);
  const runner = {
    runAsync: async (sql: string, params: unknown[]) => importDb.prepare(sql).run(...params),
  } as unknown as Parameters<typeof insertRowsAsync>[0];
  const importTranslation = (suffix: string) =>
    insertRowsAsync(
      runner,
      {
        insert: 'INSERT INTO offline_translations(translation_id, verse_key, text)',
        suffix: 'ON CONFLICT(translation_id, verse_key) DO UPDATE SET text = excluded.text',
      },
      saheeh.verses.map((verse) => [SAHEEH_ID, verse.verseKey, `${verse.text}${suffix}`])
    );

  await importTranslation('');
  await importTranslation(' (updated)');
  await insertRowsAsync(
    runner,
    { insert: INSERT_TRANSLATION_INDEX_SQL },
    saheeh.verses.map((verse, index) =>
      buildTranslationIndexParams(SAHEEH_ID, index + 1, verse.verseKey, verse.text)
    )
  );

  const rows = importDb
    .prepare('SELECT verse_key, text FROM offline_translations ORDER BY rowid')
    .all() as Array<{ verse_key: string; text: string }>;
  assert.equal(rows.length, 6236);
  assert.equal(rows.at(-1)?.verse_key, '114:6');
  assert.ok(rows.every((row) => row.text.endsWith(' (updated)')), 'upsert replaced every row');
  const importReader: SearchIndexReader = {
    async getAll<T>(sql: string, params: readonly (string | number)[]): Promise<T[]> {
      return importDb.prepare(sql).all(...params) as T[];
    },
  };
  const matches = await searchLocalIndex(importReader, 'from among the jinn and mankind');
  assert.ok(matches.some((match) => match.verseKey === '114:6'), 'the final chunk is searchable');
  const [indexed] = importDb
    .prepare(`SELECT COUNT(*) AS count FROM ${SEARCH_TRANSLATION_FTS_TABLE}`)
    .all() as Array<{ count: number }>;
  assert.equal((indexed as { count: number }).count, 6236);
});

test('synonyms find names and terms that translations spell differently', async () => {
  const matches = await searchLocalIndex(reader, 'musa', { preferredTranslationIds: [SAHEEH_ID] });
  const display = await loadLocalSearchDisplay(reader, matches.slice(0, 10), [SAHEEH_ID]);
  assert.ok(matches.length >= 100, `found ${matches.length} verses`);
  assert.ok([...display.values()].every((entry) => /\bmoses\b/i.test(entry.translationText)));
  assert.equal(
    highlightSearchMatches('And Moses said to his people', tokenizeSearchText('musa')),
    'And <em>Moses</em> said to his people'
  );

  // The word the reader typed still scores above its synonym.
  const score = (text: string): number =>
    scoreSearchMatch(tokenizeSearchText('musa'), { tokens: tokenizeSearchText(text) });
  assert.ok(score('And Musa said to his people') > score('And Moses said to his people'));
});

test('synonym entries are normalized single words in one group each', () => {
  const seen = new Set<string>();
  for (const group of SEARCH_SYNONYM_GROUPS) {
    for (const term of group) {
      assert.deepEqual(tokenizeSearchText(term), [term], `"${term}" is not a normalized token`);
      assert.ok(!seen.has(term), `"${term}" is in more than one group`);
      seen.add(term);
    }
  }
});

test('user input cannot inject FTS syntax', async () => {
  for (const query of ['"', 'light" OR "x', 'NEAR(light', '*', 'light AND']) {
    await searchLocalIndex(reader, query);
  }
});

test('highlights words matched by prefix and Arabic variants', () => {
  assert.equal(
    highlightSearchMatches('The prophets & messengers', tokenizeSearchText('prophet')),
    'The <em>prophets</em> & messengers'
  );
  assert.equal(
    highlightSearchMatches('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ', tokenizeSearchText('العالمين')),
    'ٱلْحَمْدُ لِلَّهِ رَبِّ <em>ٱلْعَـٰلَمِينَ</em>'
  );
});

test('online results are re-ranked with the same scorer', () => {
  const ranked = rankSearchResults(
    [
      { key: 'a', text: 'And Allah is the Light of the heavens' },
      { key: 'b', text: 'Light upon light. Allah guides to His light whom He wills' },
    ],
    'light upon light',
    (item) => item.text
  );
  assert.equal(ranked[0]?.key, 'b');
});

test('matches surah names across transliteration variants, meanings, and Arabic', () => {
  const top = (query: string): number | undefined => findSurahNameMatches(query, chapters)[0]?.surahId;
  assert.equal(top('baqara'), 2);
  assert.equal(top('yaseen'), 36);
  assert.equal(top('surah kahf'), 18);
  assert.equal(top('cow'), 2);
  assert.equal(top('الكهف'), 18);
  assert.equal(top('fatiha'), 1);
  assert.deepEqual(findSurahNameMatches('the', chapters), []);
});

test('navigates from references typed in English or Bangla', () => {
  const target = (query: string): string | null => {
    const result = getExactNavigationResult(query);
    return result ? `${result.resultType} ${result.key}` : null;
  };
  assert.equal(target('juz 30'), 'juz 30');
  assert.equal(target('para 30'), 'juz 30');
  assert.equal(target('পারা ৩০'), 'juz 30');
  assert.equal(target('৩০ পারা'), 'juz 30');
  assert.equal(target('১ম পারা'), 'juz 1');
  assert.equal(target('২য় পারা'), 'juz 2');
  // য় and ড় typed as a base letter plus nukta.
  assert.equal(target('২য\u09BC পারা'), 'juz 2');
  assert.equal(target('পাড\u09BCা ৫'), 'juz 5');
  assert.equal(target('পৃষ্ঠা ৫০'), 'page 50');
  assert.equal(target('৫০ নং পৃষ্ঠা'), 'page 50');
  assert.equal(target('p50'), 'page 50');
  assert.equal(target('সূরা ৩৬'), 'surah 36');
  assert.equal(target('সুরা 36'), 'surah 36');
  assert.equal(target('২:২৫৫'), 'ayah 2:255');
  assert.equal(target('পারা ৩১'), null);
  assert.equal(target('পারা'), null);
});
