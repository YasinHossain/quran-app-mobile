import type { Chapter, LastReadMap } from '@/types';

export type NormalizedLastReadEntry = {
  surahId: string;
  verseNumber: number;
  chapter: Chapter;
  verseKey?: string;
};

export function buildNormalizedLastReadEntries(
  lastRead: LastReadMap,
  chapters: Chapter[],
  limit = 5
): NormalizedLastReadEntry[] {
  const entries = Object.entries(lastRead ?? {});
  if (entries.length === 0) return [];

  const sorted = entries.sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const normalized: NormalizedLastReadEntry[] = [];

  for (const [surahId, entry] of sorted) {
    const item = normalizeLastReadEntry(surahId, entry, chapters);
    if (!item) continue;
    normalized.push(item);
    if (normalized.length === limit) break;
  }

  return normalized;
}

function normalizeLastReadEntry(
  surahId: string,
  entry: LastReadMap[string],
  chapters: Chapter[]
): NormalizedLastReadEntry | null {
  const chapter = chapters.find((candidate) => candidate.id === Number(surahId));
  if (!chapter) return null;

  const totalVerses = chapter.verses_count || 0;
  const rawVerseNumber = getRawVerseNumber(entry);
  if (!isValidVerseNumber(rawVerseNumber)) return null;

  return {
    surahId,
    verseNumber: clampVerseNumber(rawVerseNumber, totalVerses),
    chapter,
    ...(typeof entry.verseKey === 'string' ? { verseKey: entry.verseKey } : {}),
  };
}

function getRawVerseNumber(entry: LastReadMap[string]): number | undefined {
  const verseNumberFromKeyRaw =
    typeof entry.verseKey === 'string' ? Number(entry.verseKey.split(':')[1]) : undefined;
  const verseNumberFromKey =
    typeof verseNumberFromKeyRaw === 'number' && !Number.isNaN(verseNumberFromKeyRaw)
      ? verseNumberFromKeyRaw
      : undefined;

  return entry.verseNumber ?? verseNumberFromKey ?? entry.verseId;
}

function isValidVerseNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0;
}

function clampVerseNumber(num: number, total: number): number {
  return total > 0 ? Math.min(num, total) : num;
}
