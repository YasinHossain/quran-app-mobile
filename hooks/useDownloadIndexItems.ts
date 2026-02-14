import React from 'react';

import { ListDownloadIndexItemsUseCase } from '@/src/core/application/use-cases/ListDownloadIndexItems';
import type { DownloadIndexItemWithKey, DownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

export function useDownloadIndexItems({
  enabled = true,
  pollIntervalMs = 1000,
}: {
  enabled?: boolean;
  pollIntervalMs?: number;
} = {}): {
  items: DownloadIndexItemWithKey[];
  itemsByKey: Map<DownloadKey, DownloadIndexItemWithKey>;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => void;
} {
  const [items, setItems] = React.useState<DownloadIndexItemWithKey[]>([]);
  const [isLoading, setIsLoading] = React.useState(enabled);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const inFlightRef = React.useRef(false);

  const load = React.useCallback(
    async (showSpinner: boolean): Promise<void> => {
      if (!enabled) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      if (showSpinner) setIsLoading(true);

      try {
        const repository = container.getDownloadIndexRepository();
        const useCase = new ListDownloadIndexItemsUseCase(repository);
        const result = await useCase.execute();
        setItems(result);
        setErrorMessage(null);
      } catch (error) {
        logger.warn('Failed to load download index items', undefined, error as Error);
        setErrorMessage((error as Error).message);
      } finally {
        inFlightRef.current = false;
        if (showSpinner) setIsLoading(false);
      }
    },
    [enabled]
  );

  React.useEffect(() => {
    void load(true);
  }, [load]);

  React.useEffect(() => {
    if (!enabled) return;
    if (!pollIntervalMs || pollIntervalMs <= 0) return;

    const intervalId = setInterval(() => {
      void load(false);
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [enabled, pollIntervalMs, load]);

  const refresh = React.useCallback(() => {
    void load(true);
  }, [load]);

  const itemsByKey = React.useMemo(
    () => new Map<DownloadKey, DownloadIndexItemWithKey>(items.map((item) => [item.key, item])),
    [items]
  );

  return { items, itemsByKey, isLoading, errorMessage, refresh };
}

