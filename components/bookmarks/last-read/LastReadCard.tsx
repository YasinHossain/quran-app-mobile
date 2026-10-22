import { X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { warmSurahReaderBeforeNavigation } from '@/lib/surah/surahReaderWarmup';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { CircularProgress } from './CircularProgress';

import type { Chapter } from '@/types';

export function LastReadCard({
  surahId,
  verseNumber,
  chapter,
  onRemove,
}: {
  surahId: string;
  verseNumber: number;
  chapter?: Chapter;
  onRemove: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const { resolvedTheme, isDark } = useAppTheme();
  const { settings } = useSettings();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const dangerColor = isDark ? '#F87171' : '#DC2626';

  const total = chapter?.verses_count || 0;
  const percent =
    total > 0 ? Math.min(100, Math.max(0, Math.round((verseNumber / total) * 100))) : 0;

  const parsedSurahId = Number.parseInt(surahId, 10);
  const displaySurahId = Number.isFinite(parsedSurahId) ? parsedSurahId : Number(surahId);
  const surahName = t(`surah_names.${surahId}`, {
    fallback: chapter?.name_simple ?? `${t('surah_tab')} ${surahId}`,
  });

  const verseLine =
    total > 0
      ? t('last_read_verse_of_total', { current: verseNumber, total })
      : `${t('verse')} ${verseNumber}`;

  const handleNavigate = React.useCallback(() => {
    if (!Number.isFinite(displaySurahId) || displaySurahId <= 0) return;
    void (async () => {
      await warmSurahReaderBeforeNavigation({
        surahId: displaySurahId,
        verseNumber,
        settings,
      });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(displaySurahId),
          ...(Number.isFinite(verseNumber) && verseNumber > 0 ? { startVerse: String(verseNumber) } : {}),
        },
      });
    })();
  }, [displaySurahId, router, settings, verseNumber]);

  return (
    <Pressable
      onPress={handleNavigate}
      accessibilityRole="button"
      accessibilityLabel={`${t('planner_continue_reading')} ${surahName} ${verseNumber}`}
      className="relative min-w-0 rounded-lg border border-border/50 bg-surface px-4 py-4 dark:border-border-dark/40 dark:bg-surface-dark"
      style={({ pressed }) => ({
        minHeight: 168,
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('last_read_remove_aria')}
        hitSlop={10}
        className="absolute top-2 right-2 h-8 w-8 items-center justify-center rounded-full"
        style={({ pressed }) => ({
          backgroundColor: pressed
            ? isDark
              ? 'rgba(248,113,113,0.14)'
              : 'rgba(220,38,38,0.10)'
            : 'transparent',
        })}
      >
        {({ pressed }) => (
          <X size={16} strokeWidth={2.25} color={pressed ? dangerColor : palette.muted} />
        )}
      </Pressable>

      <View className="flex-1 items-center justify-center w-full">
        <CircularProgress percentage={percent} size={100} strokeWidth={10} label={t('completed')} />
      </View>

      <View className="mt-4 w-full items-center">
        <Text
          numberOfLines={1}
          className="text-base font-bold text-foreground dark:text-foreground-dark text-center w-full"
        >
          {surahName}
        </Text>
        <Text className="mt-1 text-xs text-muted dark:text-muted-dark text-center w-full">
          {verseLine}
        </Text>
      </View>
    </Pressable>
  );
}
