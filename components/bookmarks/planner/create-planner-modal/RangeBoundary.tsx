import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Chapter } from '@/types';

export function RangeBoundary({
  surahLabel,
  verseLabel,
  chapter,
  onOpenSurahPicker,
  verseValue,
  onVerseChange,
}: {
  surahLabel: string;
  verseLabel: string;
  chapter: Chapter | undefined;
  onOpenSurahPicker: () => void;
  verseValue: number | undefined;
  onVerseChange: (value: number | undefined) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const surahDisplay = chapter ? `${chapter.id}. ${chapter.name_simple}` : 'Select Surah';

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
        {surahLabel}
      </Text>
      <Pressable
        onPress={onOpenSurahPicker}
        accessibilityRole="button"
        accessibilityLabel={surahLabel}
        className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-3 py-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Text className="text-base text-foreground dark:text-foreground-dark">{surahDisplay}</Text>
      </Pressable>

      <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark mt-2">
        {verseLabel}
      </Text>
      <View className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-3 py-3">
        <TextInput
          value={typeof verseValue === 'number' ? String(verseValue) : ''}
          onChangeText={(value) => {
            const trimmed = value.trim();
            if (!trimmed) {
              onVerseChange(undefined);
              return;
            }
            const parsed = Number(trimmed);
            onVerseChange(Number.isFinite(parsed) ? Math.floor(parsed) : undefined);
          }}
          placeholder={chapter ? '1' : 'Select Surah first'}
          placeholderTextColor={palette.muted}
          keyboardType="number-pad"
          editable={Boolean(chapter)}
          className="text-base text-foreground dark:text-foreground-dark"
        />
      </View>
      {chapter ? (
        <Text className="text-xs text-muted dark:text-muted-dark">Max {chapter.verses_count}</Text>
      ) : null}
    </View>
  );
}

