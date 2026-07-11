import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';

export type NetworkSurahVerse = {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  translations?: Array<{ resource_id: number; resource_name?: string; text: string }>;
};

type ApiVersesResponse = {
  verses: NetworkSurahVerse[];
  pagination?: { current_page?: number; total_pages?: number; per_page?: number };
};

type CacheEntry = {
  value: Promise<NetworkSurahVerse[]>;
  snapshot?: NetworkSurahVerse[];
  timestamp: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_NETWORK_SURAH_CACHE_SIZE = 8;

const networkSurahCache = new Map<string, CacheEntry>();

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

function normalizeWordLanguageCode(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || 'en';
}

function getCacheKey(params: {
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

function pruneCache(now: number): void {
  for (const [key, entry] of networkSurahCache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      networkSurahCache.delete(key);
    }
  }

  while (networkSurahCache.size > MAX_NETWORK_SURAH_CACHE_SIZE) {
    const oldestKey = networkSurahCache.keys().next().value;
    if (!oldestKey) break;
    networkSurahCache.delete(oldestKey);
  }
}

export function peekNetworkSurahTranslationSnapshot(params: {
  surahId: number;
  translationIds: number[];
  wordLang?: string;
}): NetworkSurahVerse[] | null {
  const key = getCacheKey(params);
  const cached = networkSurahCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    networkSurahCache.delete(key);
    return null;
  }

  if (!cached.snapshot) return null;

  networkSurahCache.delete(key);
  networkSurahCache.set(key, cached);
  return cached.snapshot;
}

export function getNetworkSurahTranslationCached(params: {
  surahId: number;
  translationIds: number[];
  wordLang?: string;
}): Promise<NetworkSurahVerse[]> {
  const surahId = normalizePositiveInt(params.surahId);
  if (surahId <= 0) return Promise.resolve([]);

  const translationIds = normalizeTranslationIds(params.translationIds);
  const wordLang = normalizeWordLanguageCode(params.wordLang);
  const key = getCacheKey({ surahId, translationIds, wordLang });
  const now = Date.now();
  const cached = networkSurahCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  pruneCache(now);

  const value = apiFetch<ApiVersesResponse>(
    `/verses/by_chapter/${surahId}`,
    {
      language: wordLang,
      words: 'false',
      fields: 'text_uthmani',
      ...(translationIds.length ? { translations: translationIds.join(',') } : {}),
      per_page: 'all',
    },
    'Failed to load verses'
  )
    .then((response) => {
      const verses = response.verses ?? [];
      const current = networkSurahCache.get(key);
      if (current) {
        networkSurahCache.set(key, {
          ...current,
          snapshot: verses,
          timestamp: Date.now(),
        });
      }
      return verses;
    })
    .catch((error) => {
      networkSurahCache.delete(key);
      throw error;
    });

  networkSurahCache.set(key, { value, timestamp: now });
  return value;
}

export function primeNetworkSurahTranslationCache(params: {
  surahId: number;
  translationIds: number[];
  wordLang?: string;
}): void {
  void getNetworkSurahTranslationCached(params).catch(() => {});
}
