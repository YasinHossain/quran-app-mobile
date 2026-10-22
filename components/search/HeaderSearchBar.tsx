import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function HeaderActionButton({
  accessibilityLabel,
  children,
  hitSlop = 8,
  onPress,
  style,
}: {
  accessibilityLabel: string;
  children: React.ReactNode;
  hitSlop?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-interactive dark:active:bg-interactive-dark"
      style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function HeaderSearchBar({
  left,
  right,
  search,
  style,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  search: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center gap-3 bg-background dark:bg-background-dark"
      style={[
        {
          paddingTop: insets.top + 8,
          paddingHorizontal: 12,
          paddingBottom: 12,
        },
        style,
      ]}
    >
      {left}
      <View className="flex-1">{search}</View>
      {right}
    </View>
  );
}
