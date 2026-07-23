import React from 'react';

import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { WordStudyPackNotInstalledError } from '@/src/core/infrastructure/word-study';

import {
  getWordStudyLocationKey,
  type WordStudyPressEvent,
} from './WordStudyPressEvent';
import {
  toWordQuickSheetLoadState,
  type WordQuickSheetLoadState,
} from './wordQuickSheetModel';

type WordQuickSheetSession = {
  event: WordStudyPressEvent;
  loadState: WordQuickSheetLoadState;
  tapStartedAtMs: number;
  requestId: number;
};

const QUICK_SHEET_CACHE_LIMIT = 96;
let wordStudyWarmupPromise: Promise<void> | null = null;

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isCacheableLoadState(loadState: WordQuickSheetLoadState): boolean {
  return loadState.status === 'ready' || loadState.status === 'missing';
}

function rememberCachedLoadState(
  cache: Map<string, WordQuickSheetLoadState>,
  locationKey: string,
  loadState: WordQuickSheetLoadState
): void {
  if (!isCacheableLoadState(loadState)) return;
  cache.delete(locationKey);
  cache.set(locationKey, loadState);
  if (cache.size <= QUICK_SHEET_CACHE_LIMIT) return;

  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

function getCachedLoadState(
  cache: Map<string, WordQuickSheetLoadState>,
  locationKey: string
): WordQuickSheetLoadState | undefined {
  const cached = cache.get(locationKey);
  if (!cached) return undefined;
  cache.delete(locationKey);
  cache.set(locationKey, cached);
  return cached;
}

function warmWordStudyDatabaseOnce(): Promise<void> {
  if (!wordStudyWarmupPromise) {
    wordStudyWarmupPromise = container
      .getWordStudyPackInstaller()
      .getInstalledAsync()
      .then((installed) => {
        if (!installed) return undefined;
        return container.getWordStudyDatabaseProvider().getDatabaseAsync();
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        wordStudyWarmupPromise = null;
        logger.warn(
          'Word Study quick-sheet warmup skipped',
          undefined,
          error instanceof Error ? error : new Error(String(error))
        );
      });
  }
  return wordStudyWarmupPromise;
}

export type WordQuickSheetController = {
  isOpen: boolean;
  event: WordStudyPressEvent | null;
  loadState: WordQuickSheetLoadState;
  open: (event: WordStudyPressEvent) => void;
  close: () => void;
  retry: () => void;
  reportPresented: () => void;
};

export function useWordQuickSheetController(): WordQuickSheetController {
  const nextRequestIdRef = React.useRef(0);
  const cacheRef = React.useRef(new Map<string, WordQuickSheetLoadState>());
  const [isOpen, setIsOpen] = React.useState(false);
  const [session, setSession] = React.useState<WordQuickSheetSession | null>(null);

  React.useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      void warmWordStudyDatabaseOnce();
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  const load = React.useCallback(
    (
      event: WordStudyPressEvent,
      tapStartedAtMs: number,
      deferUntilNextFrame = false
    ) => {
      const requestId = ++nextRequestIdRef.current;
      const locationKey = getWordStudyLocationKey(event);
      const cachedLoadState = getCachedLoadState(cacheRef.current, locationKey);
      setSession({
        event,
        loadState: cachedLoadState ?? { status: 'loading' },
        tapStartedAtMs,
        requestId,
      });
      if (cachedLoadState) {
        logger.info('Word Study quick-sheet lookup reused cache', {
          locationKey,
          durationMs: Number((nowMs() - tapStartedAtMs).toFixed(2)),
          offline: true,
        });
        return;
      }

      const query = (): void => {
        if (nextRequestIdRef.current !== requestId) return;
        void container
          .getWordAnalysis()
          .execute(locationKey)
          .then((result) => {
            const resolvedAtMs = nowMs();
            const nextLoadState = toWordQuickSheetLoadState(result);
            rememberCachedLoadState(cacheRef.current, locationKey, nextLoadState);
            setSession((current) => {
              if (!current || current.requestId !== requestId) return current;
              logger.info('Word Study quick-sheet lookup resolved', {
                locationKey,
                durationMs: Number((resolvedAtMs - tapStartedAtMs).toFixed(2)),
                offline: true,
              });
              return { ...current, loadState: nextLoadState };
            });
          })
          .catch((error: unknown) => {
            const needsDownload =
              error instanceof WordStudyPackNotInstalledError ||
              (error instanceof Error && error.name === 'WordStudyPackNotInstalledError');
            setSession((current) => {
              if (!current || current.requestId !== requestId) return current;
              if (needsDownload) {
                logger.info('Word Study quick-sheet requires Essentials download', {
                  locationKey,
                });
              } else {
                logger.error(
                  'Word Study quick-sheet lookup failed',
                  { locationKey },
                  error instanceof Error ? error : new Error(String(error))
                );
              }
              return {
                ...current,
                loadState: {
                  status: 'error',
                  message: needsDownload
                    ? 'Download Word Study Essentials once to use morphology, meanings, and occurrences fully offline.'
                    : 'Word analysis could not be loaded from the offline study pack.',
                  needsDownload,
                },
              };
            });
          });
      };

      if (deferUntilNextFrame) {
        requestAnimationFrame(query);
      } else {
        query();
      }
    },
    []
  );

  const open = React.useCallback(
    (event: WordStudyPressEvent) => {
      const tapStartedAtMs = nowMs();
      setIsOpen(true);
      // Give the loading shell the first frame; the offline SQLite lookup begins immediately
      // afterward so opening the database cannot delay modal presentation.
      load(event, tapStartedAtMs, true);
    },
    [load]
  );

  const close = React.useCallback(() => {
    nextRequestIdRef.current += 1;
    setIsOpen(false);
  }, []);

  const retry = React.useCallback(() => {
    if (!session) return;
    load(session.event, nowMs());
  }, [load, session]);

  const reportPresented = React.useCallback(() => {
    if (!session) return;
    logger.info('Word Study quick sheet presented', {
      locationKey: getWordStudyLocationKey(session.event),
      durationMs: Number((nowMs() - session.tapStartedAtMs).toFixed(2)),
    });
  }, [session]);

  return {
    isOpen,
    event: session?.event ?? null,
    loadState: session?.loadState ?? { status: 'loading' },
    open,
    close,
    retry,
    reportPresented,
  };
}
