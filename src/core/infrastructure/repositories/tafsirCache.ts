import { getItem, parseJson, removeItem, setItem } from '@/lib/storage/appStorage';
import { Tafsir, type TafsirData } from '@/src/core/domain/entities/Tafsir';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

const CACHE_KEY = 'tafsir-resources';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

type CachePayload = { timestamp: number; data: TafsirData[] };

export async function cacheResources(tafsirs: Tafsir[]): Promise<void> {
  try {
    const payload: CachePayload = {
      timestamp: Date.now(),
      data: tafsirs.map((t) => t.toJSON()),
    };
    await setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.warn('Failed to cache tafsir resources', undefined, error as Error);
  }
}

export async function getCachedResources(): Promise<Tafsir[]> {
  try {
    const payload = parseJson<CachePayload>(await getItem(CACHE_KEY));
    if (!payload) return [];

    if (!payload.timestamp || !Array.isArray(payload.data)) {
      await removeItem(CACHE_KEY);
      return [];
    }

    const now = Date.now();
    if (now - payload.timestamp > CACHE_TTL_MS) {
      await removeItem(CACHE_KEY);
      return [];
    }

    return payload.data.map((data) => Tafsir.fromJSON(data));
  } catch (error) {
    logger.warn('Failed to read cached tafsir resources', undefined, error as Error);
    await removeItem(CACHE_KEY);
    return [];
  }
}

