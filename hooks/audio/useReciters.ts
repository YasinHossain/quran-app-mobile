import React from 'react';

import { getQdcAudioReciters, type QdcAudioReciterApi } from '@/src/core/infrastructure/audio/qdcAudio';

// Default reciter to use while loading or if the API fails (web parity)
export const DEFAULT_RECITER: Reciter = {
  id: 173,
  name: 'Mishari Rashid al-`Afasy',
  locale: 'Murattal',
};

export type Reciter = {
  id: number;
  name: string;
  locale?: string;
};

const cachedByLanguage = new Map<string, Reciter[]>();
const cachedPromises = new Map<string, Promise<Reciter[]>>();

function normalizeLanguage(value: string | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) return 'en';
  return trimmed.split('-')[0] || 'en';
}

function toPositiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function mapQdcReciterToReciter(reciter: QdcAudioReciterApi): Reciter | null {
  const id = toPositiveInt(reciter.id);
  if (!id) return null;

  const name = String(reciter.translated_name?.name ?? reciter.name ?? '').trim();
  const localeParts = [reciter.style?.name].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  const locale = localeParts.join(' • ');

  return {
    id,
    name: name || 'Unknown reciter',
    ...(locale ? { locale } : {}),
  };
}

async function loadReciters(language: string): Promise<Reciter[]> {
  const normalizedLanguage = normalizeLanguage(language);

  const cached = cachedByLanguage.get(normalizedLanguage);
  if (cached) return cached;

  const existingPromise = cachedPromises.get(normalizedLanguage);
  if (existingPromise) return existingPromise;

  const promise = getQdcAudioReciters(normalizedLanguage)
    .then((apiReciters) => {
      const reciters = (apiReciters ?? [])
        .map(mapQdcReciterToReciter)
        .filter((r): r is Reciter => r !== null)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      cachedByLanguage.set(normalizedLanguage, reciters);
      cachedPromises.delete(normalizedLanguage);
      return reciters;
    })
    .catch((error) => {
      cachedPromises.delete(normalizedLanguage);
      throw error;
    });

  cachedPromises.set(normalizedLanguage, promise);
  return promise;
}

export function useReciters({
  enabled = true,
  language,
}: {
  enabled?: boolean;
  language?: string;
} = {}): { reciters: Reciter[]; isLoading: boolean; error: Error | undefined; refresh: () => void } {
  const normalizedLanguage = normalizeLanguage(language);

  const [reciters, setReciters] = React.useState<Reciter[]>(
    cachedByLanguage.get(normalizedLanguage) ?? []
  );
  const [isLoading, setIsLoading] = React.useState(
    enabled ? !cachedByLanguage.has(normalizedLanguage) : false
  );
  const [error, setError] = React.useState<Error | undefined>(undefined);

  React.useEffect(() => {
    setReciters(cachedByLanguage.get(normalizedLanguage) ?? []);
    setIsLoading(enabled ? !cachedByLanguage.has(normalizedLanguage) : false);
    setError(undefined);
  }, [enabled, normalizedLanguage]);

  const fetchNow = React.useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsLoading(true);
    setError(undefined);

    try {
      const result = await loadReciters(normalizedLanguage);
      setReciters(result);
    } catch (fetchError) {
      setError(fetchError as Error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, normalizedLanguage]);

  React.useEffect(() => {
    void fetchNow();
  }, [fetchNow]);

  const refresh = React.useCallback(() => {
    cachedByLanguage.delete(normalizedLanguage);
    cachedPromises.delete(normalizedLanguage);
    void fetchNow();
  }, [fetchNow, normalizedLanguage]);

  return {
    reciters,
    isLoading: Boolean(isLoading && reciters.length === 0),
    error,
    refresh,
  };
}

