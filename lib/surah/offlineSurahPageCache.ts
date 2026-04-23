import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import { container } from '@/src/core/infrastructure/di/container';

export const DEFAULT_SURAH_VERSES_PER_PAGE = 30;

type SurahPageCacheSettings = {
  translationIds?: number[] | null;
  translationId?: number | null;
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
}): string {
  return [
    normalizePositiveInt(params.surahId),
    normalizeTranslationIds(params.translationIds).join(','),
    normalizePositiveInt(params.page),
    normalizePositiveInt(params.perPage),
  ].join('|');
}

function getSurahCacheKey(params: {
  surahId: number;
  translationIds: number[];
}): string {
  return [
    normalizePositiveInt(params.surahId),
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
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
}): {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
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
  };
}

function resolveSurahParams(params: {
  surahId: number;
  translationIds: number[];
}): {
  surahId: number;
  translationIds: number[];
} | null {
  const surahId = normalizePositiveInt(params.surahId);
  if (surahId <= 0) return null;

  return {
    surahId,
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

function sliceSurahPage(params: {
  surahVerses: OfflineVerseWithTranslations[];
  page: number;
  perPage: number;
}): OfflineVerseWithTranslations[] {
  const offset = (params.page - 1) * params.perPage;
  return params.surahVerses.slice(offset, offset + params.perPage);
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

export function peekOfflineSurahCache(params: {
  surahId: number;
  translationIds: number[];
}): OfflineVerseWithTranslations[] | null {
  const resolved = resolveSurahParams(params);
  if (!resolved) return null;

  return getFreshSnapshot(surahCache, getSurahCacheKey(resolved));
}

export function peekOfflineSurahPageCache(params: {
  surahId: number;
  translationIds: number[];
  page: number;
  perPage: number;
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
    .getSurahVersesWithTranslations(resolved.surahId, resolved.translationIds)
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
    perPage,
  }).then(
    () => undefined,
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
