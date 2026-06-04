import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import { getAppDbSync } from '@/src/core/infrastructure/db';
import { container } from '@/src/core/infrastructure/di/container';
import juzData from '../../src/data/juz.json';

export const DEFAULT_JUZ_VERSES_PER_PAGE = 30;

type CacheEntry = {
  value: Promise<OfflineVerseWithTranslations[]>;
  snapshot?: OfflineVerseWithTranslations[];
  timestamp: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGE_CACHE_SIZE = 64;
const MAX_JUZ_CACHE_SIZE = 8;

const juzPageCache = new Map<string, CacheEntry>();
const juzCache = new Map<string, CacheEntry>();

function normalizePositiveInt(value: number | undefined | null): number {
  const numericValue = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(numericValue)) return 0;
  const normalized = Math.trunc(numericValue);
  return normalized > 0 ? normalized : 0;
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
  juzId: number;
  translationIds: number[];
  page: number;
  perPage: number;
}): string {
  return [
    normalizePositiveInt(params.juzId),
    normalizeTranslationIds(params.translationIds).join(','),
    normalizePositiveInt(params.page),
    normalizePositiveInt(params.perPage),
  ].join('|');
}

function getJuzCacheKey(params: {
  juzId: number;
  translationIds: number[];
}): string {
  return [
    normalizePositiveInt(params.juzId),
    normalizeTranslationIds(params.translationIds).join(','),
  ].join('|');
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
  juzId: number;
  translationIds: number[];
  page: number;
  perPage: number;
}): {
  juzId: number;
  translationIds: number[];
  page: number;
  perPage: number;
} | null {
  const juzId = normalizePositiveInt(params.juzId);
  const page = normalizePositiveInt(params.page);
  const perPage = normalizePositiveInt(params.perPage);

  if (juzId <= 0 || page <= 0 || perPage <= 0) {
    return null;
  }

  return {
    juzId,
    translationIds: normalizeTranslationIds(params.translationIds),
    page,
    perPage,
  };
}

