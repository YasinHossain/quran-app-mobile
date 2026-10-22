import type { PlannerCardChapter } from '@/components/bookmarks/planner/PlannerCard.types';
import type { PlannerCardViewModel } from '@/components/bookmarks/planner/utils/plannerCard';
import type { PlannerPlan } from '@/types';

export interface PlannerGroupCardData {
  key: string;
  surahId: string;
  plan: PlannerPlan;
  chapter?: PlannerCardChapter;
  viewModel: PlannerCardViewModel;
  progressLabel: string;
  planIds: string[];
  planName: string;
  continueVerse?: {
    surahId: number;
    verse: number;
    verseKey: string;
  };
}

