import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function PlannerSelectionCard({
  planName,
  verseRangeLabel,
  estimatedDays,
  isSelected = false,
  onSelect,
}: {
  planName: string;
  verseRangeLabel: string;
  estimatedDays?: number;
  isSelected?: boolean;
  onSelect?: () => void;
}): React.JSX.Element {
  const detailParts = [verseRangeLabel];
  if (typeof estimatedDays === 'number' && estimatedDays > 0) {
    const rounded = Math.round(estimatedDays);
    detailParts.push(`${rounded} day${rounded === 1 ? '' : 's'}`);
  }
  const detailLine = detailParts.join(' · ');

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={[
        'w-full rounded-xl border px-4 py-4',
        isSelected
          ? 'border-accent bg-accent'
          : 'border-border dark:border-border-dark bg-surface dark:bg-surface-dark',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="gap-1">
        <Text
          className={[
            'text-base font-semibold leading-snug',
            isSelected ? 'text-on-accent' : 'text-foreground dark:text-foreground-dark',
          ].join(' ')}
        >
          {planName}
        </Text>
        <Text
          className={[
            'text-sm leading-snug',
            isSelected ? 'text-on-accent/80' : 'text-muted dark:text-muted-dark',
          ].join(' ')}
        >
          {detailLine}
        </Text>
      </View>
    </Pressable>
  );
}

