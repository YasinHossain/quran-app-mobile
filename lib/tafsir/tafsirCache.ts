import { getAppDbAsync, getAppDbSync } from '@/src/core/infrastructure/db';

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MAX_CACHE_SIZE = 400;
export const OFFLINE_TAFSIR_PREFETCH_RADIUS = 15;

/** Consecutive verses that a tafsir explains together. */
export type OfflineTafsirPassage = {
  startVerseKey: string;
  endVerseKey: string;
};

/**
 * Tafsir for one verse. When the verse belongs to a multi-verse passage, `html` is the
 * passage commentary and `passage` is its range.
 */
export type OfflineTafsirEntry = {
  html: string;
  passage: OfflineTafsirPassage | null;
};

interface CacheEntry {
  value: Promise<OfflineTafsirEntry | null>;
  snapshot?: OfflineTafsirEntry | null;
  timestamp: number;
}

type OfflineTafsirRow = {
  verse_key: string;
  html: string;
  passage_start: string | null;
  passage_end: string | null;
};

// Rows inside a passage keep empty HTML; the passage text is read from its first verse.
const OFFLINE_TAFSIR_SELECT = `
  SELECT
    v.verse_key AS verse_key,
    COALESCE(p.html, v.html) AS html,
    v.passage_start AS passage_start,
    v.passage_end AS passage_end
  FROM offline_tafsir v
  LEFT JOIN offline_tafsir p
    ON p.tafsir_id = v.tafsir_id
    AND p.verse_key = v.passage_start
  WHERE v.tafsir_id = ?
`;

function toOfflineTafsirEntry(row: OfflineTafsirRow): OfflineTafsirEntry {
  const startVerseKey = String(row.passage_start ?? '').trim();
  const endVerseKey = String(row.passage_end ?? '').trim();
  return {
    html: typeof row.html === 'string' ? row.html : '',
    passage: startVerseKey && endVerseKey ? { startVerseKey, endVerseKey } : null,
  };
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(verseKey: string, tafsirId: number): string {
  return `${tafsirId}-${verseKey.trim()}`;
}

function trimCacheToMaxSize(): void {
  while (cache.size > MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;

    for (const [entryKey, entry] of cache) {
      if (entry.timestamp < oldestTimestamp) {
        oldestKey = entryKey;
        oldestTimestamp = entry.timestamp;
      }
    }

    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function pruneCache(now: number): void {
  for (const [entryKey, entry] of cache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      cache.delete(entryKey);
    }
  }

  trimCacheToMaxSize();
}

function seedCachedValue(
  verseKey: string,
  tafsirId: number,
  entry: OfflineTafsirEntry | null
): void {
  const normalizedVerseKey = verseKey.trim();
  if (!normalizedVerseKey) return;

  const key = getCacheKey(normalizedVerseKey, tafsirId);
  cache.delete(key);
  cache.set(key, {
    value: Promise.resolve(entry),
    snapshot: entry,
    timestamp: Date.now(),
  });
  trimCacheToMaxSize();
}

export function primeOfflineTafsirCacheValue(
  verseKey: string,
  tafsirId: number,
  entry: OfflineTafsirEntry | null
): void {
  seedCachedValue(verseKey, tafsirId, entry);
}

function peekCachedValue(
  verseKey: string,
  tafsirId: number
): OfflineTafsirEntry | null | undefined {
  const normalizedVerseKey = verseKey.trim();
  if (!normalizedVerseKey) return null;

  const key = getCacheKey(normalizedVerseKey, tafsirId);
  const cached = cache.get(key);
  if (!cached) return undefined;

  const now = Date.now();
  if (now - cached.timestamp >= CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }

  if (cached.snapshot === undefined) return undefined;

  cache.delete(key);
  cache.set(key, { ...cached, timestamp: now });
  return cached.snapshot;
}

async function readOfflineTafsirRows(
  tafsirId: number,
  verseKeys: string[]
): Promise<Map<string, OfflineTafsirEntry | null>> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedVerseKeys = Array.from(
    new Set(
      verseKeys
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );

  const results = new Map<string, OfflineTafsirEntry | null>();
  for (const verseKey of normalizedVerseKeys) {
    results.set(verseKey, null);
  }

  if (normalizedTafsirId <= 0 || normalizedVerseKeys.length === 0) {
    return results;
  }

  const placeholders = normalizedVerseKeys.map(() => '?').join(', ');
  const db = await getAppDbAsync();
  const rows = await db.getAllAsync<OfflineTafsirRow>(
    `${OFFLINE_TAFSIR_SELECT} AND v.verse_key IN (${placeholders});`,
    [normalizedTafsirId, ...normalizedVerseKeys]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, toOfflineTafsirEntry(row));
  }

  return results;
}

function readOfflineTafsirRowsSync(
  tafsirId: number,
  verseKeys: string[]
): Map<string, OfflineTafsirEntry | null> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedVerseKeys = Array.from(
    new Set(
      verseKeys
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );

  const results = new Map<string, OfflineTafsirEntry | null>();
  for (const verseKey of normalizedVerseKeys) {
    results.set(verseKey, null);
  }

  if (normalizedTafsirId <= 0 || normalizedVerseKeys.length === 0) {
    return results;
  }

  const placeholders = normalizedVerseKeys.map(() => '?').join(', ');
  const db = getAppDbSync();
  const rows = db.getAllSync<OfflineTafsirRow>(
    `${OFFLINE_TAFSIR_SELECT} AND v.verse_key IN (${placeholders});`,
    [normalizedTafsirId, ...normalizedVerseKeys]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, toOfflineTafsirEntry(row));
  }

  return results;
}

