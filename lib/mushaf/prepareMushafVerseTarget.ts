import { container } from '@/src/core/infrastructure/di/container';

import type { MushafPackId } from '@/types';

export type MushafPageRange = {
  firstPage: number;
  lastPage: number;
};

export type PreparedMushafVerseTarget = {
  chapterId: number;
  packId: MushafPackId;
  pageNumber: number;
  verseKey: string;
  version: string;
};

type PrepareMushafVerseTargetParams = {
  awaitPageLoad?: boolean;
  chapterId: number;
  fallbackVersion: string;
  packId: MushafPackId;
  pageRange?: MushafPageRange | null;
  shouldContinue?: () => boolean;
  verseKey: string;
};

function clampPageToRange(pageNumber: number, pageRange?: MushafPageRange | null): number {
  const normalizedPage = Math.max(1, Math.trunc(pageNumber));
  if (!pageRange) return normalizedPage;
  return Math.min(Math.max(normalizedPage, pageRange.firstPage), pageRange.lastPage);
}

export async function resolveActiveMushafVersion(
  packId: MushafPackId,
  fallbackVersion: string
): Promise<string> {
  try {
    const activeInstall = await container.getMushafPackInstallRegistry().getActive(packId);
    return activeInstall?.version?.trim() || fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

/**
 * Resolves and starts warming the exact local Mushaf page for a verse.
 * Translation-to-Mushaf can await full readiness, while external navigation can
 * enter after lookup and share the in-flight page load during the route transition.
 */
export async function prepareMushafVerseTarget({
  awaitPageLoad = true,
  chapterId,
  fallbackVersion,
  packId,
  pageRange,
  shouldContinue = () => true,
  verseKey,
}: PrepareMushafVerseTargetParams): Promise<PreparedMushafVerseTarget | null> {
  const normalizedChapterId = Math.trunc(chapterId);
  const normalizedVerseKey = verseKey.trim();
  if (normalizedChapterId <= 0 || !normalizedVerseKey || !shouldContinue()) return null;

  const repository = container.getMushafPageRepository();
  const [activeVersion, resolvedPage] = await Promise.all([
    resolveActiveMushafVersion(packId, fallbackVersion),
    repository.findPageForVerse({ packId, verseKey: normalizedVerseKey }),
  ]);
  if (!shouldContinue()) return null;

  repository.setActivePageCacheIdentity({ packId, version: activeVersion });
  if (!resolvedPage) return null;

  const pageNumber = clampPageToRange(resolvedPage, pageRange);
  const target: PreparedMushafVerseTarget = {
    chapterId: normalizedChapterId,
    packId,
    pageNumber,
    verseKey: normalizedVerseKey,
    version: activeVersion,
  };

  const loadPageAndWarmNeighbors = repository
    .getPage({ packId, pageNumber })
    .then((pageData) => {
      if (!shouldContinue() || pageData.pack.version.trim() !== activeVersion.trim()) return null;

      const firstPage = pageRange?.firstPage ?? 1;
      const lastPage = pageRange?.lastPage ?? pageData.pack.totalPages;
      const nearbyPageNumbers = [
        pageNumber - 2,
        pageNumber - 1,
        pageNumber + 1,
        pageNumber + 2,
      ].filter((candidate) => candidate >= firstPage && candidate <= lastPage);
      void repository
        .prefetchPages({
          packId,
          pageNumbers: nearbyPageNumbers,
          expectedVersion: activeVersion,
        })
        .catch(() => {
          // The mounted reader owns error presentation; neighbors are best-effort warmup.
        });

      return target;
    });

  if (awaitPageLoad) {
    return loadPageAndWarmNeighbors;
  }

  void loadPageAndWarmNeighbors
    .catch(() => {
      // Navigation can proceed from the exact lookup while the reader owns page-load errors.
    });

  return target;
}
