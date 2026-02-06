import { buildDailyFocus } from '@/components/bookmarks/planner/utils/plannerCard/dailyFocus';
import { getJuzMetrics } from '@/components/bookmarks/planner/utils/plannerCard/juz';
import { getEstimatedDays } from '@/components/bookmarks/planner/utils/plannerCard/pacing';
import { getPageMetrics } from '@/components/bookmarks/planner/utils/plannerCard/pages';
import { buildPlanInfo, getSurahLabel } from '@/components/bookmarks/planner/utils/plannerCard/planInfo';
import { getProgressMetrics } from '@/components/bookmarks/planner/utils/plannerCard/progress';
import { buildProgressDetails } from '@/components/bookmarks/planner/utils/plannerCard/progressDetails';
import { buildStats } from '@/components/bookmarks/planner/utils/plannerCard/stats';

import type { PlannerCardProps } from '@/components/bookmarks/planner/PlannerCard.types';
import type { PlannerCardViewModel } from '@/components/bookmarks/planner/utils/plannerCard/types';

export const createPlannerCardViewModel = (params: PlannerCardProps): PlannerCardViewModel => {
  const surahLabel = getSurahLabel(params.surahId, params.chapter);
  const estimatedDays = getEstimatedDays(params.plan);
  const progress = getProgressMetrics(params.plan);
  const pageMetrics = getPageMetrics(params.plan, params.chapter);
  const juzMetrics = getJuzMetrics(params.plan, pageMetrics);

  const planInfo = buildPlanInfo({
    plan: params.plan,
    surahId: params.surahId,
    surahLabel,
    estimatedDays,
  });
  const focus = buildDailyFocus({
    plan: params.plan,
    surahId: params.surahId,
    surahLabel,
    estimatedDays,
    progress,
    pageMetrics,
  });
  const stats = buildStats({
    plan: params.plan,
    pageMetrics,
    juzMetrics,
    remainingVerses: progress.remainingVerses,
  });
  const currentSecondaryText = buildProgressDetails({
    progress,
    pageMetrics,
  });

  return {
    planInfo,
    focus,
    stats,
    progress: {
      percent: progress.percent,
      currentVerse: progress.currentVerse,
      currentSecondaryText,
    },
  };
};