async function readOfflineTafsirSurahRows(
  tafsirId: number,
  surahId: number
): Promise<Map<string, OfflineTafsirEntry>> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedSurahId = Number.isFinite(surahId) ? Math.trunc(surahId) : 0;
  const results = new Map<string, OfflineTafsirEntry>();

  if (normalizedTafsirId <= 0 || normalizedSurahId <= 0) {
    return results;
  }

  const db = await getAppDbAsync();
  const rows = await db.getAllAsync<OfflineTafsirRow>(
    `${OFFLINE_TAFSIR_SELECT} AND v.verse_key LIKE ?;`,
    [normalizedTafsirId, `${normalizedSurahId}:%`]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, toOfflineTafsirEntry(row));
  }

  return results;
}

function readOfflineTafsirSurahRowsSync(
  tafsirId: number,
  surahId: number
): Map<string, OfflineTafsirEntry> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedSurahId = Number.isFinite(surahId) ? Math.trunc(surahId) : 0;
  const results = new Map<string, OfflineTafsirEntry>();

  if (normalizedTafsirId <= 0 || normalizedSurahId <= 0) {
    return results;
  }

  const db = getAppDbSync();
  const rows = db.getAllSync<OfflineTafsirRow>(
    `${OFFLINE_TAFSIR_SELECT} AND v.verse_key LIKE ?;`,
    [normalizedTafsirId, `${normalizedSurahId}:%`]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, toOfflineTafsirEntry(row));
  }

  return results;
}

