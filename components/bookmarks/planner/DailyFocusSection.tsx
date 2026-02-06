import { Target } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { PlannerCardViewModel } from './utils/plannerCard';

export function DailyFocusSection({
  focus,
}: {
  focus: PlannerCardViewModel['focus'];
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="rounded-xl border border-border/60 bg-background/60 px-4 py-4 dark:border-border-dark/50 dark:bg-background-dark/40">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Target size={16} strokeWidth={2.25} color={palette.tint} />
          <Text className="text-sm font-semibold text-muted dark:text-muted-dark">
            Today's focus
          </Text>
        </View>
        <Text className="text-xs font-semibold text-muted dark:text-muted-dark">{focus.dayLabel}</Text>
      </View>

      {focus.hasDailyGoal ? (
        <View className="mt-3 gap-3">
          <View className="items-center justify-center rounded-full border border-border/50 bg-surface/80 px-4 py-3 dark:border-border-dark/40 dark:bg-surface-dark/60">
            <Text className="text-center text-sm font-semibold text-foreground dark:text-foreground-dark">
              {focus.goalVerseLabel}
            </Text>
          </View>

          {focus.dailyHighlights.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {focus.dailyHighlights.map((highlight) => (
                <View
                  key={highlight.label}
                  style={{ minWidth: 110 }}
                  className="flex-1 rounded-xl border border-border/50 bg-surface/80 px-3 py-2 dark:border-border-dark/40 dark:bg-surface-dark/60"
                >
                  <Text className="w-full text-center text-xs font-semibold text-foreground dark:text-foreground-dark">
                    {highlight.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {focus.remainingSummary || focus.endsAtSummary ? (
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              {focus.remainingSummary ? (
                <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                  {focus.remainingSummary}
                </Text>
              ) : null}
              {focus.remainingSummary && focus.endsAtSummary ? (
                <Text className="text-xs text-muted dark:text-muted-dark">•</Text>
              ) : null}
              {focus.endsAtSummary ? (
                <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                  {focus.endsAtSummary}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View className="mt-3 rounded-xl bg-surface/80 px-3 py-3 dark:bg-surface-dark/60">
          <Text className="text-sm text-muted dark:text-muted-dark">{focus.noGoalMessage}</Text>
        </View>
      )}
    </View>
  );
}
