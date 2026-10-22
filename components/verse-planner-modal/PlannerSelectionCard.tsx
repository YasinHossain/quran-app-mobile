import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { useAppTheme } from '@/providers/ThemeContext';
import Colors from '@/constants/Colors';

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
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

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
        'w-full rounded-xl border px-4 py-3 flex-row items-center justify-between gap-4',
        isSelected
          ? 'bg-accent border-accent'
          : 'border-border/30 dark:border-border-dark/20 bg-interactive dark:bg-surface-navigation-dark',
      ].join(' ')}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View className="flex-1 min-w-0 gap-1">
        <Text
          numberOfLines={1}
          className={[
            'text-base font-semibold leading-snug',
            isSelected ? 'text-on-accent' : 'text-foreground dark:text-foreground-dark',
          ].join(' ')}
        >
          {planName}
        </Text>
        <Text
          numberOfLines={1}
          className={[
            'text-sm leading-snug',
            isSelected ? 'text-on-accent/80' : 'text-muted dark:text-muted-dark',
          ].join(' ')}
        >
          {detailLine}
        </Text>
      </View>

      {isSelected ? (
        <Check size={20} strokeWidth={2.25} color="#FFFFFF" />
      ) : null}
    </Pressable>
  );
}