export function getOfflineTafsirCached(
  verseKey: string,
  tafsirId = 169
): Promise<OfflineTafsirEntry | null> {
  const normalizedVerseKey = verseKey.trim();
  const key = getCacheKey(normalizedVerseKey, tafsirId);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  pruneCache(now);

  const value = readOfflineTafsirRows(tafsirId, [normalizedVerseKey])
    .then((rows) => rows.get(normalizedVerseKey) ?? null)
    .then((entry) => {
      const current = cache.get(key);
      if (current) {
        cache.set(key, {
          ...current,
          snapshot: entry,
          timestamp: Date.now(),
        });
      }
      return entry;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { value, timestamp: now });
  trimCacheToMaxSize();
  return value;
}

export function getOfflineTafsirSnapshot(
  verseKey: string,
  tafsirId = 169
): OfflineTafsirEntry | null {
  const normalizedVerseKey = String(verseKey ?? '').trim();
  if (!normalizedVerseKey) return null;

  const cached = peekCachedValue(normalizedVerseKey, tafsirId);
  if (cached !== undefined) return cached;

  try {
    const rows = readOfflineTafsirRowsSync(tafsirId, [normalizedVerseKey]);
    const entry = rows.get(normalizedVerseKey) ?? null;
    seedCachedValue(normalizedVerseKey, tafsirId, entry);
    return entry;
  } catch {
    return null;
  }
}

export async function getOfflineTafsirBatchCached(
  verseKeys: string[],
  tafsirId = 169
): Promise<Map<string, OfflineTafsirEntry | null>> {
  const normalizedVerseKeys = Array.from(
    new Set(
      verseKeys
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );

  const results = new Map<string, OfflineTafsirEntry | null>();
  if (normalizedVerseKeys.length === 0) {
    return results;
  }

  const now = Date.now();
  pruneCache(now);

  const missingVerseKeys: string[] = [];

  for (const verseKey of normalizedVerseKeys) {
    const key = getCacheKey(verseKey, tafsirId);
    const cached = cache.get(key);
    if (cached && now - cached.timestamp < CACHE_TTL_MS && cached.snapshot !== undefined) {
      results.set(verseKey, cached.snapshot);
      continue;
    }

    missingVerseKeys.push(verseKey);
  }

  if (missingVerseKeys.length > 0) {
    const rowsByVerseKey = await readOfflineTafsirRows(tafsirId, missingVerseKeys);

    for (const verseKey of missingVerseKeys) {
      const entry = rowsByVerseKey.get(verseKey) ?? null;
      seedCachedValue(verseKey, tafsirId, entry);
      results.set(verseKey, entry);
    }
  }

  for (const verseKey of normalizedVerseKeys) {
    if (!results.has(verseKey)) {
      results.set(verseKey, null);
    }
  }

  return results;
}

export async function preloadOfflineTafsirWindow(params: {
  surahId: number;
  ayahId: number;
  tafsirIds: number[];
  verseCount?: number;
  radius?: number;
}): Promise<void> {
  const surahId = Number.isFinite(params.surahId) ? Math.trunc(params.surahId) : 0;
  const ayahId = Number.isFinite(params.ayahId) ? Math.trunc(params.ayahId) : 0;
  const radius =
    typeof params.radius === 'number' && Number.isFinite(params.radius)
      ? Math.max(0, Math.trunc(params.radius))
      : OFFLINE_TAFSIR_PREFETCH_RADIUS;
  const verseCount =
    typeof params.verseCount === 'number' && Number.isFinite(params.verseCount)
      ? Math.max(0, Math.trunc(params.verseCount))
      : 0;
  const tafsirIds = Array.from(
    new Set(
      (params.tafsirIds ?? [])
        .map((tafsirId) => (Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0))
        .filter((tafsirId) => tafsirId > 0)
    )
  );

  if (surahId <= 0 || ayahId <= 0 || tafsirIds.length === 0) return;

  const startAyah = Math.max(1, ayahId - radius);
  const endAyah = verseCount > 0
    ? Math.min(verseCount, ayahId + radius)
    : ayahId + radius;
  const verseKeys = Array.from(
    { length: Math.max(0, endAyah - startAyah + 1) },
    (_value, index) => `${surahId}:${startAyah + index}`
  );

  await Promise.all(
    tafsirIds.map(async (tafsirId) => {
      try {
        await getOfflineTafsirBatchCached(verseKeys, tafsirId);
      } catch {
        // Window preloading is opportunistic; visible verse loading handles read errors.
      }
    })
  );
}

export function getOfflineTafsirSurahSnapshot(params: {
  surahId: number;
  tafsirId?: number;
  verseKeys?: string[];
}): Map<string, OfflineTafsirEntry | null> {
  const normalizedTafsirId =
    typeof params.tafsirId === 'number' && Number.isFinite(params.tafsirId)
      ? Math.trunc(params.tafsirId)
      : 169;
  const normalizedSurahId = Number.isFinite(params.surahId) ? Math.trunc(params.surahId) : 0;
  const expectedVerseKeys = Array.from(
    new Set(
      (params.verseKeys ?? [])
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );
  const results = new Map<string, OfflineTafsirEntry | null>();

  if (normalizedTafsirId <= 0 || normalizedSurahId <= 0) {
    for (const verseKey of expectedVerseKeys) {
      results.set(verseKey, null);
    }
    return results;
  }

  try {
    const rowsByVerseKey = readOfflineTafsirSurahRowsSync(
      normalizedTafsirId,
      normalizedSurahId
    );

    if (expectedVerseKeys.length === 0) {
      for (const [verseKey, entry] of rowsByVerseKey) {
        seedCachedValue(verseKey, normalizedTafsirId, entry);
        results.set(verseKey, entry);
      }
      return results;
    }

    for (const verseKey of expectedVerseKeys) {
      const entry = rowsByVerseKey.get(verseKey) ?? null;
      seedCachedValue(verseKey, normalizedTafsirId, entry);
      results.set(verseKey, entry);
    }

    return results;
  } catch {
    for (const verseKey of expectedVerseKeys) {
      results.set(verseKey, null);
    }
    return results;
  }
}

export async function getOfflineTafsirSurahCached(params: {
  surahId: number;
  tafsirId?: number;
  verseKeys?: string[];
}): Promise<Map<string, OfflineTafsirEntry | null>> {
  const normalizedTafsirId =
    typeof params.tafsirId === 'number' && Number.isFinite(params.tafsirId)
      ? Math.trunc(params.tafsirId)
      : 169;
  const normalizedSurahId = Number.isFinite(params.surahId) ? Math.trunc(params.surahId) : 0;
  const expectedVerseKeys = Array.from(
    new Set(
      (params.verseKeys ?? [])
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );
  const results = new Map<string, OfflineTafsirEntry | null>();

  if (normalizedTafsirId <= 0 || normalizedSurahId <= 0) {
    for (const verseKey of expectedVerseKeys) {
      results.set(verseKey, null);
    }
    return results;
  }

  const now = Date.now();
  pruneCache(now);

  const rowsByVerseKey = await readOfflineTafsirSurahRows(normalizedTafsirId, normalizedSurahId);

  if (expectedVerseKeys.length === 0) {
    for (const [verseKey, entry] of rowsByVerseKey) {
      seedCachedValue(verseKey, normalizedTafsirId, entry);
      results.set(verseKey, entry);
    }
    return results;
  }

  for (const verseKey of expectedVerseKeys) {
    const entry = rowsByVerseKey.get(verseKey) ?? null;
    seedCachedValue(verseKey, normalizedTafsirId, entry);
    results.set(verseKey, entry);
  }

  return results;
}

export async function preloadOfflineTafsirSurah(params: {
  surahId: number;
  tafsirIds: number[];
  verseKeys?: string[];
}): Promise<void> {
  const normalizedSurahId = Number.isFinite(params.surahId) ? Math.trunc(params.surahId) : 0;
  if (normalizedSurahId <= 0) return;

  const tafsirIds = Array.from(
    new Set(
      (params.tafsirIds ?? [])
        .map((tafsirId) => (Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0))
        .filter((tafsirId) => tafsirId > 0)
    )
  );

  if (tafsirIds.length === 0) return;

  await Promise.all(
    tafsirIds.map(async (tafsirId) => {
      try {
        await getOfflineTafsirSurahCached({
          surahId: normalizedSurahId,
          tafsirId,
          verseKeys: params.verseKeys,
        });
      } catch {
        // Preload is opportunistic; the tafsir page still handles read errors.
      }
    })
  );
}

export function primeOfflineTafsirSurah(params: {
  surahId: number;
  tafsirIds: number[];
  verseKeys?: string[];
}): void {
  void preloadOfflineTafsirSurah(params);
}

export function clearTafsirCache(): void {
  cache.clear();
}
