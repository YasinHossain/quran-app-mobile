import { Search } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function HeaderSearchButton({
  placeholder = 'Search…',
  onPress,
}: {
  placeholder?: string;
  onPress: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open search"
      className="flex-1 flex-row items-center gap-2 rounded-xl bg-interactive px-3 py-2 dark:bg-interactive-dark border border-border/30 dark:border-border-dark/20"
      style={({ pressed }) => ({ flex: 1, width: '100%', opacity: pressed ? 0.9 : 1 })}
    >
      <View className="h-4 w-4 items-center justify-center">
        <Search color={palette.muted} size={16} strokeWidth={2.25} />
      </View>
      <Text
        numberOfLines={1}
        className="flex-1 text-sm text-muted dark:text-muted-dark"
      >
        {placeholder}
      </Text>
    </Pressable>
  );
}
