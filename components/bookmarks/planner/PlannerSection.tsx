import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import type { PlannerPlan } from '@/types';

import { PlannerCard } from './PlannerCard';
import { PlannerEmptyState } from './PlannerEmptyState';
import { PlannerHeader } from './PlannerHeader';
import { buildPlannerGroupCardData } from './utils/buildPlannerGroupCard';
import { buildChapterLookup, groupPlannerPlans } from './utils/planGrouping';

export interface PlannerDeleteRequest {
  planIds: string[];
  title: string;
  details?: string | null;
}

export function PlannerSection({
  planner,
  onCreatePlan,
  onDeletePlan,
  topContent,
  registerScrollToTop,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
  scrollEventThrottle,
}: {
  planner: Record<string, PlannerPlan>;
  onCreatePlan: () => void;
  onDeletePlan: (request: PlannerDeleteRequest) => void;
  topContent?: React.ReactNode;
  registerScrollToTop?: (handler: (() => void) | null) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const contentContainerStyle = React.useMemo(
    () => ({ paddingHorizontal: 12, paddingBottom: 24 + audioPlayerBarHeight }),
    [audioPlayerBarHeight]
  );
  // Plans are few and user-created. A plain ScrollView keeps cards in normal flow, so the cards
  // below an expanding card move in the same UI-thread layout pass as its height animation.
  const listRef = React.useRef<ScrollViewInstance | null>(null);

  const { chapters, isLoading: isChaptersLoading, errorMessage: chaptersError } = useChapters();
  const chapterLookup = React.useMemo(() => buildChapterLookup(chapters), [chapters]);
  const groupedCards = React.useMemo(() => {
    const groups = groupPlannerPlans(planner, chapterLookup);
    return groups.map((group) => buildPlannerGroupCardData(group, chapterLookup));
  }, [chapterLookup, planner]);

  React.useEffect(() => {
    if (!registerScrollToTop) return;
    registerScrollToTop(() => {
      listRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => registerScrollToTop(null);
  }, [registerScrollToTop]);

  if (groupedCards.length === 0) {
    return (
      <View className="flex-1 px-3" style={{ paddingBottom: 24 + audioPlayerBarHeight }}>
        {topContent}
        <PlannerHeader onCreatePlan={onCreatePlan} />
        <View className="flex-1 items-center justify-center -mt-6">
          <PlannerEmptyState />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      ref={listRef}
      contentContainerStyle={contentContainerStyle}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      scrollEventThrottle={scrollEventThrottle}
    >
      {topContent}
      <View className="pt-2 pb-3">
        <PlannerHeader onCreatePlan={onCreatePlan} />
        {isChaptersLoading ? (
          <View className="mt-1 flex-row items-center gap-2">
            <ActivityIndicator size="small" color={palette.muted} />
            <Text className="text-xs text-muted dark:text-muted-dark">{t('loading_surah')}</Text>
          </View>
        ) : chaptersError ? (
          <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
            {chaptersError}
          </Text>
        ) : null}
      </View>
      <View className="gap-3">
        {groupedCards.map((group) => (
          <PlannerCard
            key={group.key}
            surahId={group.surahId}
            plan={group.plan}
            {...(group.chapter ? { chapter: group.chapter } : {})}
            precomputedViewModel={group.viewModel}
            progressLabel={group.progressLabel}
            {...(group.continueVerse ? { continueVerse: group.continueVerse } : {})}
            onDelete={() =>
              onDeletePlan({
                planIds: group.planIds,
                title: group.viewModel.planInfo.displayPlanName,
                details: group.viewModel.planInfo.planDetailsText,
              })
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}
