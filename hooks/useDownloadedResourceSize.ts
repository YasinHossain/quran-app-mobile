import React from 'react';

import type { DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import {
  getDownloadedResourceSizeBytes,
  getDownloadedResourceSizeBytesByKey,
} from '@/src/core/infrastructure/downloads/getDownloadedResourceSizeBytes';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

const BYTES_PER_MEGABYTE = 1024 * 1024;

export function formatDownloadedResourceSize(bytes: number): string {
  const megabytes = Math.max(0, bytes) / BYTES_PER_MEGABYTE;
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

export function useDownloadedResourceSize(
  items: DownloadIndexItemWithKey[]
): { label: string | null; isLoading: boolean } {
  const installedItems = React.useMemo(
    () => items.filter((item) => item.status === 'installed'),
    [items]
  );
  const installedItemKey = React.useMemo(
    () => installedItems.map((item) => item.key).sort().join('|'),
    [installedItems]
  );
  const [sizeBytes, setSizeBytes] = React.useState<number | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isCurrent = true;

    if (installedItems.length === 0) {
      setSizeBytes(0);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoading(true);
    void getDownloadedResourceSizeBytes(installedItems)
      .then((nextSizeBytes) => {
        if (isCurrent) setSizeBytes(nextSizeBytes);
      })
      .catch((error) => {
        logger.warn('Failed to calculate downloaded resource size', undefined, error as Error);
        if (isCurrent) setSizeBytes(null);
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [installedItemKey, installedItems]);

  return {
    label: sizeBytes === null ? null : formatDownloadedResourceSize(sizeBytes),
    isLoading,
  };
}

export function useDownloadedResourceSizes(
  items: DownloadIndexItemWithKey[]
): { labelsByKey: Record<string, string>; bytesByKey: Record<string, number>; isLoading: boolean } {
  const installedItems = React.useMemo(
    () => items.filter((item) => item.status === 'installed'),
    [items]
  );
  const installedItemKey = React.useMemo(
    () => installedItems.map((item) => item.key).sort().join('|'),
    [installedItems]
  );
  const [bytesByKey, setBytesByKey] = React.useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isCurrent = true;

    if (installedItems.length === 0) {
      setBytesByKey({});
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoading(true);
    void getDownloadedResourceSizeBytesByKey(installedItems)
      .then((nextBytesByKey) => {
        if (isCurrent) setBytesByKey(nextBytesByKey);
      })
      .catch((error) => {
        logger.warn('Failed to calculate individual downloaded resource sizes', undefined, error as Error);
        if (isCurrent) setBytesByKey({});
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [installedItemKey, installedItems]);

  const labelsByKey = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(bytesByKey).map(([key, bytes]) => [key, formatDownloadedResourceSize(bytes)])
      ),
    [bytesByKey]
  );

  return { labelsByKey, bytesByKey, isLoading };
}
