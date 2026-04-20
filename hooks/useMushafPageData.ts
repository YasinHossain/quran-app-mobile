import React from 'react';

import { container } from '@/src/core/infrastructure/di/container';
import {
  MushafInvalidPageNumberError,
  MushafPackNotInstalledError,
  MushafPageNotFoundError,
} from '@/src/core/infrastructure/mushaf/LocalMushafPageRepository';

import type { MushafPackId, MushafPageData } from '@/types';

const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;
const FIRST_QCF_V1_LOAD_KEYS = new Set<string>();

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logMushafQcfDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][useMushafPageData] ${event}`, details);
}

export type MushafPageErrorKind =
  | 'invalid-page'
  | 'pack-not-installed'
  | 'page-not-found'
  | 'unexpected';

function getErrorDetails(error: unknown): { kind: MushafPageErrorKind; message: string } {
  if (error instanceof MushafInvalidPageNumberError) {
    return {
      kind: 'invalid-page',
      message: 'This page number is not valid.',
    };
  }

  if (error instanceof MushafPackNotInstalledError) {
    return {
      kind: 'pack-not-installed',
      message: `The selected mushaf pack (${error.packId}) is not installed on this device yet.`,
    };
  }

  if (error instanceof MushafPageNotFoundError) {
    return {
      kind: 'page-not-found',
      message: `Page ${error.pageNumber} is not available in the installed mushaf pack.`,
    };
  }

  return {
    kind: 'unexpected',
    message: error instanceof Error ? error.message : 'Failed to load the local mushaf page.',
  };
}

export function useMushafPageData({
  packId,
  pageNumber,
  expectedVersion,
  enabled = true,
}: {
  packId: MushafPackId;
  pageNumber: number | null;
  expectedVersion?: string;
  enabled?: boolean;
}): {
  data: MushafPageData | null;
  isLoading: boolean;
  errorKind: MushafPageErrorKind | null;
  errorMessage: string | null;
  refresh: () => void;
} {
  const [data, setData] = React.useState<MushafPageData | null>(() => {
    if (!enabled || pageNumber === null) {
      return null;
    }

    return container.getMushafPageRepository().peekCachedPage({
      packId,
      pageNumber,
      expectedVersion,
    });
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorKind, setErrorKind] = React.useState<MushafPageErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  React.useEffect(() => {
    if (!enabled || pageNumber === null) {
      setData(null);
      setErrorKind(null);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      const startedAt = nowMs();
      const loadKey = `${packId}:${pageNumber}`;
      const repository = container.getMushafPageRepository();
      const warmCachedPage = repository.peekCachedPage({
        packId,
        pageNumber,
        expectedVersion,
      });

      if (warmCachedPage) {
        setData(warmCachedPage);
      }

      setIsLoading(warmCachedPage === null);
      setErrorKind(null);
      setErrorMessage(null);

      logMushafQcfDev('page-load-start', {
        enabled,
        expectedVersion: expectedVersion ?? null,
        packId,
        pageNumber,
        refreshNonce,
        usedWarmCache: warmCachedPage !== null,
      });

      try {
        const result = await repository.getPage({ packId, pageNumber });

        if (!cancelled) {
          setData(result);
        }

        const durationMs = Math.round(nowMs() - startedAt);
        const isFirstQcfMadaniV1Load = packId === 'qcf-madani-v1' && !FIRST_QCF_V1_LOAD_KEYS.has(loadKey);
        if (isFirstQcfMadaniV1Load) {
          FIRST_QCF_V1_LOAD_KEYS.add(loadKey);
        }

        logMushafQcfDev('page-load-success', {
          durationMs,
          isFirstQcfMadaniV1Load,
          packId,
          pageNumber,
          renderer: result.pack.renderer,
          usedWarmCache: warmCachedPage !== null,
          version: result.pack.version,
        });

        if (result.pack.renderer === 'webview') {
          const nearbyPageNumbers = [pageNumber - 1, pageNumber + 1].filter(
            (candidate) => candidate >= 1 && candidate <= result.pack.totalPages
          );

          if (nearbyPageNumbers.length > 0) {
            logMushafQcfDev('page-prefetch-start', {
              packId,
              pageNumber,
              nearbyPageNumbers,
              version: result.pack.version,
            });

            void repository.prefetchPages({
              packId,
              pageNumbers: nearbyPageNumbers,
              expectedVersion: result.pack.version,
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          const details = getErrorDetails(error);
          if (warmCachedPage === null) {
            setData(null);
          }
          setErrorKind(details.kind);
          setErrorMessage(details.message);
        }

        logMushafQcfDev('page-load-error', {
          durationMs: Math.round(nowMs() - startedAt),
          error: error instanceof Error ? error.message : String(error),
          packId,
          pageNumber,
          preservedWarmCache: warmCachedPage !== null,
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, expectedVersion, packId, pageNumber, refreshNonce]);

  const refresh = React.useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  return {
    data,
    isLoading,
    errorKind,
    errorMessage,
    refresh,
  };
}
