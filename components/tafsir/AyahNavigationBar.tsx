import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export type NavTarget = { surahId: number; ayahId: number };

export function AyahNavigationBar({
  title,
  onBack,
  prev,
  next,
  onNavigate,
}: {
  title: string;
  onBack: () => void;
  prev: NavTarget | null;
  next: NavTarget | null;
  onNavigate: (target: NavTarget) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="w-full flex-row items-center justify-between gap-2 rounded-full bg-accent dark:bg-accent-dark px-2 py-2">
      <Pressable
        onPress={onBack}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="h-10 w-10 items-center justify-center rounded-full bg-surface dark:bg-surface-dark"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <ArrowLeft color={palette.tint} size={18} strokeWidth={2.5} />
      </Pressable>

      <Text
        numberOfLines={1}
        className="flex-1 min-w-0 px-2 text-center text-sm font-bold text-on-accent dark:text-on-accent-dark"
      >
        {title}
      </Text>

      <View className="flex-row items-center gap-2">
        <NavButton
          label="Previous"
          disabled={!prev}
          icon={<ChevronLeft color={palette.tint} size={20} strokeWidth={2.5} />}
          onPress={prev ? () => onNavigate(prev) : undefined}
        />
        <NavButton
          label="Next"
          disabled={!next}
          icon={<ChevronRight color={palette.tint} size={20} strokeWidth={2.5} />}
          onPress={next ? () => onNavigate(next) : undefined}
        />
      </View>
    </View>
  );
}

function NavButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'h-10 w-10 items-center justify-center rounded-full bg-surface dark:bg-surface-dark',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
    >
      {icon}
    </Pressable>
  );
}

