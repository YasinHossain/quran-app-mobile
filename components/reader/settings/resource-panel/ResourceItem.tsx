import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

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
  onToggle: (id: number) => boolean | void;
  trailingAction?: React.ReactNode;
  onTrailingPress?: () => void;
  trailingAccessibilityLabel?: string;
  trailingDisabled?: boolean;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const isDark = resolvedTheme === 'dark';
  const backgroundColor = isSelected ? palette.accent : isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isSelected
    ? palette.accent
    : isDark
      ? 'rgba(51,65,85,0.2)'
      : 'rgba(229,231,235,0.3)';
  const textColor = isSelected ? palette.onAccent : palette.text;

  return (
    <Pressable
      onPress={() => onToggle(item.id)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        className="h-[50px] flex-row items-center justify-between px-4 py-2.5"
        style={{
          width: '100%',
          backgroundColor,
          borderColor,
          borderRadius: 8,
          borderWidth: 1,
        }}
      >
        <View className="flex-1 min-w-0 pr-3">
          <Text
            numberOfLines={1}
            className="font-medium text-sm leading-tight"
            style={{ color: textColor }}
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
      </View>
    </Pressable>
  );
}