function resolveJuzParams(params: {
  juzId: number;
  translationIds: number[];
}): {
  juzId: number;
  translationIds: number[];
} | null {
  const juzId = normalizePositiveInt(params.juzId);
  if (juzId <= 0) return null;

  return {
    juzId,
    translationIds: normalizeTranslationIds(params.translationIds),
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

function sliceJuzPage(params: {
  juzVerses: OfflineVerseWithTranslations[];
  page: number;
  perPage: number;
}): OfflineVerseWithTranslations[] {
  const offset = (params.page - 1) * params.perPage;
  return params.juzVerses.slice(offset, offset + params.perPage);
}

function seedPageCacheFromJuz(params: {
  juzId: number;
  translationIds: number[];
  perPage: number;
  expectedVerseCount?: number;
  juzVerses: OfflineVerseWithTranslations[];
}): void {
  const resolved = resolvePageParams({
    juzId: params.juzId,
    translationIds: params.translationIds,
    page: 1,
    perPage: params.perPage,
  });
  if (!resolved) return;
  if (
    !canCacheOfflineVerses(
      params.juzVerses,
      resolved.translationIds,
      params.expectedVerseCount
    )
  ) {
    return;
  }

  const now = Date.now();
  for (
    let offset = 0, page = 1;
    offset < params.juzVerses.length;
    offset += resolved.perPage, page += 1
  ) {
    const pageVerses = params.juzVerses.slice(offset, offset + resolved.perPage);
    const key = getPageCacheKey({ ...resolved, page });
    juzPageCache.set(key, {
      value: Promise.resolve(pageVerses),
      snapshot: pageVerses,
      timestamp: now,
    });
  }

  pruneCache(juzPageCache, MAX_PAGE_CACHE_SIZE, now);
}

function mapJoinedRowsToOfflineVerses(
  rows: Array<{
    verse_key: string;
    surah: number;
    ayah: number;
    arabic_uthmani: string;
    translation_id: number | null;
    translation_text: string | null;
    words_json?: string | null;
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

function readOfflineJuzRowsSync(
  juzId: number,
  translationIds: number[]
): OfflineVerseWithTranslations[] {
  const resolvedTranslationIds = normalizeTranslationIds(translationIds);
  const db = getAppDbSync();
  const juz = (juzData as any[]).find((j: any) => j.number === juzId);
  if (!juz) return [];

  if (resolvedTranslationIds.length === 0) {
    const rows = db.getAllSync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      words_json: string | null;
    }>(
      `
      SELECT verse_key, surah, ayah, arabic_uthmani, words_json
      FROM offline_verses
      WHERE (surah > ? AND surah < ?)
         OR (surah = ? AND ? = ? AND ayah BETWEEN ? AND ?)
         OR (surah = ? AND ? < ? AND ayah >= ?)
         OR (surah = ? AND ? < ? AND ayah <= ?)
      ORDER BY surah ASC, ayah ASC;
      `,
      [
        juz.startSurahId,
        juz.endSurahId,
        juz.startSurahId,
        juz.startSurahId,
        juz.endSurahId,
        juz.startAyah,
        juz.endAyah,
        juz.startSurahId,
        juz.startSurahId,
        juz.endSurahId,
        juz.startAyah,
        juz.endSurahId,
        juz.startSurahId,
        juz.endSurahId,
        juz.endAyah,
      ]
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
    translation_id: number | null;
    translation_text: string | null;
    words_json: string | null;
  }>(
    `
    WITH verse_page AS (
      SELECT verse_key, surah, ayah, arabic_uthmani, words_json
      FROM offline_verses
      WHERE (surah > ? AND surah < ?)
         OR (surah = ? AND ? = ? AND ayah BETWEEN ? AND ?)
         OR (surah = ? AND ? < ? AND ayah >= ?)
         OR (surah = ? AND ? < ? AND ayah <= ?)
      ORDER BY surah ASC, ayah ASC
    )
    SELECT
      v.verse_key AS verse_key,
      v.surah AS surah,
      v.ayah AS ayah,
      v.arabic_uthmani AS arabic_uthmani,
      v.words_json AS words_json,
      t.translation_id AS translation_id,
      t.text AS translation_text
    FROM verse_page v
    LEFT JOIN offline_translations t
      ON t.verse_key = v.verse_key
      AND t.translation_id IN (${placeholders})
    ORDER BY v.surah ASC, v.ayah ASC, t.translation_id ASC;
    `,
    [
      juz.startSurahId,
      juz.endSurahId,
      juz.startSurahId,
      juz.startSurahId,
      juz.endSurahId,
      juz.startAyah,
      juz.endAyah,
      juz.startSurahId,
      juz.startSurahId,
      juz.endSurahId,
      juz.startAyah,
      juz.endSurahId,
      juz.startSurahId,
      juz.endSurahId,
      juz.endAyah,
      ...resolvedTranslationIds,
    ]
  );

  return mapJoinedRowsToOfflineVerses(rows, resolvedTranslationIds);
}

export function peekOfflineJuzCache(params: {
  juzId: number;
  translationIds: number[];
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolveJuzParams(params);
  if (!resolved) return null;

  return getFreshSnapshot(juzCache, getJuzCacheKey(resolved));
}

export function getOfflineJuzSnapshot(params: {
  juzId: number;
  translationIds: number[];
  perPage?: number;
  expectedVerseCount?: number;
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolveJuzParams(params);
  if (!resolved) return null;

  const cachedJuz = peekOfflineJuzCache(resolved);
  if (
    cachedJuz &&
    canCacheOfflineVerses(
      cachedJuz,
      resolved.translationIds,
      params.expectedVerseCount
    )
  ) {
    return cachedJuz;
  }

  try {
    const juzVerses = readOfflineJuzRowsSync(resolved.juzId, resolved.translationIds);
    if (
      !canCacheOfflineVerses(
        juzVerses,
        resolved.translationIds,
        params.expectedVerseCount
      )
    ) {
      return null;
    }

    const now = Date.now();
    juzCache.set(getJuzCacheKey(resolved), {
      value: Promise.resolve(juzVerses),
      snapshot: juzVerses,
      timestamp: now,
    });
    pruneCache(juzCache, MAX_JUZ_CACHE_SIZE, now);
    seedPageCacheFromJuz({
      juzId: resolved.juzId,
      translationIds: resolved.translationIds,
      perPage: params.perPage ?? DEFAULT_JUZ_VERSES_PER_PAGE,
      expectedVerseCount: params.expectedVerseCount,
      juzVerses,
    });

    return juzVerses;
  } catch {
    return null;
  }
}

export function peekOfflineJuzPageCache(params: {
  juzId: number;
  translationIds: number[];
  page: number;
  perPage: number;
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolvePageParams(params);
  if (!resolved) return null;

  const pageKey = getPageCacheKey(resolved);
  const pageSnapshot = getFreshSnapshot(juzPageCache, pageKey);
  if (pageSnapshot) return pageSnapshot;

  const juzSnapshot = peekOfflineJuzCache(resolved);
  if (!juzSnapshot) return null;

  const pageVerses = sliceJuzPage({
    juzVerses: juzSnapshot,
    page: resolved.page,
    perPage: resolved.perPage,
  });

  if (!pageVerses.length) return null;

  const now = Date.now();
  juzPageCache.set(pageKey, {
    value: Promise.resolve(pageVerses),
    snapshot: pageVerses,
    timestamp: now,
  });
  pruneCache(juzPageCache, MAX_PAGE_CACHE_SIZE, now);

  return pageVerses;
}

export function getOfflineJuzCached(params: {
  juzId: number;
  translationIds: number[];
  perPage?: number;
  expectedVerseCount?: number;
}): Promise<OfflineVerseWithTranslations[]> {
  const resolved = resolveJuzParams(params);
  if (!resolved) return Promise.resolve([]);

  const key = getJuzCacheKey(resolved);
  const now = Date.now();
  const cached = juzCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (
      typeof params.expectedVerseCount === 'number' &&
      params.expectedVerseCount > 0 &&
      cached.snapshot &&
      cached.snapshot.length < params.expectedVerseCount
    ) {
      juzCache.delete(key);
    } else {
      return cached.value;
    }
  }

  pruneCache(juzCache, MAX_JUZ_CACHE_SIZE, now);

  const value = container
    .getTranslationOfflineStore()
    .getJuzVersesPageWithTranslations({
      juzId: resolved.juzId,
      translationIds: resolved.translationIds,
      page: 1,
      perPage: 9999,
    })
    .then((juzVerses) => {
      const current = juzCache.get(key);
      if (!current) return juzVerses;

      if (
        !canCacheOfflineVerses(
          juzVerses,
          resolved.translationIds,
          params.expectedVerseCount
        )
      ) {
        juzCache.delete(key);
        return juzVerses;
      }

      const timestamp = Date.now();
      juzCache.set(key, {
        ...current,
        snapshot: juzVerses,
        timestamp,
      });
      seedPageCacheFromJuz({
        juzId: resolved.juzId,
        translationIds: resolved.translationIds,
        perPage: params.perPage ?? DEFAULT_JUZ_VERSES_PER_PAGE,
        expectedVerseCount: params.expectedVerseCount,
        juzVerses,
      });
      return juzVerses;
    })
    .catch((error) => {
      juzCache.delete(key);
      throw error;
    });

  juzCache.set(key, { value, timestamp: now });
  return value;
}

export function getOfflineJuzPageCached(params: {
  juzId: number;
  translationIds: number[];
  page: number;
  perPage: number;
  expectedVerseCount?: number;
}): Promise<OfflineVerseWithTranslations[]> {
  const resolved = resolvePageParams(params);
  if (!resolved) return Promise.resolve([]);

  const cachedPage = peekOfflineJuzPageCache(resolved);
  const key = getPageCacheKey(resolved);
  if (cachedPage) {
    if (canCacheOfflineVerses(cachedPage, resolved.translationIds, params.expectedVerseCount)) {
      return Promise.resolve(cachedPage);
    }

    juzPageCache.delete(key);
  }

  const now = Date.now();
  const cached = juzPageCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (
      typeof params.expectedVerseCount === 'number' &&
      params.expectedVerseCount > 0 &&
      cached.snapshot &&
      cached.snapshot.length < params.expectedVerseCount
    ) {
      juzPageCache.delete(key);
    } else {
      return cached.value;
    }
  }

  pruneCache(juzPageCache, MAX_PAGE_CACHE_SIZE, now);

  const value = container
    .getTranslationOfflineStore()
    .getJuzVersesPageWithTranslations({
      juzId: resolved.juzId,
      translationIds: resolved.translationIds,
      page: resolved.page,
      perPage: resolved.perPage,
    })
    .then((pageVerses) => {
      const current = juzPageCache.get(key);
      if (!current) return pageVerses;

      if (
        !canCacheOfflineVerses(
          pageVerses,
          resolved.translationIds,
          params.expectedVerseCount
        )
      ) {
        juzPageCache.delete(key);
        return pageVerses;
      }

      juzPageCache.set(key, {
        ...current,
        snapshot: pageVerses,
        timestamp: Date.now(),
      });
      return pageVerses;
    })
    .catch((error) => {
      juzPageCache.delete(key);
      throw error;
    });

  juzPageCache.set(key, { value, timestamp: now });
  return value;
}
