import React from 'react';

import { container } from '@/src/core/infrastructure/di/container';
import {
  MushafInvalidPageNumberError,
  MushafPackNotInstalledError,
  MushafPageNotFoundError,
} from '@/src/core/infrastructure/mushaf/LocalMushafPageRepository';

import type { MushafPackId, MushafPageData } from '@/types';

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
  enabled = true,
}: {
  packId: MushafPackId;
  pageNumber: number | null;
  enabled?: boolean;
}): {
  data: MushafPageData | null;
  isLoading: boolean;
  errorKind: MushafPageErrorKind | null;
  errorMessage: string | null;
  refresh: () => void;
} {
  const [data, setData] = React.useState<MushafPageData | null>(null);
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
      setIsLoading(true);
      setErrorKind(null);
      setErrorMessage(null);

      try {
        const repository = container.getMushafPageRepository();
        const result = await repository.getPage({ packId, pageNumber });

        if (!cancelled) {
          setData(result);
        }
      } catch (error) {
        if (!cancelled) {
          const details = getErrorDetails(error);
          setData(null);
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
  }, [enabled, packId, pageNumber, refreshNonce]);

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
