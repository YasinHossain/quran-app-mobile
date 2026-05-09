import { container } from '@/src/core/infrastructure/di/container';
import type { MushafPackId } from '@/types';

export const FALLBACK_MUSHAF_TOTAL_PAGES = 604;

export type ChapterPageRange = {
  firstPage: number;
  lastPage: number;
};

export function getChapterPageRange(
  chapter?: { pages?: number[] } | null
): ChapterPageRange | null {
  const pages = Array.isArray(chapter?.pages)
    ? chapter.pages
        .filter((page) => Number.isFinite(page) && page > 0)
        .map((page) => Math.trunc(page))
    : [];

  if (!pages.length) return null;

  return {
    firstPage: Math.min(...pages),
    lastPage: Math.max(...pages),
  };
}

export function buildPageRangeNumbers(
  range: ChapterPageRange | null,
  totalPages: number
): number[] {
  if (!range) return [];
  const lastAvailablePage = Math.max(
    1,
    Math.trunc(totalPages || FALLBACK_MUSHAF_TOTAL_PAGES)
  );
  const firstPage = Math.max(1, Math.min(range.firstPage, lastAvailablePage));
  const lastPage = Math.max(firstPage, Math.min(range.lastPage, lastAvailablePage));
  return Array.from({ length: lastPage - firstPage + 1 }, (_value, index) => firstPage + index);
}

export function clampPageToRange(pageNumber: number, range: ChapterPageRange | null): number {
  if (!range) return 1;
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return range.firstPage;
  return Math.min(Math.max(Math.trunc(pageNumber), range.firstPage), range.lastPage);
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
