import React from 'react';
import {
  Animated,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

type HeaderShellProps = {
  children: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

function HeaderShell({ children, onLayout, style }: HeaderShellProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View
      onLayout={onLayout}
      className="border-b border-border/30 bg-background dark:border-border-dark/20 dark:bg-background-dark"
      style={[
        {
          paddingTop: insets.top + 8,
          paddingHorizontal: 12,
          paddingBottom: 12,
          backgroundColor: palette.background,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppHeader({
  left,
  onLayout,
  right,
  style,
  title,
}: {
  left?: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  title: string;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <HeaderShell onLayout={onLayout} style={style}>
      <View className="h-11 flex-row items-center gap-3">
        <View className="w-10 items-start">{left}</View>
        <Text
          numberOfLines={1}
          className="flex-1 text-center text-base font-semibold text-foreground dark:text-foreground-dark"
          style={{ color: palette.text }}
        >
          {title}
        </Text>
        <View className="w-10 items-end">{right}</View>
      </View>
    </HeaderShell>
  );
}

export function AppSearchHeader({
  inputRef,
  left,
  onChangeText,
  onFocus,
  onLayout,
  onSubmitEditing,
  placeholder = 'Search…',
  right,
  style,
  value,
  editable = true,
}: {
  inputRef?: React.Ref<TextInput>;
  left: React.ReactNode;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  right: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  value: string;
  editable?: boolean;
}): React.JSX.Element {
  return (
    <HeaderShell onLayout={onLayout} style={style}>
      <View className="flex-row items-center gap-3">
        {left}
        <View className="flex-1">
          <HeaderSearchInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            onFocus={onFocus}
            onSubmitEditing={onSubmitEditing}
            editable={editable}
          />
        </View>
        {right}
      </View>
    </HeaderShell>
  );
}

export function ReaderOverlayHeader({
  children,
  onLayout,
  pointerEvents = 'box-none',
  style,
}: {
  children: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  pointerEvents?: 'box-none' | 'none';
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
}): React.JSX.Element {
  return (
    <Animated.View
      onLayout={onLayout}
      pointerEvents={pointerEvents}
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          elevation: 50,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
