import { Sparkles } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { PlannerCardViewModel } from './utils/plannerCard';

export function PlannerProgressSection({
  progress,
  surahLabel,
  surahId,
  currentVerseLabel,
  onContinue,
}: {
  progress: PlannerCardViewModel['progress'];
  surahLabel: string;
  surahId: string;
  currentVerseLabel?: string;
  onContinue: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const verseLine =
    typeof currentVerseLabel === 'string' && currentVerseLabel.length > 0
      ? currentVerseLabel
      : `${surahLabel} ${surahId}:${progress.currentVerse}`;
  const percentLabel = `${progress.percent}%`;

  return (
    <View className="rounded-xl border border-border/60 bg-background/60 px-4 py-4 dark:border-border-dark/50 dark:bg-background-dark/40">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Sparkles size={16} strokeWidth={2.25} color={palette.tint} />
          <Text className="text-sm font-semibold text-muted dark:text-muted-dark">
            Currently at
          </Text>
        </View>
        <Text className="text-xs font-semibold text-muted dark:text-muted-dark">{percentLabel}</Text>
      </View>

      <View className="mt-2">
        <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
          {verseLine}
        </Text>
        {progress.currentSecondaryText ? (
          <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
            {progress.currentSecondaryText}
          </Text>
        ) : null}
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ now: progress.percent, min: 0, max: 100 }}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border/40 dark:bg-border-dark/40"
      >
        <View
          className="h-full rounded-full bg-accent dark:bg-accent-dark"
          style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
        />
      </View>

      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="Continue reading"
        className="mt-4 w-full items-center justify-center rounded-xl bg-accent px-4 py-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Text className="text-sm font-semibold text-on-accent">Continue reading</Text>
      </Pressable>
    </View>
  );
}

