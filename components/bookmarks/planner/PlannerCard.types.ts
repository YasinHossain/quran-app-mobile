import type { PlannerPlan } from '@/types';

import type { PlannerCardViewModel } from './utils/plannerCard';

export interface PlannerCardChapter {
  name_simple: string;
  name_arabic: string;
  pages?: [number, number];
}

export interface PlannerCardProps {
  surahId: string;
  plan: PlannerPlan;
  chapter?: PlannerCardChapter;
  precomputedViewModel?: PlannerCardViewModel;
  progressLabel?: string;
  continueVerse?: {
    surahId: number;
    verse: number;
    verseKey: string;
  };
}

