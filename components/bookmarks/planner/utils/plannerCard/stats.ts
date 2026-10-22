import type { PlannerCardProps } from '@/components/bookmarks/planner/PlannerCard.types';
import type { JuzMetrics, PageMetrics, PlannerStats } from '@/components/bookmarks/planner/utils/plannerCard/types';

export const buildStats = ({
  plan,
  pageMetrics,
  juzMetrics,
  remainingVerses,
}: {
  plan: PlannerCardProps['plan'];
  pageMetrics: PageMetrics;
  juzMetrics: JuzMetrics;
  remainingVerses: number;
}): PlannerStats => ({
  completed: {
    verses: plan.completedVerses,
    pages: pageMetrics.completedPagesCount,
    juz: juzMetrics.completedJuzCount,
  },
  remaining: {
    verses: remainingVerses,
    pages: pageMetrics.remainingPagesCount,
    juz: juzMetrics.remainingJuzCount,
  },
  goal: {
    verses: plan.targetVerses,
    pages: pageMetrics.goalPagesCount,
    juz: juzMetrics.goalJuzCount,
  },
});

