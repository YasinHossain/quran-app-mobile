import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useAppTheme } from '@/providers/ThemeContext';
import type { PlannerPlan } from '@/types';

import { PlannerCard } from './PlannerCard';
import { PlannerEmptyState } from './PlannerEmptyState';
import { PlannerHeader } from './PlannerHeader';
import { buildPlannerGroupCardData } from './utils/buildPlannerGroupCard';
import { buildChapterLookup, groupPlannerPlans } from './utils/planGrouping';

export function PlannerSection({
  planner,
  onCreatePlan,
  onDeletePlan,
}: {
  planner: Record<string, PlannerPlan>;
  onCreatePlan: () => void;
  onDeletePlan: (planIds: string[]) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const { chapters, isLoading: isChaptersLoading, errorMessage: chaptersError } = useChapters();
  const chapterLookup = React.useMemo(() => buildChapterLookup(chapters), [chapters]);
  const groupedCards = React.useMemo(() => {
    const groups = groupPlannerPlans(planner, chapterLookup);
    return groups.map((group) => buildPlannerGroupCardData(group, chapterLookup));
  }, [chapterLookup, planner]);

  if (groupedCards.length === 0) {
    return (
      <View className="flex-1 px-4">
        <PlannerHeader onCreatePlan={onCreatePlan} />
        <PlannerEmptyState />
      </View>
    );
  }

  return (
    <FlashList
      data={groupedCards}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <View className="pt-2 pb-3">
          <PlannerHeader onCreatePlan={onCreatePlan} />
          {isChaptersLoading ? (
            <View className="mt-1 flex-row items-center gap-2">
              <ActivityIndicator size="small" color={palette.muted} />
              <Text className="text-xs text-muted dark:text-muted-dark">Loading surah info…</Text>
            </View>
          ) : chaptersError ? (
            <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
              {chaptersError}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item: group }) => {
        return (
          <PlannerCard
            surahId={group.surahId}
            plan={group.plan}
            {...(group.chapter ? { chapter: group.chapter } : {})}
            precomputedViewModel={group.viewModel}
            progressLabel={group.progressLabel}
            {...(group.continueVerse ? { continueVerse: group.continueVerse } : {})}
            onDelete={() => onDeletePlan(group.planIds)}
          />
        );
      }}
    />
  );
}
