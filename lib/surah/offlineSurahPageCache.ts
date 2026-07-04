import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import { preloadTajweedGlyphRunFontsAsync, type TajweedGlyphRun } from '@/components/surah/TajweedNativeText';
import Colors from '@/constants/Colors';
import { TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { getAppDbSync } from '@/src/core/infrastructure/db';
import { container } from '@/src/core/infrastructure/di/container';
import {
  getExactPackPageFontFamily,
  getExactPackPageFontRelativePath,
} from '@/src/core/infrastructure/mushaf/downloadablePacks';
import type { MushafVerse, VerseWord } from '@/types';

export const DEFAULT_SURAH_VERSES_PER_PAGE = 30;

type SurahPageCacheSettings = {
  translationIds?: number[] | null;
  translationId?: number | null;
  tajweed?: boolean | null;
  wordLang?: string | null;
};

type CacheEntry = {
  value: Promise<OfflineVerseWithTranslations[]>;
  snapshot?: OfflineVerseWithTranslations[];
  timestamp: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGE_CACHE_SIZE = 64;
const MAX_SURAH_CACHE_SIZE = 16;

const surahPageCache = new Map<string, CacheEntry>();
const surahCache = new Map<string, CacheEntry>();
const tajweedGlyphRunsByVerseKey = new Map<string, TajweedGlyphRun[]>();
let activeTajweedPackVersionSnapshot = findMushafOption(TAJWEED_MUSHAF_ID)?.version ?? 'v4-ttf';

function normalizePositiveInt(value: number | undefined | null): number {
  const numericValue = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(numericValue)) return 0;
  const normalized = Math.trunc(numericValue);
  return normalized > 0 ? normalized : 0;
}

export function getSelectedTranslationIds(settings: SurahPageCacheSettings): number[] {
  const ids = Array.isArray(settings.translationIds)
    ? settings.translationIds
    : [settings.translationId ?? 20];

  const ordered: number[] = [];
  const seen = new Set<number>();

  for (const id of ids) {
    const normalized = normalizePositiveInt(id);
    if (normalized <= 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

export function getSurahPageNumber(
  verseNumber?: number,
  perPage = DEFAULT_SURAH_VERSES_PER_PAGE
): number {
  const resolvedPerPage = normalizePositiveInt(perPage) || DEFAULT_SURAH_VERSES_PER_PAGE;
  const resolvedVerseNumber = normalizePositiveInt(verseNumber) || 1;
  return Math.max(1, Math.floor((resolvedVerseNumber - 1) / resolvedPerPage) + 1);
}

function normalizeTranslationIds(translationIds: number[]): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();

  for (const id of translationIds ?? []) {
    const normalized = normalizePositiveInt(id);
    if (normalized <= 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function hasRequestedTranslations(
  verses: OfflineVerseWithTranslations[],
  translationIds: number[]
): boolean {
  const resolvedTranslationIds = normalizeTranslationIds(translationIds);
  if (resolvedTranslationIds.length === 0) return true;

  return verses.every((verse) => {
    const availableIds = new Set(
      verse.translations
        .map((translation) => normalizePositiveInt(translation.translationId))
        .filter((translationId) => translationId > 0)
    );

    return resolvedTranslationIds.every((translationId) => availableIds.has(translationId));
  });
}

function canCacheOfflineVerses(
  verses: OfflineVerseWithTranslations[],
  translationIds: number[],
  expectedVerseCount?: number
): boolean {
  if (
    typeof expectedVerseCount === 'number' &&
    expectedVerseCount > 0 &&
    verses.length < expectedVerseCount
  ) {
    return false;
  }

  return verses.length > 0 && hasRequestedTranslations(verses, translationIds);
}

function getPageCacheKey(params: {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
  wordLang?: string;
}): string {
  return [
    normalizePositiveInt(params.surahId),
    normalizeTranslationIds(params.translationIds).join(','),
    normalizeWordLanguageCode(params.wordLang),
    normalizePositiveInt(params.page),
    normalizePositiveInt(params.perPage),
  ].join('|');
}

function getSurahCacheKey(params: {
  surahId: number;
  translationIds: number[];
  wordLang?: string;
}): string {
  return [
    normalizePositiveInt(params.surahId),
    normalizeTranslationIds(params.translationIds).join(','),
    normalizeWordLanguageCode(params.wordLang),
  ].join('|');
}

function normalizeWordLanguageCode(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || 'en';
}

function pruneCache(cache: Map<string, CacheEntry>, maxSize: number, now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      cache.delete(key);
    }
  }

  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function resolvePageParams(params: {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
  wordLang?: string;
}): {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
  wordLang: string;
} | null {
  const surahId = normalizePositiveInt(params.surahId);
  const page = normalizePositiveInt(params.page);
  const perPage = normalizePositiveInt(params.perPage);

  if (surahId <= 0 || page <= 0 || perPage <= 0) {
    return null;
  }

  return {
    surahId,
    translationIds: normalizeTranslationIds(params.translationIds),
    page,
    perPage,
    wordLang: normalizeWordLanguageCode(params.wordLang),
  };
}

function resolveSurahParams(params: {
  surahId: number;
  translationIds: number[];
  wordLang?: string;
}): {
  surahId: number;
  translationIds: number[];
  wordLang: string;
} | null {
  const surahId = normalizePositiveInt(params.surahId);
  if (surahId <= 0) return null;

  return {
    surahId,
    translationIds: normalizeTranslationIds(params.translationIds),
    wordLang: normalizeWordLanguageCode(params.wordLang),
  };
}

function getFreshSnapshot(cache: Map<string, CacheEntry>, key: string): OfflineVerseWithTranslations[] | null {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  if (!cached.snapshot) return null;

  cache.delete(key);
  cache.set(key, cached);
  return cached.snapshot;
}

function sliceSurahPage(params: {
  surahVerses: OfflineVerseWithTranslations[];
  page: number;
  perPage: number;
}): OfflineVerseWithTranslations[] {
  const offset = (params.page - 1) * params.perPage;
  return params.surahVerses.slice(offset, offset + params.perPage);
}

async function resolveActiveTajweedPackVersion(): Promise<string> {
  try {
    const activeInstall = await container
      .getMushafPackInstallRegistry()
      .getActive(TAJWEED_MUSHAF_ID);
    const activeVersion = activeInstall?.version?.trim();
    if (activeVersion) {
      activeTajweedPackVersionSnapshot = activeVersion;
      return activeVersion;
    }
  } catch {}

  return activeTajweedPackVersionSnapshot;
}

function getTajweedFontAssetForPage(
  pageNumber: number,
  version: string
): Pick<TajweedGlyphRun, 'fontFamily' | 'fontFileUri'> | null {
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;

  const normalizedPageNumber = Math.trunc(pageNumber);
  const fontRelativePath = getExactPackPageFontRelativePath(
    TAJWEED_MUSHAF_ID,
    normalizedPageNumber
  );
  if (!fontRelativePath) return null;

  return {
    fontFamily: getExactPackPageFontFamily(normalizedPageNumber, 'v4'),
    fontFileUri: container
      .getMushafPackFileStore()
      .getInstalledFileUri(TAJWEED_MUSHAF_ID, version, fontRelativePath),
  };
}

function parseVerseWordsJson(wordsJson?: string): VerseWord[] | null {
  if (!wordsJson) return null;

  try {
    const words = JSON.parse(wordsJson) as VerseWord[];
    return Array.isArray(words) ? words : null;
  } catch {
    return null;
  }
}

function buildTajweedGlyphRunsFromWords(
  words: VerseWord[] | null,
  version: string
): TajweedGlyphRun[] {
  if (!Array.isArray(words) || words.length === 0) return [];

  const glyphRuns: Array<TajweedGlyphRun & { pageNumber: number }> = [];
  let currentRun: (TajweedGlyphRun & { pageNumber: number }) | null = null;
  const orderedWords = words.slice().sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

  for (const word of orderedWords) {
    const glyph = word.codeV2?.trim();
    if (!glyph) continue;

    const pageNumber = word.pageNumber;
    if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber) || pageNumber <= 0) {
      continue;
    }

    const normalizedPageNumber = Math.trunc(pageNumber);
    if (!currentRun || currentRun.pageNumber !== normalizedPageNumber) {
      const fontAsset = getTajweedFontAssetForPage(normalizedPageNumber, version);
      if (!fontAsset) continue;

      currentRun = {
        ...fontAsset,
        pageNumber: normalizedPageNumber,
        glyphs: [],
      };
      glyphRuns.push(currentRun);
    }

    currentRun.glyphs.push(glyph);
  }

  return glyphRuns.map(({ pageNumber: _pageNumber, ...glyphRun }) => glyphRun);
}

function buildTajweedGlyphRunsFromMushafWords(
  words: MushafVerse['words'],
  version: string
): TajweedGlyphRun[] {
  return buildTajweedGlyphRunsFromWords(
    words.map((word, index) => ({
      id: typeof word.id === 'number' ? word.id : index + 1,
      ...(typeof word.position === 'number' ? { position: word.position } : {}),
      uthmani: word.textUthmani ?? word.textQpcHafs ?? word.textIndopak ?? '',
      ...(typeof word.charType === 'string' ? { charTypeName: word.charType } : {}),
      ...(typeof word.codeV2 === 'string' ? { codeV2: word.codeV2 } : {}),
      ...(typeof word.pageNumber === 'number' ? { pageNumber: word.pageNumber } : {}),
    })),
    version
  );
}

function writeTajweedGlyphRunsCache(verseKey: string, glyphRuns: TajweedGlyphRun[]): void {
  const normalizedVerseKey = verseKey.trim();
  if (!normalizedVerseKey || glyphRuns.length === 0) return;
  tajweedGlyphRunsByVerseKey.set(normalizedVerseKey, glyphRuns);
}

export function peekCachedTajweedGlyphRuns(verseKey: string): TajweedGlyphRun[] | undefined {
  return tajweedGlyphRunsByVerseKey.get(verseKey.trim());
}

async function seedTajweedGlyphRunsFromMushafPack(
  verses: OfflineVerseWithTranslations[],
  version: string
): Promise<void> {
  const missingVerseKeys = verses
    .map((verse) => verse.verseKey.trim())
    .filter((verseKey) => verseKey.length > 0 && !tajweedGlyphRunsByVerseKey.has(verseKey));

  if (missingVerseKeys.length === 0) return;

  const repository = container.getMushafPageRepository();
  const firstVerseKey = missingVerseKeys[0];
  const lastVerseKey = missingVerseKeys[missingVerseKeys.length - 1] ?? firstVerseKey;
  if (!firstVerseKey || !lastVerseKey) return;

  const [firstPageNumber, lastPageNumber] = await Promise.all([
    repository.findPageForVerse({
      packId: TAJWEED_MUSHAF_ID,
      verseKey: firstVerseKey,
    }),
    repository.findPageForVerse({
      packId: TAJWEED_MUSHAF_ID,
      verseKey: lastVerseKey,
    }),
  ]);

  if (!firstPageNumber || !lastPageNumber) return;

  const startPageNumber = Math.min(firstPageNumber, lastPageNumber);
  const endPageNumber = Math.max(firstPageNumber, lastPageNumber);
  const missingVerseKeySet = new Set(missingVerseKeys);

  await Promise.all(
    Array.from(
      { length: endPageNumber - startPageNumber + 1 },
      (_value, index) => startPageNumber + index
    ).map(async (pageNumber) => {
      const pageData = await repository.getPage({
        packId: TAJWEED_MUSHAF_ID,
        pageNumber,
      });

      for (const mushafVerse of pageData.verses) {
        if (!missingVerseKeySet.has(mushafVerse.verseKey)) continue;
        writeTajweedGlyphRunsCache(
          mushafVerse.verseKey,
          buildTajweedGlyphRunsFromMushafWords(mushafVerse.words, version)
        );
      }
    })
  );
}

async function preloadTajweedFontsForOfflineVerses(
  verses: OfflineVerseWithTranslations[]
): Promise<void> {
  if (verses.length === 0) return;

  const version = await resolveActiveTajweedPackVersion();
  for (const verse of verses) {
    const glyphRuns = buildTajweedGlyphRunsFromWords(parseVerseWordsJson(verse.wordsJson), version);
    writeTajweedGlyphRunsCache(verse.verseKey, glyphRuns);
  }

  await seedTajweedGlyphRunsFromMushafPack(verses, version);

  const glyphRuns = verses.flatMap((verse) => peekCachedTajweedGlyphRuns(verse.verseKey) ?? []);

  await preloadTajweedGlyphRunFontsAsync(glyphRuns);
  await preloadTajweedGlyphRunFontsAsync(glyphRuns, {
    resolvedTheme: 'dark',
    textColor: Colors.dark.text,
  });
}

function seedPageCacheFromSurah(params: {
  surahId: number;
  translationIds: number[];
  perPage: number;
  expectedVerseCount?: number;
  surahVerses: OfflineVerseWithTranslations[];
}): void {
  const resolved = resolvePageParams({
    surahId: params.surahId,
    translationIds: params.translationIds,
    page: 1,
    perPage: params.perPage,
  });
  if (!resolved) return;
  if (
    !canCacheOfflineVerses(
      params.surahVerses,
      resolved.translationIds,
      params.expectedVerseCount
    )
  ) {
    return;
  }

  const now = Date.now();
  for (
    let offset = 0, page = 1;
    offset < params.surahVerses.length;
    offset += resolved.perPage, page += 1
  ) {
    const pageVerses = params.surahVerses.slice(offset, offset + resolved.perPage);
    const key = getPageCacheKey({ ...resolved, page });
    surahPageCache.set(key, {
      value: Promise.resolve(pageVerses),
      snapshot: pageVerses,
      timestamp: now,
    });
  }

  pruneCache(surahPageCache, MAX_PAGE_CACHE_SIZE, now);
}

function mapJoinedRowsToOfflineVerses(
  rows: Array<{
    verse_key: string;
    surah: number;
    ayah: number;
    arabic_uthmani: string;
    words_json: string | null;
    translation_id: number | null;
    translation_text: string | null;
  }>,
  resolvedTranslationIds: number[]
): OfflineVerseWithTranslations[] {
  const byVerseKey = new Map<
    string,
    {
      verseKey: string;
      surahId: number;
      ayahNumber: number;
      arabicUthmani: string;
      wordsJson?: string;
      translationsById: Map<number, string>;
    }
  >();
  const verseOrder: string[] = [];

  for (const row of rows) {
    let existing = byVerseKey.get(row.verse_key);
    if (!existing) {
      existing = {
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
        wordsJson: row.words_json || undefined,
        translationsById: new Map<number, string>(),
      };
      byVerseKey.set(row.verse_key, existing);
      verseOrder.push(row.verse_key);
    }

    if (row.translation_id !== null && row.translation_text !== null) {
      existing.translationsById.set(row.translation_id, row.translation_text);
    }
  }

  return verseOrder
    .map((verseKey) => byVerseKey.get(verseKey))
    .filter((verse): verse is NonNullable<typeof verse> => Boolean(verse))
    .map((verse) => ({
      verseKey: verse.verseKey,
      surahId: verse.surahId,
      ayahNumber: verse.ayahNumber,
      arabicUthmani: verse.arabicUthmani,
      wordsJson: verse.wordsJson,
      translations: resolvedTranslationIds
        .map((translationId) => {
          const text = verse.translationsById.get(translationId);
          if (!text) return null;
          return { translationId, text };
        })
        .filter((translation): translation is { translationId: number; text: string } => translation !== null),
    }));
}

function readOfflineSurahRowsSync(
  surahId: number,
  translationIds: number[],
  wordLang = 'en'
): OfflineVerseWithTranslations[] {
  const resolvedTranslationIds = normalizeTranslationIds(translationIds);
  const resolvedWordLang = normalizeWordLanguageCode(wordLang);
  const db = getAppDbSync();

  if (resolvedTranslationIds.length === 0) {
    const rows = db.getAllSync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      words_json: string | null;
    }>(
      `
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
        COALESCE(wt.words_json, v.words_json) AS words_json
      FROM offline_verses v
      LEFT JOIN offline_word_translations wt
        ON wt.verse_key = v.verse_key
        AND wt.language_code = ?
      WHERE v.surah = ?
      ORDER BY ayah ASC;
      `,
      [resolvedWordLang, surahId]
    );

    return rows.map((row) => ({
      verseKey: row.verse_key,
      surahId: row.surah,
      ayahNumber: row.ayah,
      arabicUthmani: row.arabic_uthmani,
      wordsJson: row.words_json || undefined,
      translations: [],
    }));
  }

  const placeholders = resolvedTranslationIds.map(() => '?').join(', ');
  const rows = db.getAllSync<{
    verse_key: string;
    surah: number;
    ayah: number;
    arabic_uthmani: string;
    words_json: string | null;
    translation_id: number | null;
    translation_text: string | null;
  }>(
    `
    SELECT
      v.verse_key AS verse_key,
      v.surah AS surah,
      v.ayah AS ayah,
      v.arabic_uthmani AS arabic_uthmani,
      COALESCE(wt.words_json, v.words_json) AS words_json,
      t.translation_id AS translation_id,
      t.text AS translation_text
    FROM offline_verses v
    LEFT JOIN offline_word_translations wt
      ON wt.verse_key = v.verse_key
      AND wt.language_code = ?
    LEFT JOIN offline_translations t
      ON t.verse_key = v.verse_key
      AND t.translation_id IN (${placeholders})
    WHERE v.surah = ?
    ORDER BY v.ayah ASC, t.translation_id ASC;
    `,
    [resolvedWordLang, ...resolvedTranslationIds, surahId]
  );

  return mapJoinedRowsToOfflineVerses(rows, resolvedTranslationIds);
}

export function peekOfflineSurahCache(params: {
  surahId: number;
  translationIds: number[];
  wordLang?: string;
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolveSurahParams(params);
  if (!resolved) return null;

  return getFreshSnapshot(surahCache, getSurahCacheKey(resolved));
}

export function getOfflineSurahSnapshot(params: {
  surahId: number;
  translationIds: number[];
  perPage?: number;
  expectedVerseCount?: number;
  wordLang?: string;
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolveSurahParams(params);
  if (!resolved) return null;

  const cachedSurah = peekOfflineSurahCache(resolved);
  if (
    cachedSurah &&
    canCacheOfflineVerses(
      cachedSurah,
      resolved.translationIds,
      params.expectedVerseCount
    )
  ) {
    return cachedSurah;
  }

  try {
    const surahVerses = readOfflineSurahRowsSync(
      resolved.surahId,
      resolved.translationIds,
      resolved.wordLang
    );
    if (
      !canCacheOfflineVerses(
        surahVerses,
        resolved.translationIds,
        params.expectedVerseCount
      )
    ) {
      return null;
    }

    const now = Date.now();
    surahCache.set(getSurahCacheKey(resolved), {
      value: Promise.resolve(surahVerses),
      snapshot: surahVerses,
      timestamp: now,
    });
    pruneCache(surahCache, MAX_SURAH_CACHE_SIZE, now);
    seedPageCacheFromSurah({
      surahId: resolved.surahId,
      translationIds: resolved.translationIds,
      perPage: params.perPage ?? DEFAULT_SURAH_VERSES_PER_PAGE,
      expectedVerseCount: params.expectedVerseCount,
      surahVerses,
    });

    return surahVerses;
  } catch {
    return null;
  }
}

export function peekOfflineSurahPageCache(params: {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
  wordLang?: string;
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolvePageParams(params);
  if (!resolved) return null;

  const pageKey = getPageCacheKey(resolved);
  const pageSnapshot = getFreshSnapshot(surahPageCache, pageKey);
  if (pageSnapshot) return pageSnapshot;

  const surahSnapshot = peekOfflineSurahCache(resolved);
  if (!surahSnapshot) return null;

  const pageVerses = sliceSurahPage({
    surahVerses: surahSnapshot,
    page: resolved.page,
    perPage: resolved.perPage,
  });

  if (!pageVerses.length) return null;

  const now = Date.now();
  surahPageCache.set(pageKey, {
    value: Promise.resolve(pageVerses),
    snapshot: pageVerses,
    timestamp: now,
  });
  pruneCache(surahPageCache, MAX_PAGE_CACHE_SIZE, now);

  return pageVerses;
}

export function getOfflineSurahCached(params: {
  surahId: number;
  translationIds: number[];
  perPage?: number;
  expectedVerseCount?: number;
  wordLang?: string;
}): Promise<OfflineVerseWithTranslations[]> {
  const resolved = resolveSurahParams(params);
  if (!resolved) return Promise.resolve([]);

  const key = getSurahCacheKey(resolved);
  const now = Date.now();
  const cached = surahCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (
      typeof params.expectedVerseCount === 'number' &&
      params.expectedVerseCount > 0 &&
      cached.snapshot &&
      cached.snapshot.length < params.expectedVerseCount
    ) {
      surahCache.delete(key);
    } else {
      return cached.value;
    }
  }

  pruneCache(surahCache, MAX_SURAH_CACHE_SIZE, now);

  const value = container
    .getTranslationOfflineStore()
    .getSurahVersesWithTranslations(resolved.surahId, resolved.translationIds, resolved.wordLang)
    .then((surahVerses) => {
      const current = surahCache.get(key);
      if (!current) return surahVerses;

      if (
        !canCacheOfflineVerses(
          surahVerses,
          resolved.translationIds,
          params.expectedVerseCount
        )
      ) {
        surahCache.delete(key);
        return surahVerses;
      }

      const timestamp = Date.now();
      surahCache.set(key, {
        ...current,
        snapshot: surahVerses,
        timestamp,
      });
      seedPageCacheFromSurah({
        surahId: resolved.surahId,
        translationIds: resolved.translationIds,
        perPage: params.perPage ?? DEFAULT_SURAH_VERSES_PER_PAGE,
        expectedVerseCount: params.expectedVerseCount,
        surahVerses,
      });
      return surahVerses;
    })
    .catch((error) => {
      surahCache.delete(key);
      throw error;
    });

  surahCache.set(key, { value, timestamp: now });
  return value;
}

export function getOfflineSurahPageCached(params: {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
  expectedVerseCount?: number;
  wordLang?: string;
}): Promise<OfflineVerseWithTranslations[]> {
  const resolved = resolvePageParams(params);
  if (!resolved) return Promise.resolve([]);

  const cachedPage = peekOfflineSurahPageCache(resolved);
  const key = getPageCacheKey(resolved);
  if (cachedPage) {
    if (canCacheOfflineVerses(cachedPage, resolved.translationIds, params.expectedVerseCount)) {
      return Promise.resolve(cachedPage);
    }

    surahPageCache.delete(key);
  }

  const now = Date.now();
  const cached = surahPageCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (
      typeof params.expectedVerseCount === 'number' &&
      params.expectedVerseCount > 0 &&
      cached.snapshot &&
      cached.snapshot.length < params.expectedVerseCount
    ) {
      surahPageCache.delete(key);
    } else {
      return cached.value;
    }
  }

  pruneCache(surahPageCache, MAX_PAGE_CACHE_SIZE, now);

  const value = container
    .getTranslationOfflineStore()
    .getSurahVersesPageWithTranslations(resolved)
    .then((pageVerses) => {
      const current = surahPageCache.get(key);
      if (!current) return pageVerses;

      if (
        !canCacheOfflineVerses(
          pageVerses,
          resolved.translationIds,
          params.expectedVerseCount
        )
      ) {
        surahPageCache.delete(key);
        return pageVerses;
      }

      surahPageCache.set(key, {
        ...current,
        snapshot: pageVerses,
        timestamp: Date.now(),
      });
      return pageVerses;
    })
    .catch((error) => {
      surahPageCache.delete(key);
      throw error;
    });

  surahPageCache.set(key, { value, timestamp: now });
  return value;
}

export function primeOfflineSurahCache(params: {
  surahId: number;
  translationIds: number[];
  perPage?: number;
  expectedVerseCount?: number;
}): void {
  void getOfflineSurahCached(params).catch(() => {});
}

export function primeOfflineSurahPageCache(params: {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage?: number;
  expectedVerseCount?: number;
}): void {
  void getOfflineSurahPageCached({
    surahId: params.surahId,
    translationIds: params.translationIds,
    page: params.page,
    perPage: params.perPage ?? DEFAULT_SURAH_VERSES_PER_PAGE,
    expectedVerseCount: params.expectedVerseCount,
  }).catch(() => {});
}

export function preloadOfflineSurahNavigationPage(params: {
  surahId: number;
  verseNumber?: number;
  settings: SurahPageCacheSettings;
  perPage?: number;
}): Promise<void> {
  const perPage = normalizePositiveInt(params.perPage) || DEFAULT_SURAH_VERSES_PER_PAGE;
  const surahId = normalizePositiveInt(params.surahId);

  if (surahId <= 0) return Promise.resolve();

  return getOfflineSurahCached({
    surahId,
    translationIds: getSelectedTranslationIds(params.settings),
    wordLang: params.settings.wordLang ?? undefined,
    perPage,
  }).then(
    (surahVerses) => {
      if (params.settings.tajweed) {
        const page = getSurahPageNumber(params.verseNumber, perPage);
        const pageVerses = sliceSurahPage({ surahVerses, page, perPage });
        // The offline verse snapshot is enough to render the destination immediately.
        // Font preparation can be relatively expensive and must not hold navigation.
        void preloadTajweedFontsForOfflineVerses(pageVerses).catch(() => {});
      }
    },
    () => undefined
  );
}

export function primeOfflineSurahNavigationPage(params: {
  surahId: number;
  verseNumber?: number;
  settings: SurahPageCacheSettings;
  perPage?: number;
}): void {
  void preloadOfflineSurahNavigationPage(params);
}

export function clearOfflineSurahPageCache(): void {
  surahPageCache.clear();
  surahCache.clear();
}
