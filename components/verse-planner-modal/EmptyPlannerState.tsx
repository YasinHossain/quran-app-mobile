import React from 'react';
import { Text, View } from 'react-native';

export function EmptyPlannerState({ verseLabel }: { verseLabel: string }): React.JSX.Element {
  return (
    <View className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-5 py-5">
      <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
        No planners yet
      </Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
        Create a planner first to add {verseLabel} into your plan.
      </Text>
    </View>
  );
}

