import { X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import { DailyFocusSection } from './DailyFocusSection';
import { PlannerCardHeader } from './PlannerCardHeader';
import { PlannerProgressSection } from './PlannerProgressSection';
import { PlannerStatsSection } from './PlannerStatsSection';
import { createPlannerCardViewModel } from './utils/plannerCard';

import type { PlannerCardProps } from './PlannerCard.types';
import type { PlannerCardViewModel } from './utils/plannerCard';

export function PlannerCard({
  surahId,
  plan,
  chapter,
  precomputedViewModel,
  progressLabel,
  continueVerse,
  onDelete,
}: PlannerCardProps & { onDelete?: () => void }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const viewModel = usePlannerViewModel({
    surahId,
    plan,
    ...(chapter ? { chapter } : {}),
    ...(precomputedViewModel ? { precomputedViewModel } : {}),
  });
  const handleNavigate = usePlannerNavigation(surahId, continueVerse);

  return (
    <View className="relative min-w-0 rounded-2xl border border-border/50 bg-surface px-5 py-5 shadow-sm dark:border-border-dark/40 dark:bg-surface-dark">
      <View className="gap-5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 min-w-0">
            <PlannerCardHeader
              displayPlanName={viewModel.planInfo.displayPlanName}
              planDetailsText={viewModel.planInfo.planDetailsText}
            />
          </View>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete planner"
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="h-8 w-8 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
            >
              <X size={16} strokeWidth={2.25} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>

        <DailyFocusSection focus={viewModel.focus} />

        <PlannerStatsSection stats={viewModel.stats} />

        <PlannerProgressSection
          progress={viewModel.progress}
          surahLabel={viewModel.planInfo.surahLabel}
          surahId={surahId}
          {...(typeof progressLabel === 'string' ? { currentVerseLabel: progressLabel } : {})}
          onContinue={handleNavigate}
        />
      </View>
    </View>
  );
}

function usePlannerViewModel({
  surahId,
  plan,
  chapter,
  precomputedViewModel,
}: Pick<PlannerCardProps, 'surahId' | 'plan' | 'chapter' | 'precomputedViewModel'>): PlannerCardViewModel {
  return React.useMemo<PlannerCardViewModel>(() => {
    if (precomputedViewModel) {
      return precomputedViewModel;
    }
    const params: PlannerCardProps = chapter ? { surahId, plan, chapter } : { surahId, plan };
    return createPlannerCardViewModel(params);
  }, [chapter, plan, precomputedViewModel, surahId]);
}

function usePlannerNavigation(
  surahId: string,
  continueVerse: PlannerCardProps['continueVerse']
): () => void {
  const router = useRouter();

  return React.useCallback(() => {
    const parsedSurahId = Number.parseInt(surahId, 10);
    const fallbackSurahId = Number.isFinite(parsedSurahId) ? parsedSurahId : Number(surahId);
    const resolvedSurahId =
      typeof continueVerse?.surahId === 'number' ? continueVerse.surahId : fallbackSurahId;
    const resolvedStartVerse =
      typeof continueVerse?.verse === 'number' && continueVerse.verse > 0 ? continueVerse.verse : undefined;

    if (!Number.isFinite(resolvedSurahId) || resolvedSurahId <= 0) {
      return;
    }

    router.push({
      pathname: '/surah/[surahId]',
      params: {
        surahId: String(resolvedSurahId),
        ...(resolvedStartVerse ? { startVerse: String(resolvedStartVerse) } : {}),
      },
    });
  }, [continueVerse?.surahId, continueVerse?.verse, router, surahId]);
}
