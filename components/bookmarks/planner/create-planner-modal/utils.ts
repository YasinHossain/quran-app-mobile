import type { Chapter } from '@/types';

import type { PlanFormData } from './types';

export interface PlannerStatsResult {
  totalVerses: number;
  versesPerDay: number;
  isValidRange: boolean;
}

export interface PlannerPlanDefinition {
  surahId: number;
  planName: string;
  versesCount: number;
  startVerse: number;
  endVerse: number;
}

const clampVerse = (verse: number | undefined, maxVerse: number, fallback: number): number => {
  if (maxVerse <= 0) return fallback;
  if (typeof verse !== 'number' || !Number.isFinite(verse) || verse < 1) {
    return fallback;
  }
  if (verse > maxVerse) return maxVerse;
  return verse;
};

export const buildChapterLookup = (chapters: Chapter[]): Record<number, Chapter> =>
  chapters.reduce<Record<number, Chapter>>((acc, chapter) => {
    acc[chapter.id] = chapter;
    return acc;
  }, {});

export function getPlannerStats(chapters: Chapter[], formData: PlanFormData): PlannerStatsResult {
  const chapterLookup = buildChapterLookup(chapters);

  const startSurah = formData.startSurah;
  const endSurah = formData.endSurah;
  const startChapter = typeof startSurah === 'number' ? chapterLookup[startSurah] : undefined;
  const endChapter = typeof endSurah === 'number' ? chapterLookup[endSurah] : undefined;

  const normalizedStartVerse =
    startChapter?.verses_count != null
      ? clampVerse(formData.startVerse, startChapter.verses_count, 1)
      : undefined;
  const normalizedEndVerse =
    endChapter?.verses_count != null && endChapter.verses_count > 0
      ? clampVerse(formData.endVerse, endChapter.verses_count, endChapter.verses_count)
      : undefined;

  const totalVerses = (() => {
    if (
      typeof startSurah !== 'number' ||
      typeof endSurah !== 'number' ||
      startSurah > endSurah ||
      !startChapter ||
      !endChapter ||
      typeof normalizedStartVerse !== 'number' ||
      typeof normalizedEndVerse !== 'number'
    ) {
      return 0;
    }

    if (startSurah === endSurah) {
      if (normalizedStartVerse > normalizedEndVerse) return 0;
      return normalizedEndVerse - normalizedStartVerse + 1;
    }

    let total = 0;
    total += startChapter.verses_count - (normalizedStartVerse - 1);
    total += normalizedEndVerse;

    for (let surahId = startSurah + 1; surahId < endSurah; surahId++) {
      const chapter = chapterLookup[surahId];
      if (chapter) {
        total += chapter.verses_count;
      }
    }

    return total;
  })();

  const estimatedDays = Math.max(1, Math.round(formData.estimatedDays || 1));
  const versesPerDay = totalVerses > 0 ? Math.ceil(totalVerses / estimatedDays) : 0;
  const isValidRange =
    typeof startSurah === 'number' &&
    typeof endSurah === 'number' &&
    startSurah <= endSurah &&
    !!startChapter &&
    !!endChapter &&
    (startSurah !== endSurah ||
      (typeof normalizedStartVerse === 'number' &&
        typeof normalizedEndVerse === 'number' &&
        normalizedStartVerse <= normalizedEndVerse));

  return { totalVerses, versesPerDay, isValidRange };
}

const clampVerseToChapter = (chapter: Chapter, verse: number | undefined, fallback: number): number => {
  const max = chapter.verses_count ?? 0;
  if (max <= 0) return fallback;
  if (typeof verse !== 'number' || !Number.isFinite(verse) || verse < 1) {
    return fallback;
  }
  if (verse > max) return max;
  return verse;
};

const pushDefinition = (
  definitions: PlannerPlanDefinition[],
  chapter: Chapter,
  planName: string,
  rangeStart: number,
  rangeEnd: number
): void => {
  const max = chapter.verses_count ?? 0;
  if (max <= 0) return;
  const safeStart = Math.max(1, rangeStart);
  const safeEnd = Math.max(safeStart, Math.min(rangeEnd, max));
  const versesCount = safeEnd - safeStart + 1;
  if (versesCount <= 0) return;

  definitions.push({
    surahId: chapter.id,
    planName,
    versesCount,
    startVerse: safeStart,
    endVerse: safeEnd,
  });
};

export function buildPlannerPlanDefinitions(
  formData: PlanFormData,
  chapters: Chapter[]
): PlannerPlanDefinition[] {
  const { startSurah, startVerse, endSurah, endVerse } = formData;
  const trimmedBaseName = formData.planName.trim();

  if (!startSurah || !endSurah || startSurah > endSurah || trimmedBaseName.length === 0) {
    return [];
  }

  const startChapter = chapters.find((c) => c.id === startSurah);
  const endChapter = chapters.find((c) => c.id === endSurah);
  if (!startChapter || !endChapter) return [];

  const normalizedStartVerse = clampVerseToChapter(startChapter, startVerse, 1);
  const normalizedEndVerse = clampVerseToChapter(
    endChapter,
    endVerse,
    endChapter.verses_count ?? 1
  );

  if (startSurah === endSurah) {
    if (normalizedStartVerse > normalizedEndVerse) return [];
    const definitions: PlannerPlanDefinition[] = [];
    pushDefinition(definitions, startChapter, trimmedBaseName, normalizedStartVerse, normalizedEndVerse);
    return definitions;
  }

  const definitions: PlannerPlanDefinition[] = [];
  pushDefinition(
    definitions,
    startChapter,
    trimmedBaseName,
    normalizedStartVerse,
    startChapter.verses_count ?? normalizedStartVerse
  );

  for (let surahId = startSurah + 1; surahId < endSurah; surahId++) {
    const chapter = chapters.find((c) => c.id === surahId);
    if (!chapter) continue;
    pushDefinition(definitions, chapter, trimmedBaseName, 1, chapter.verses_count ?? 1);
  }

  pushDefinition(definitions, endChapter, trimmedBaseName, 1, normalizedEndVerse);

  return definitions;
}

