import React from 'react';

import { GetTafsirResourcesUseCase } from '@/src/core/application/use-cases/GetTafsirResources';
import { Tafsir } from '@/src/core/domain/entities/Tafsir';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

let cachedTafsirs: Tafsir[] | null = null;
let cachedPromise: Promise<Tafsir[]> | null = null;

async function loadTafsirs(): Promise<Tafsir[]> {
  if (cachedTafsirs) return cachedTafsirs;

  if (!cachedPromise) {
    const repository = container.getTafsirRepository();
    const useCase = new GetTafsirResourcesUseCase(repository, logger);
    cachedPromise = useCase
      .execute()
      .then((result) => {
        cachedTafsirs = result.tafsirs;
        cachedPromise = null;
        return cachedTafsirs;
      })
      .catch((error) => {
        cachedPromise = null;
        throw error;
      });
  }

  return cachedPromise;
}

export function useTafsirResources({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): {
  tafsirs: Tafsir[];
  tafsirById: Map<number, Tafsir>;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => void;
} {
  const [tafsirs, setTafsirs] = React.useState<Tafsir[]>(cachedTafsirs ?? []);
  const [isLoading, setIsLoading] = React.useState(enabled ? cachedTafsirs === null : false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fetchNow = React.useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await loadTafsirs();
      setTafsirs(result);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    void fetchNow();
  }, [fetchNow]);

  const refresh = React.useCallback(() => {
    cachedTafsirs = null;
    cachedPromise = null;
    void fetchNow();
  }, [fetchNow]);

  const tafsirById = React.useMemo(
    () => new Map<number, Tafsir>(tafsirs.map((t) => [t.id, t])),
    [tafsirs]
  );

  return { tafsirs, tafsirById, isLoading, errorMessage, refresh };
}

