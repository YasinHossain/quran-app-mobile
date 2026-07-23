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

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
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
  const [isOpen, setIsOpen] = React.useState(false);
  const [session, setSession] = React.useState<WordQuickSheetSession | null>(null);

  const load = React.useCallback(
    (
      event: WordStudyPressEvent,
      tapStartedAtMs: number,
      deferUntilNextFrame = false
    ) => {
      const requestId = ++nextRequestIdRef.current;
      setSession({ event, loadState: { status: 'loading' }, tapStartedAtMs, requestId });
      const locationKey = getWordStudyLocationKey(event);

      const query = (): void => {
        if (nextRequestIdRef.current !== requestId) return;
        void container
          .getWordAnalysis()
          .execute(locationKey)
          .then((result) => {
            const resolvedAtMs = nowMs();
            setSession((current) => {
              if (!current || current.requestId !== requestId) return current;
              logger.info('Word Study quick-sheet lookup resolved', {
                locationKey,
                durationMs: Number((resolvedAtMs - tapStartedAtMs).toFixed(2)),
                offline: true,
              });
              return { ...current, loadState: toWordQuickSheetLoadState(result) };
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
