import { buildSurahRangeNameLabel, getChapterDisplayName } from '@/components/bookmarks/planner/utils/planGrouping';
import { mapGlobalVerseToPosition } from '@/components/bookmarks/planner/utils/plannerGroupCard/plannerGroupCard.goal';
import {
  convertPlanProgressToActualVerse,
  getPlanEndVerse,
  getPlanStartVerse,
} from '@/components/bookmarks/planner/utils/planRange';
import { formatPlannerRangeDetails } from '@/components/bookmarks/planner/utils/planRangeLabel';

import type { PlannerCardChapter } from '@/components/bookmarks/planner/PlannerCard.types';
import type { PlannerPlanGroup } from '@/components/bookmarks/planner/utils/planGrouping';
import type { Chapter, PlannerPlan } from '@/types';

interface ProgressMergeResult {
  totalTarget: number;
  totalCompleted: number;
  earliestCreated: number;
  latestUpdated: number;
}

const mergeProgress = (plans: PlannerPlan[]): ProgressMergeResult =>
  plans.reduce<ProgressMergeResult>(
    (result, plan) => {
      const safeTarget = Math.max(0, plan.targetVerses);
      const safeCompleted = Math.max(0, Math.min(plan.completedVerses, safeTarget));

      result.totalTarget += safeTarget;
      result.totalCompleted += safeCompleted;
      result.earliestCreated = Math.min(result.earliestCreated, plan.createdAt);
      result.latestUpdated = Math.max(result.latestUpdated, plan.lastUpdated);

      return result;
    },
    {
      totalTarget: 0,
      totalCompleted: 0,
      earliestCreated: Number.POSITIVE_INFINITY,
      latestUpdated: 0,
    }
  );

const resolveChapterPage = (chapter: Chapter | undefined, index: 0 | 1): number | undefined => {
  const page = chapter?.pages?.[index];
  return typeof page === 'number' ? page : undefined;
};

const buildChapterPages = (surahIds: number[], chapterLookup: Map<number, Chapter>): [number, number] | undefined => {
  if (surahIds.length === 0) return undefined;
  const startChapter = chapterLookup.get(surahIds[0]!);
  const endChapter = chapterLookup.get(surahIds[surahIds.length - 1]!);
  const startPage = resolveChapterPage(startChapter, 0);
  const endPage = resolveChapterPage(endChapter, 1);
  return typeof startPage === 'number' && typeof endPage === 'number' ? [startPage, endPage] : undefined;
};

const clampCompletedVerse = (plan: PlannerPlan): number => {
  if (plan.targetVerses <= 0) return getPlanStartVerse(plan);
  const safeTarget = Math.max(1, plan.targetVerses);
  const safeCompleted = Math.max(1, plan.completedVerses);
  const progressVerse = Math.min(safeCompleted, safeTarget);
  return convertPlanProgressToActualVerse(plan, progressVerse);
};

export const getActivePlan = (plans: PlannerPlan[]): PlannerPlan => {
  const incompletePlan = plans.find(
    (plan) => plan.targetVerses > 0 && plan.completedVerses < plan.targetVerses
  );
  return incompletePlan ?? plans[plans.length - 1]!;
};

export const buildAggregatedPlan = (
  group: PlannerPlanGroup,
  plans: PlannerPlan[],
  activePlan: PlannerPlan,
  estimatedDays: number
): PlannerPlan => {
  const progress = mergeProgress(plans);

  return {
    id: group.planIds[0] ?? activePlan.id,
    surahId: activePlan.surahId,
    targetVerses: progress.totalTarget,
    completedVerses: progress.totalCompleted,
    createdAt: Number.isFinite(progress.earliestCreated) ? progress.earliestCreated : Date.now(),
    lastUpdated: progress.latestUpdated || Date.now(),
    notes: group.planName,
    estimatedDays,
  };
};

export const buildAggregatedChapter = (
  surahIds: number[],
  chapterLookup: Map<number, Chapter>
): PlannerCardChapter | undefined => {
  if (surahIds.length === 0) return undefined;

  const nameLabel = buildSurahRangeNameLabel(surahIds, chapterLookup);
  const pages = buildChapterPages(surahIds, chapterLookup);
  const baseChapter: PlannerCardChapter = {
    name_simple: nameLabel,
    name_arabic: nameLabel,
  };

  return pages ? { ...baseChapter, pages } : baseChapter;
};

const buildRangePoints = (
  plans: PlannerPlan[],
  totalTarget: number,
  chapterLookup: Map<number, Chapter>
): { start: { chapterName: string; surahId: number; verse: number }; end: { chapterName: string; surahId: number; verse: number } } | null => {
  if (plans.length === 0 || totalTarget <= 0) return null;
  const startPosition = mapGlobalVerseToPosition(plans, 1, chapterLookup);
  const endPosition = mapGlobalVerseToPosition(plans, totalTarget, chapterLookup);
  if (!startPosition || !endPosition) return null;

  return {
    start: {
      chapterName: startPosition.chapterName,
      surahId: startPosition.surahId,
      verse: startPosition.verse,
    },
    end: {
      chapterName: endPosition.chapterName,
      surahId: endPosition.surahId,
      verse: endPosition.verse,
    },
  };
};

export const formatPlanDetails = (
  group: PlannerPlanGroup,
  totalTarget: number,
  estimatedDays: number,
  chapterLookup: Map<number, Chapter>
): string | null => {
  const rangePoints = buildRangePoints(group.plans, totalTarget, chapterLookup);
  if (!rangePoints) return null;

  return formatPlannerRangeDetails({
    ...rangePoints,
    estimatedDays,
  });
};

export const buildProgressLabel = (
  plans: PlannerPlan[],
  isComplete: boolean,
  chapterLookup: Map<number, Chapter>
): string => {
  if (plans.length === 0) {
    return 'No progress tracked';
  }

  if (isComplete) {
    const completedPlan = plans[plans.length - 1]!;
    const chapter = chapterLookup.get(completedPlan.surahId);
    const chapterName = getChapterDisplayName(completedPlan, chapter);
    const verse = getPlanEndVerse(completedPlan);
    return `${chapterName} ${completedPlan.surahId}:${Math.max(1, verse)}`;
  }

  const recentPlan = plans.reduce(
    (latest, plan) => (plan.lastUpdated > latest.lastUpdated ? plan : latest),
    plans[0]!
  );
  const planForLabel = recentPlan.completedVerses >= recentPlan.targetVerses ? getActivePlan(plans) : recentPlan;
  const verse = planForLabel === recentPlan ? clampCompletedVerse(recentPlan) : clampCompletedVerse(planForLabel);
  const chapter = chapterLookup.get(planForLabel.surahId);
  const chapterName = getChapterDisplayName(planForLabel, chapter);
  return `${chapterName} ${planForLabel.surahId}:${verse}`;
};

