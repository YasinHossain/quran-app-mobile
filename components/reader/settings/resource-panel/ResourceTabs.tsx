import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function NavButton({
  disabled,
  onPress,
  children,
}: {
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={['rounded-full p-1', disabled ? 'opacity-40' : ''].join(' ')}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      className={[
        'flex-shrink-0 px-3 py-1 border-b-2',
        active
          ? 'border-accent dark:border-accent-dark'
          : 'border-transparent',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      accessibilityRole="button"
    >
      <Text
        className={[
          'text-sm font-semibold',
          active ? 'text-accent dark:text-accent-dark' : 'text-muted dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ResourceTabs({
  languages,
  activeFilter,
  onTabPress,
}: {
  languages: string[];
  activeFilter: string;
  onTabPress: (lang: string) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const scrollRef = React.useRef<ScrollView>(null);
  const scrollXRef = React.useRef(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [contentWidth, setContentWidth] = React.useState(0);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(
    (x: number, cw = contentWidth, vw = containerWidth) => {
      scrollXRef.current = x;
      const maxX = Math.max(0, cw - vw);
      setCanScrollLeft(x > 4);
      setCanScrollRight(x < maxX - 4);
    },
    [containerWidth, contentWidth]
  );

  const onLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      setContainerWidth(event.nativeEvent.layout.width);
      updateScrollState(scrollXRef.current);
    },
    [updateScrollState]
  );

  const onContentSizeChange = React.useCallback(
    (w: number) => {
      setContentWidth(w);
      updateScrollState(scrollXRef.current, w);
    },
    [updateScrollState]
  );

  const onScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateScrollState(event.nativeEvent.contentOffset.x);
    },
    [updateScrollState]
  );

  const scrollBy = React.useCallback(
    (delta: number) => {
      const maxX = Math.max(0, contentWidth - containerWidth);
      const nextX = clamp(scrollXRef.current + delta, 0, maxX);
      scrollRef.current?.scrollTo({ x: nextX, y: 0, animated: true });
      updateScrollState(nextX);
    },
    [containerWidth, contentWidth, updateScrollState]
  );

  return (
    <View className="flex-row items-center overflow-hidden" onLayout={onLayout}>
      <NavButton disabled={!canScrollLeft} onPress={() => scrollBy(-140)}>
        <MaterialCommunityIcons name="chevron-left" size={20} color={palette.muted} />
      </NavButton>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={{ alignItems: 'center' }}
      >
        {languages.map((lang) => (
          <Tab
            key={lang}
            label={lang}
            active={activeFilter === lang}
            onPress={() => onTabPress(lang)}
          />
        ))}
      </ScrollView>

      <NavButton disabled={!canScrollRight} onPress={() => scrollBy(140)}>
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.muted} />
      </NavButton>
    </View>
  );
}
