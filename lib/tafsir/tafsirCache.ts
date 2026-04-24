import { getAppDbAsync, getAppDbSync } from '@/src/core/infrastructure/db';

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MAX_CACHE_SIZE = 400;

interface CacheEntry {
  value: Promise<string | null>;
  snapshot?: string | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(verseKey: string, tafsirId: number): string {
  return `${tafsirId}-${verseKey.trim()}`;
}

function pruneCache(now: number): void {
  for (const [entryKey, entry] of cache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      cache.delete(entryKey);
    }
  }

  if (cache.size < MAX_CACHE_SIZE) return;

  const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  const removeCount = cache.size - MAX_CACHE_SIZE + 1;
  for (let i = 0; i < removeCount; i += 1) {
    const entry = oldest[i];
    if (!entry) break;
    cache.delete(entry[0]);
  }
}

function seedCachedValue(verseKey: string, tafsirId: number, html: string | null): void {
  const normalizedVerseKey = verseKey.trim();
  if (!normalizedVerseKey) return;

  const key = getCacheKey(normalizedVerseKey, tafsirId);
  cache.set(key, {
    value: Promise.resolve(html),
    snapshot: html,
    timestamp: Date.now(),
  });
}

export function primeOfflineTafsirCacheValue(
  verseKey: string,
  tafsirId: number,
  html: string | null
): void {
  seedCachedValue(verseKey, tafsirId, html);
}

function peekCachedValue(verseKey: string, tafsirId: number): string | null | undefined {
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
): Promise<Map<string, string | null>> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedVerseKeys = Array.from(
    new Set(
      verseKeys
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );

  const results = new Map<string, string | null>();
  for (const verseKey of normalizedVerseKeys) {
    results.set(verseKey, null);
  }

  if (normalizedTafsirId <= 0 || normalizedVerseKeys.length === 0) {
    return results;
  }

  const placeholders = normalizedVerseKeys.map(() => '?').join(', ');
  const db = await getAppDbAsync();
  const rows = await db.getAllAsync<{ verse_key: string; html: string }>(
    `
    SELECT verse_key, html
    FROM offline_tafsir
    WHERE tafsir_id = ?
      AND verse_key IN (${placeholders});
    `,
    [normalizedTafsirId, ...normalizedVerseKeys]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, row.html);
  }

  return results;
}

function readOfflineTafsirRowsSync(
  tafsirId: number,
  verseKeys: string[]
): Map<string, string | null> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedVerseKeys = Array.from(
    new Set(
      verseKeys
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );

  const results = new Map<string, string | null>();
  for (const verseKey of normalizedVerseKeys) {
    results.set(verseKey, null);
  }

  if (normalizedTafsirId <= 0 || normalizedVerseKeys.length === 0) {
    return results;
  }

  const placeholders = normalizedVerseKeys.map(() => '?').join(', ');
  const db = getAppDbSync();
  const rows = db.getAllSync<{ verse_key: string; html: string }>(
    `
    SELECT verse_key, html
    FROM offline_tafsir
    WHERE tafsir_id = ?
      AND verse_key IN (${placeholders});
    `,
    [normalizedTafsirId, ...normalizedVerseKeys]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, row.html);
  }

  return results;
}

async function readOfflineTafsirSurahRows(
  tafsirId: number,
  surahId: number
): Promise<Map<string, string>> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedSurahId = Number.isFinite(surahId) ? Math.trunc(surahId) : 0;
  const results = new Map<string, string>();

  if (normalizedTafsirId <= 0 || normalizedSurahId <= 0) {
    return results;
  }

  const db = await getAppDbAsync();
  const rows = await db.getAllAsync<{ verse_key: string; html: string }>(
    `
    SELECT verse_key, html
    FROM offline_tafsir
    WHERE tafsir_id = ?
      AND verse_key LIKE ?;
    `,
    [normalizedTafsirId, `${normalizedSurahId}:%`]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, row.html);
  }

  return results;
}

function readOfflineTafsirSurahRowsSync(
  tafsirId: number,
  surahId: number
): Map<string, string> {
  const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
  const normalizedSurahId = Number.isFinite(surahId) ? Math.trunc(surahId) : 0;
  const results = new Map<string, string>();

  if (normalizedTafsirId <= 0 || normalizedSurahId <= 0) {
    return results;
  }

  const db = getAppDbSync();
  const rows = db.getAllSync<{ verse_key: string; html: string }>(
    `
    SELECT verse_key, html
    FROM offline_tafsir
    WHERE tafsir_id = ?
      AND verse_key LIKE ?;
    `,
    [normalizedTafsirId, `${normalizedSurahId}:%`]
  );

  for (const row of rows) {
    const verseKey = String(row.verse_key ?? '').trim();
    if (!verseKey) continue;
    results.set(verseKey, row.html);
  }

  return results;
}

export function getOfflineTafsirCached(verseKey: string, tafsirId = 169): Promise<string | null> {
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
    .then((html) => {
      const current = cache.get(key);
      if (current) {
        cache.set(key, {
          ...current,
          snapshot: html,
          timestamp: Date.now(),
        });
      }
      return html;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { value, timestamp: now });
  return value;
}

export function getOfflineTafsirSnapshot(verseKey: string, tafsirId = 169): string | null {
  const normalizedVerseKey = String(verseKey ?? '').trim();
  if (!normalizedVerseKey) return null;

  const cached = peekCachedValue(normalizedVerseKey, tafsirId);
  if (cached !== undefined) return cached;

  try {
    const rows = readOfflineTafsirRowsSync(tafsirId, [normalizedVerseKey]);
    const html = rows.get(normalizedVerseKey) ?? null;
    seedCachedValue(normalizedVerseKey, tafsirId, html);
    return html;
  } catch {
    return null;
  }
}

export async function getOfflineTafsirBatchCached(
  verseKeys: string[],
  tafsirId = 169
): Promise<Map<string, string | null>> {
  const normalizedVerseKeys = Array.from(
    new Set(
      verseKeys
        .map((verseKey) => String(verseKey ?? '').trim())
        .filter((verseKey) => verseKey.length > 0)
    )
  );

  const results = new Map<string, string | null>();
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
      const html = rowsByVerseKey.get(verseKey) ?? null;
      seedCachedValue(verseKey, tafsirId, html);
      results.set(verseKey, html);
    }
  }

  for (const verseKey of normalizedVerseKeys) {
    if (!results.has(verseKey)) {
      results.set(verseKey, null);
    }
  }

  return results;
}

export function getOfflineTafsirSurahSnapshot(params: {
  surahId: number;
  tafsirId?: number;
  verseKeys?: string[];
}): Map<string, string | null> {
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
  const results = new Map<string, string | null>();

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
      for (const [verseKey, html] of rowsByVerseKey) {
        seedCachedValue(verseKey, normalizedTafsirId, html);
        results.set(verseKey, html);
      }
      return results;
    }

    for (const verseKey of expectedVerseKeys) {
      const html = rowsByVerseKey.get(verseKey) ?? null;
      seedCachedValue(verseKey, normalizedTafsirId, html);
      results.set(verseKey, html);
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
}): Promise<Map<string, string | null>> {
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
  const results = new Map<string, string | null>();

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
    for (const [verseKey, html] of rowsByVerseKey) {
      seedCachedValue(verseKey, normalizedTafsirId, html);
      results.set(verseKey, html);
    }
    return results;
  }

  for (const verseKey of expectedVerseKeys) {
    const html = rowsByVerseKey.get(verseKey) ?? null;
    seedCachedValue(verseKey, normalizedTafsirId, html);
    results.set(verseKey, html);
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
