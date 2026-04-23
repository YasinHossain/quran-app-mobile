import { container } from '@/src/core/infrastructure/di/container';

export type CachedVerseTranslation = {
  resource_id: number;
  resource_name?: string;
  text: string;
};

export type CachedVerse = {
  verse_key: string;
  text_uthmani?: string;
  translations?: CachedVerseTranslation[];
};

type CacheEntry = {
  value: Promise<CachedVerse>;
  snapshot?: CachedVerse;
  timestamp: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_SIZE = 150;

const exactCache = new Map<string, CacheEntry>();
const previewCache = new Map<string, CachedVerse>();

function normalizeTranslationIds(translationIds: number[]): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();

  for (const id of translationIds ?? []) {
    if (!Number.isFinite(id)) continue;
    const normalized = Math.trunc(id);
    if (normalized <= 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function getCacheKey(verseKey: string, translationIds: number[]): string {
  return `${verseKey.trim()}|${normalizeTranslationIds(translationIds).join(',')}`;
}

function touchPreviewCache(verse: CachedVerse): void {
  const normalizedVerseKey = verse.verse_key.trim();
  if (!normalizedVerseKey) return;

  previewCache.delete(normalizedVerseKey);
  previewCache.set(normalizedVerseKey, { ...verse, verse_key: normalizedVerseKey });

  while (previewCache.size > MAX_CACHE_SIZE) {
    const oldestKey = previewCache.keys().next().value;
    if (!oldestKey) break;
    previewCache.delete(oldestKey);
  }
}

function pruneExactCache(now: number): void {
  for (const [key, entry] of exactCache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      exactCache.delete(key);
    }
  }

  while (exactCache.size > MAX_CACHE_SIZE) {
    const oldestKey = exactCache.keys().next().value;
    if (!oldestKey) break;
    exactCache.delete(oldestKey);
  }
}

function buildCachedVerse(params: {
  verseKey: string;
  arabicText?: string;
  translationIds?: number[];
  translationTexts?: string[];
  translationItems?: Array<{ resourceId?: number; resourceName?: string; text: string }>;
}): CachedVerse | null {
  const normalizedVerseKey = params.verseKey.trim();
  if (!normalizedVerseKey) return null;

  const normalizedTranslationIds = normalizeTranslationIds(params.translationIds ?? []);
  const normalizedItems = (params.translationItems ?? [])
    .map((item) => {
      const text = String(item?.text ?? '').trim();
      if (!text) return null;

      const resourceId =
        typeof item?.resourceId === 'number' && Number.isFinite(item.resourceId) && item.resourceId > 0
          ? Math.trunc(item.resourceId)
          : undefined;
      const resourceName = String(item?.resourceName ?? '').trim() || undefined;

      return {
        ...(resourceId ? { resource_id: resourceId } : {}),
        ...(resourceName ? { resource_name: resourceName } : {}),
        text,
      };
    })
    .filter(
      (
        item
      ): item is {
        resource_id?: number;
        resource_name?: string;
        text: string;
      } => item !== null
    );

  const translations =
    normalizedItems.length > 0
      ? normalizedItems.map((item, index) => ({
          resource_id: item.resource_id ?? normalizedTranslationIds[index] ?? index + 1,
          ...(item.resource_name ? { resource_name: item.resource_name } : {}),
          text: item.text,
        }))
      : (params.translationTexts ?? [])
          .map((text, index) => {
            const normalizedText = String(text ?? '').trim();
            if (!normalizedText) return null;
            return {
              resource_id: normalizedTranslationIds[index] ?? index + 1,
              text: normalizedText,
            };
          })
          .filter((translation): translation is CachedVerseTranslation => translation !== null);

  return {
    verse_key: normalizedVerseKey,
    text_uthmani: String(params.arabicText ?? '').trim() || undefined,
    ...(translations.length > 0 ? { translations } : {}),
  };
}

async function loadOfflineVerse(
  verseKey: string,
  translationIds: number[]
): Promise<CachedVerse | null> {
  const normalizedTranslationIds = normalizeTranslationIds(translationIds);
  const offlineVerse = await container
    .getTranslationOfflineStore()
    .getVerseWithTranslations(verseKey, normalizedTranslationIds);

  if (!offlineVerse) return null;

  return {
    verse_key: offlineVerse.verseKey,
    text_uthmani: offlineVerse.arabicUthmani,
    translations: offlineVerse.translations.map((translation) => ({
      resource_id: translation.translationId,
      text: translation.text,
    })),
  };
}

function seedExactVerseCache(
  verse: CachedVerse,
  translationIds: number[]
): void {
  const normalizedVerseKey = verse.verse_key.trim();
  if (!normalizedVerseKey) return;

  const normalizedTranslationIds = normalizeTranslationIds(translationIds);
  const translationCount = verse.translations?.length ?? 0;
  const isExactMatch =
    normalizedTranslationIds.length === 0 || translationCount >= normalizedTranslationIds.length;

  if (!isExactMatch) return;

  const now = Date.now();
  const key = getCacheKey(normalizedVerseKey, normalizedTranslationIds);
  exactCache.set(key, {
    value: Promise.resolve(verse),
    snapshot: verse,
    timestamp: now,
  });
  pruneExactCache(now);
}

async function fetchVerseByKey(
  verseKey: string,
  translationIds: number[]
): Promise<CachedVerse> {
  const normalizedTranslationIds = normalizeTranslationIds(translationIds);
  const verseUrl = `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(
    verseKey
  )}?language=en&words=false&fields=text_uthmani${
    normalizedTranslationIds.length > 0
      ? `&translations=${encodeURIComponent(normalizedTranslationIds.join(','))}`
      : ''
  }`;

  const verseRes = await fetch(verseUrl);
  if (!verseRes.ok) {
    throw new Error(`Failed to load verse (${verseRes.status})`);
  }

  const verseJson = (await verseRes.json()) as {
    verse?: {
      verse_key: string;
      text_uthmani?: string;
      translations?: Array<{ resource_id: number; resource_name?: string; text: string }>;
    };
  };

  if (!verseJson.verse?.verse_key) {
    throw new Error('Verse not found.');
  }

  return verseJson.verse;
}

export function primeVerseDetailsCache(params: {
  verseKey: string;
  arabicText?: string;
  translationIds?: number[];
  translationTexts?: string[];
  translationItems?: Array<{ resourceId?: number; resourceName?: string; text: string }>;
}): void {
  const cachedVerse = buildCachedVerse(params);
  if (!cachedVerse) return;

  const normalizedTranslationIds = normalizeTranslationIds(params.translationIds ?? []);
  touchPreviewCache(cachedVerse);
  seedExactVerseCache(cachedVerse, normalizedTranslationIds);
}

export function peekVersePreview(verseKey: string): CachedVerse | null {
  const normalizedVerseKey = verseKey.trim();
  if (!normalizedVerseKey) return null;

  const cached = previewCache.get(normalizedVerseKey);
  if (!cached) return null;

  previewCache.delete(normalizedVerseKey);
  previewCache.set(normalizedVerseKey, cached);
  return cached;
}

export function getVerseDetailsCached(
  verseKey: string,
  translationIds: number[]
): Promise<CachedVerse> {
  const normalizedVerseKey = verseKey.trim();
  const normalizedTranslationIds = normalizeTranslationIds(translationIds);
  const key = getCacheKey(normalizedVerseKey, normalizedTranslationIds);
  const now = Date.now();

  const cached = exactCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  pruneExactCache(now);

  const value = (async () => {
    const offlineVerse = await loadOfflineVerse(normalizedVerseKey, normalizedTranslationIds);
    if (offlineVerse) {
      touchPreviewCache(offlineVerse);
      return offlineVerse;
    }

    const networkVerse = await fetchVerseByKey(normalizedVerseKey, normalizedTranslationIds);
    touchPreviewCache(networkVerse);
    return networkVerse;
  })()
    .then((verse) => {
      const current = exactCache.get(key);
      if (current) {
        exactCache.set(key, {
          ...current,
          snapshot: verse,
          timestamp: Date.now(),
        });
      }
      return verse;
    })
    .catch((error) => {
      exactCache.delete(key);
      throw error;
    });

  exactCache.set(key, { value, timestamp: now });
  return value;
}

export async function getOfflineSurahVerseDetailsCached(
  surahId: number,
  translationIds: number[]
): Promise<Map<string, CachedVerse>> {
  const normalizedSurahId = Number.isFinite(surahId) ? Math.trunc(surahId) : 0;
  const normalizedTranslationIds = normalizeTranslationIds(translationIds);
  const results = new Map<string, CachedVerse>();

  if (normalizedSurahId <= 0) {
    return results;
  }

  const offlineVerses = await container
    .getTranslationOfflineStore()
    .getSurahVersesWithTranslations(normalizedSurahId, normalizedTranslationIds);

  for (const offlineVerse of offlineVerses) {
    const cachedVerse: CachedVerse = {
      verse_key: offlineVerse.verseKey,
      text_uthmani: offlineVerse.arabicUthmani,
      translations: offlineVerse.translations.map((translation) => ({
        resource_id: translation.translationId,
        text: translation.text,
      })),
    };

    touchPreviewCache(cachedVerse);
    seedExactVerseCache(cachedVerse, normalizedTranslationIds);
    results.set(cachedVerse.verse_key, cachedVerse);
  }

  return results;
}

export function clearVerseDetailsCache(): void {
  exactCache.clear();
  previewCache.clear();
}
