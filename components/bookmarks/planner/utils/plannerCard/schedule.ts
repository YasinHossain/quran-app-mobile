import { DAY_IN_MS } from '@/components/bookmarks/planner/utils/plannerCard/constants';
import { getActiveDayNumber } from '@/components/bookmarks/planner/utils/plannerCard/pacing';

import type { PlannerCardProps } from '@/components/bookmarks/planner/PlannerCard.types';

const getDayLabel = (isComplete: boolean, estimatedDays: number, activeDayNumber: number): string =>
  isComplete
    ? `Completed in ${estimatedDays} day${estimatedDays === 1 ? '' : 's'}`
    : `Day ${activeDayNumber} of ${estimatedDays}`;

const getRemainingDays = (isComplete: boolean, versesPerDay: number, remainingVerses: number): number => {
  if (isComplete || versesPerDay <= 0) return 0;
  return Math.max(0, Math.ceil(remainingVerses / versesPerDay));
};

const getProjectedCompletionLabel = (remainingDays: number): string | null => {
  if (remainingDays <= 0) return null;
  const projectedDate = new Date(Date.now() + remainingDays * DAY_IN_MS);
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(projectedDate);
  } catch {
    return projectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

const formatRemainingDaysLabel = (isComplete: boolean, remainingDays: number): string => {
  if (isComplete) return 'Completed';
  if (remainingDays <= 0) return 'Due today';
  if (remainingDays === 1) return '1 day';
  return `${remainingDays} days`;
};

export const getScheduleDetails = ({
  plan,
  estimatedDays,
  versesPerDay,
  isComplete,
  remainingVerses,
}: {
  plan: PlannerCardProps['plan'];
  estimatedDays: number;
  versesPerDay: number;
  isComplete: boolean;
  remainingVerses: number;
}): {
  dayLabel: string;
  remainingDaysLabel: string;
  endsAtValue: string;
} => {
  const normalizedEstimatedDays = Math.max(1, Math.round(estimatedDays));
  const activeDayNumber = getActiveDayNumber(plan, normalizedEstimatedDays, versesPerDay);
  const dayLabel = getDayLabel(isComplete, normalizedEstimatedDays, activeDayNumber);
  const remainingDays = getRemainingDays(isComplete, versesPerDay, remainingVerses);
  const projectedCompletionLabel = getProjectedCompletionLabel(remainingDays);
  const remainingDaysLabel = formatRemainingDaysLabel(isComplete, remainingDays);
  const endsAtValue = !isComplete && projectedCompletionLabel ? projectedCompletionLabel : '—';

  return { dayLabel, remainingDaysLabel, endsAtValue };
};

