import { GetTafsirContentUseCase } from '@/src/core/application/use-cases/GetTafsirContent';
import { container } from '@/src/core/infrastructure/di/container';

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MAX_CACHE_SIZE = 50;

interface CacheEntry {
  value: Promise<string>;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export function getTafsirCached(verseKey: string, tafsirId = 169): Promise<string> {
  const key = `${tafsirId}-${verseKey}`;
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  for (const [entryKey, entry] of cache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      cache.delete(entryKey);
    }
  }

  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const removeCount = cache.size - MAX_CACHE_SIZE + 1;
    for (let i = 0; i < removeCount; i++) {
      const entry = oldest[i];
      if (!entry) break;
      cache.delete(entry[0]);
    }
  }

  const repository = container.getTafsirRepository();
  const useCase = new GetTafsirContentUseCase(repository);
  const value = useCase.execute(verseKey, tafsirId);
  cache.set(key, { value, timestamp: now });
  return value;
}

export function clearTafsirCache(): void {
  cache.clear();
}

