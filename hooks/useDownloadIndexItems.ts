import React from 'react';

import { ListDownloadIndexItemsUseCase } from '@/src/core/application/use-cases/ListDownloadIndexItems';
import type {
  DownloadIndexItemWithKey,
  DownloadKey,
  DownloadProgress,
  DownloadableContent,
} from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

function isSameDownloadContent(a: DownloadableContent, b: DownloadableContent): boolean {
  if (a.kind !== b.kind) return false;

  if (a.kind === 'translation' && b.kind === 'translation') {
    return a.translationId === b.translationId;
  }

  if (a.kind === 'tafsir' && b.kind === 'tafsir') {
    const scopeA = 'scope' in a ? a.scope : undefined;
    const scopeB = 'scope' in b ? b.scope : undefined;
    const surahA = 'surahId' in a ? a.surahId : undefined;
    const surahB = 'surahId' in b ? b.surahId : undefined;

    return a.tafsirId === b.tafsirId && scopeA === scopeB && surahA === surahB;
  }

  if (a.kind === 'audio' && b.kind === 'audio') {
    return a.reciterId === b.reciterId && a.scope === b.scope && a.surahId === b.surahId;
  }

  if (a.kind === 'words' && b.kind === 'words') {
    return a.scope === b.scope && a.surahId === b.surahId;
  }

  return false;
}

function isSameProgress(a: DownloadProgress | undefined, b: DownloadProgress | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;

  if (a.kind === 'percent' && b.kind === 'percent') {
    return a.percent === b.percent;
  }

  if (a.kind === 'items' && b.kind === 'items') {
    return a.completed === b.completed && a.total === b.total;
  }

  return false;
}

function areItemsEqual(
  current: DownloadIndexItemWithKey[],
  incoming: DownloadIndexItemWithKey[]
): boolean {
  if (current === incoming) return true;
  if (current.length !== incoming.length) return false;

  const incomingByKey = new Map<string, DownloadIndexItemWithKey>();
  for (const item of incoming) {
    incomingByKey.set(item.key, item);
  }

  for (const a of current) {
    const b = incomingByKey.get(a.key);
    if (!a || !b) return false;

    if (a.status !== b.status) return false;
    if (a.error !== b.error) return false;
    if (a.createdAt !== b.createdAt) return false;
    if (a.updatedAt !== b.updatedAt) return false;
    if (!isSameDownloadContent(a.content, b.content)) return false;
    if (!isSameProgress(a.progress, b.progress)) return false;
  }

  return true;
}

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

  const hasActiveItems = React.useMemo(() => {
    return items.some(
      (item) =>
        item.status === 'queued' || item.status === 'downloading' || item.status === 'deleting'
    );
  }, [items]);

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
        setItems((previous) => (areItemsEqual(previous, result) ? previous : result));
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
    if (!hasActiveItems) return;

    const intervalId = setInterval(() => {
      void load(false);
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [enabled, pollIntervalMs, hasActiveItems, load]);

  const refresh = React.useCallback(() => {
    void load(true);
  }, [load]);

  const itemsByKey = React.useMemo(
    () => new Map<DownloadKey, DownloadIndexItemWithKey>(items.map((item) => [item.key, item])),
    [items]
  );

  return { items, itemsByKey, isLoading, errorMessage, refresh };
}
