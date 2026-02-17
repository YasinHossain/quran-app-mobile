import React from 'react';

import { getQdcAudioFile, type QdcAudioFile } from '@/src/core/infrastructure/audio/qdcAudio';

type CacheKey = string;

const cachedByKey = new Map<CacheKey, QdcAudioFile>();
const cachedPromises = new Map<CacheKey, Promise<QdcAudioFile>>();

function toPositiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function buildKey(
  reciterId: number | null,
  chapterId: number | null,
  segments: boolean
): { key: CacheKey; reciterId: number; chapterId: number } | null {
  const normalizedReciterId = toPositiveInt(reciterId);
  const normalizedChapterId = toPositiveInt(chapterId);
  if (!normalizedReciterId) return null;
  if (!normalizedChapterId) return null;

  return {
    key: ['qdc-audio-file', normalizedReciterId, normalizedChapterId, segments ? '1' : '0'].join(':'),
    reciterId: normalizedReciterId,
    chapterId: normalizedChapterId,
  };
}

async function loadAudioFile({
  key,
  reciterId,
  chapterId,
  segments,
}: {
  key: CacheKey;
  reciterId: number;
  chapterId: number;
  segments: boolean;
}): Promise<QdcAudioFile> {
  const cached = cachedByKey.get(key);
  if (cached) return cached;

  const existingPromise = cachedPromises.get(key);
  if (existingPromise) return existingPromise;

  const promise = getQdcAudioFile({ reciterId, chapterId, segments })
    .then((audioFile) => {
      cachedByKey.set(key, audioFile);
      cachedPromises.delete(key);
      return audioFile;
    })
    .catch((error) => {
      cachedPromises.delete(key);
      throw error;
    });

  cachedPromises.set(key, promise);
  return promise;
}

export function useQdcAudioFile(
  reciterId: number | null,
  chapterId: number | null,
  segments: boolean
): { audioFile: QdcAudioFile | undefined; isLoading: boolean; error: Error | undefined; refresh: () => void } {
  const resolved = React.useMemo(
    () => buildKey(reciterId, chapterId, segments),
    [reciterId, chapterId, segments]
  );

  const cacheKey = resolved?.key;

  const [audioFile, setAudioFile] = React.useState<QdcAudioFile | undefined>(() =>
    cacheKey ? cachedByKey.get(cacheKey) : undefined
  );
  const [isLoading, setIsLoading] = React.useState(() => Boolean(cacheKey && !cachedByKey.has(cacheKey)));
  const [error, setError] = React.useState<Error | undefined>(undefined);

  React.useEffect(() => {
    if (!resolved) {
      setAudioFile(undefined);
      setIsLoading(false);
      setError(undefined);
      return;
    }

    setAudioFile(cachedByKey.get(resolved.key));
    setIsLoading(!cachedByKey.has(resolved.key));
    setError(undefined);
  }, [resolved]);

  const fetchNow = React.useCallback(async (): Promise<void> => {
    if (!resolved) return;
    setIsLoading(true);
    setError(undefined);

    try {
      const result = await loadAudioFile({
        key: resolved.key,
        reciterId: resolved.reciterId,
        chapterId: resolved.chapterId,
        segments,
      });
      setAudioFile(result);
    } catch (fetchError) {
      setError(fetchError as Error);
    } finally {
      setIsLoading(false);
    }
  }, [resolved, segments]);

  React.useEffect(() => {
    void fetchNow();
  }, [fetchNow]);

  const refresh = React.useCallback(() => {
    if (!resolved) return;
    cachedByKey.delete(resolved.key);
    cachedPromises.delete(resolved.key);
    void fetchNow();
  }, [fetchNow, resolved]);

  return {
    audioFile,
    isLoading: Boolean(isLoading && !audioFile),
    error,
    refresh,
  };
}

