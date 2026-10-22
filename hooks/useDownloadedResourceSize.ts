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

// Installed downloads only change size when the installed set changes, so totals are cached per
// set for the app session. Reopening a drawer reuses the last measurement instead of rescanning
// SQLite and pack directories and making the badge flicker.
const MAX_CACHED_TOTALS = 16;
const totalBytesBySignature = new Map<string, number>();
const pendingTotalsBySignature = new Map<string, Promise<number>>();
let lastMeasuredTotalBytes: number | null = null;

function getInstalledSignature(installedItems: DownloadIndexItemWithKey[]): string {
  return installedItems
    .map((item) => `${item.key}@${item.updatedAt}`)
    .sort()
    .join('|');
}

function measureTotalBytes(
  signature: string,
  installedItems: DownloadIndexItemWithKey[]
): Promise<number> {
  const pending = pendingTotalsBySignature.get(signature);
  if (pending) return pending;

  const promise = getDownloadedResourceSizeBytes(installedItems)
    .then((bytes) => {
      if (totalBytesBySignature.size >= MAX_CACHED_TOTALS) totalBytesBySignature.clear();
      totalBytesBySignature.set(signature, bytes);
      lastMeasuredTotalBytes = bytes;
      return bytes;
    })
    .finally(() => {
      pendingTotalsBySignature.delete(signature);
    });
  pendingTotalsBySignature.set(signature, promise);
  return promise;
}

export function useDownloadedResourceSize(
  items: DownloadIndexItemWithKey[],
  {
    isIndexLoading = false,
  }: {
    /** While the index is (re)loading, `items` is not authoritative; keep the last total. */
    isIndexLoading?: boolean;
  } = {}
): { label: string | null; isLoading: boolean } {
  const installedItems = React.useMemo(
    () => items.filter((item) => item.status === 'installed'),
    [items]
  );
  const signature = React.useMemo(() => getInstalledSignature(installedItems), [installedItems]);
  const installedItemsRef = React.useRef(installedItems);
  installedItemsRef.current = installedItems;
  const [failedSignature, setFailedSignature] = React.useState<string | null>(null);
  const [, rerenderAfterMeasure] = React.useReducer((count: number) => count + 1, 0);

  React.useEffect(() => {
    if (isIndexLoading || totalBytesBySignature.has(signature)) return;

    let isCurrent = true;
    void measureTotalBytes(signature, installedItemsRef.current)
      .then(() => {
        if (isCurrent) rerenderAfterMeasure();
      })
      .catch((error) => {
        logger.warn('Failed to calculate downloaded resource size', undefined, error as Error);
        if (isCurrent) setFailedSignature(signature);
      });

    return () => {
      isCurrent = false;
    };
  }, [isIndexLoading, signature]);

  const measuredBytes = isIndexLoading ? undefined : totalBytesBySignature.get(signature);
  const hasFailed = !isIndexLoading && failedSignature === signature;
  // Until the current set is measured, keep showing the previous total rather than blanking or
  // briefly showing a total for an empty, not-yet-loaded index.
  const displayBytes = hasFailed ? null : (measuredBytes ?? lastMeasuredTotalBytes);

  return {
    label: displayBytes === null ? null : formatDownloadedResourceSize(displayBytes),
    isLoading: measuredBytes === undefined && !hasFailed,
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
