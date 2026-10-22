import React from 'react';

import { container } from '@/src/core/infrastructure/di/container';
import {
  MushafInvalidPageNumberError,
  MushafPackNotInstalledError,
  MushafPageNotFoundError,
} from '@/src/core/infrastructure/mushaf/LocalMushafPageRepository';

import type { MushafPackId, MushafPageData } from '@/types';

function isExpectedPageData(params: {
  data: MushafPageData | null;
  expectedVersion?: string;
  packId: MushafPackId;
  pageNumber: number | null;
}): params is {
  data: MushafPageData;
  expectedVersion?: string;
  packId: MushafPackId;
  pageNumber: number;
} {
  if (!params.data || params.pageNumber === null) {
    return false;
  }

  if (params.data.pack.packId !== params.packId || params.data.pageNumber !== params.pageNumber) {
    return false;
  }

  const expectedVersion = params.expectedVersion?.trim();
  return !expectedVersion || params.data.pack.version.trim() === expectedVersion;
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
      const repository = container.getMushafPageRepository();
      const warmCachedPage = repository.peekCachedPage({
        packId,
        pageNumber,
        expectedVersion,
      });

      if (warmCachedPage) {
        setData(warmCachedPage);
      } else {
        setData(null);
      }

      setIsLoading(warmCachedPage === null);
      setErrorKind(null);
      setErrorMessage(null);

      try {
        const result = await repository.getPage({ packId, pageNumber });

        if (!cancelled) {
          setData(result);
        }

        if (result.pack.renderer === 'webview') {
          const nearbyPageNumbers = [pageNumber - 2, pageNumber - 1, pageNumber + 1, pageNumber + 2]
            .filter((candidate) => candidate >= 1 && candidate <= result.pack.totalPages);

          if (nearbyPageNumbers.length > 0) {
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

  const stateData = isExpectedPageData({ data, expectedVersion, packId, pageNumber }) ? data : null;
  const warmCachedData =
    enabled && pageNumber !== null
      ? container.getMushafPageRepository().peekCachedPage({
          packId,
          pageNumber,
          expectedVersion,
        })
      : null;
  const resolvedData = stateData ?? warmCachedData;
  const hasResolvedData = resolvedData !== null;

  return {
    data: resolvedData,
    isLoading: hasResolvedData ? false : isLoading,
    errorKind: hasResolvedData ? null : errorKind,
    errorMessage: hasResolvedData ? null : errorMessage,
    refresh,
  };
}
