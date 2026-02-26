import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ResourceRecord } from './resourcePanel.utils';

export function ResourceItem({
  item,
  isSelected,
  onToggle,
  trailingAction,
  onTrailingPress,
  trailingAccessibilityLabel,
  trailingDisabled = false,
}: {
  item: ResourceRecord;
  isSelected: boolean;
  onToggle: (id: number) => void;
  trailingAction?: React.ReactNode;
  onTrailingPress?: () => void;
  trailingAccessibilityLabel?: string;
  trailingDisabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={() => onToggle(item.id)}
      className={[
        'flex-row items-center justify-between px-4 py-2.5 h-[50px] rounded-lg border',
        isSelected
          ? 'bg-accent border-accent dark:bg-accent-dark dark:border-accent-dark'
          : 'bg-surface dark:bg-surface-dark border-border/30 dark:border-border-dark/20',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="flex-1 min-w-0 pr-3">
        <Text
          numberOfLines={1}
          className={[
            'font-medium text-sm leading-tight',
            isSelected
              ? 'text-on-accent dark:text-on-accent-dark'
              : 'text-foreground dark:text-foreground-dark',
          ].join(' ')}
        >
          {item.name}
        </Text>
      </View>

      {trailingAction ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onTrailingPress?.();
          }}
          disabled={!onTrailingPress || trailingDisabled}
          accessibilityRole="button"
          accessibilityLabel={trailingAccessibilityLabel}
          className={trailingDisabled ? 'opacity-40' : ''}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          {trailingAction}
        </Pressable>
      ) : null}
    </Pressable>
  );
}
