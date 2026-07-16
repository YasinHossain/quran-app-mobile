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
 * Resolves and warms the exact local Mushaf page for a verse before the reader
 * route changes. Translation-to-Mushaf switches and explicit navigation share
 * this path so both enter on the same page with the same highlighted verse.
 */
export async function prepareMushafVerseTarget({
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
  const activeVersion = await resolveActiveMushafVersion(packId, fallbackVersion);
  if (!shouldContinue()) return null;

  repository.setActivePageCacheIdentity({ packId, version: activeVersion });
  const resolvedPage = await repository.findPageForVerse({
    packId,
    verseKey: normalizedVerseKey,
  });
  if (!resolvedPage || !shouldContinue()) return null;

  const pageNumber = clampPageToRange(resolvedPage, pageRange);
  const pageData = await repository.getPage({ packId, pageNumber });
  if (!shouldContinue() || pageData.pack.version.trim() !== activeVersion.trim()) return null;

  const target: PreparedMushafVerseTarget = {
    chapterId: normalizedChapterId,
    packId,
    pageNumber,
    verseKey: normalizedVerseKey,
    version: activeVersion,
  };

  const firstPage = pageRange?.firstPage ?? 1;
  const lastPage = pageRange?.lastPage ?? pageData.pack.totalPages;
  const nearbyPageNumbers = [pageNumber - 2, pageNumber - 1, pageNumber + 1, pageNumber + 2].filter(
    (candidate) => candidate >= firstPage && candidate <= lastPage
  );
  void repository
    .prefetchPages({
      packId,
      pageNumbers: nearbyPageNumbers,
      expectedVersion: activeVersion,
    })
    .catch(() => {
      // The mounted reader owns error presentation; neighboring pages are best-effort warmup.
    });

  return target;
}
