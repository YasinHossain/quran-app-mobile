import { BookOpen, Hash } from 'lucide-react-native';
import React from 'react';
import {
  Pressable,
  Text,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useAppTheme } from '@/providers/ThemeContext';

import { SurahVerseSelectorRow } from './SurahVerseSelectorRow';

type SearchSuggestion =
  | { icon: 'juz'; query: string; number: number }
  | { icon: 'page'; query: string; number: number }
  | { icon: 'surah'; query: string; surahId: number }
  | { icon: 'ayah'; query: string; verseKey: string };

const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { icon: 'juz', query: 'Juz 1', number: 1 },
  { icon: 'page', query: 'Page 1', number: 1 },
  { icon: 'surah', query: 'Surah Yasin', surahId: 36 },
  { icon: 'ayah', query: '2:255', verseKey: '2:255' },
];

function SuggestionIcon({ icon }: { icon: SearchSuggestion['icon'] }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  if (icon === 'juz') return <Text className="text-[10px] font-bold text-accent dark:text-accent-dark">J</Text>;
  if (icon === 'page') return <Text className="text-[10px] font-bold text-accent dark:text-accent-dark">P</Text>;
  if (icon === 'ayah') return <Hash size={14} strokeWidth={2.25} color={palette.tint} />;
  return <BookOpen size={14} strokeWidth={2.25} color={palette.tint} />;
}

export function GoToSurahVerseCard({
  title = 'Go To',
  subtitle,
  buttonLabel = 'Go',
  variant = 'card',
  onNavigate,
  onSearchSuggestion,
}: {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  variant?: 'card' | 'embedded';
  onNavigate: (surahId: number, verse?: number) => void;
  onSearchSuggestion?: (query: string) => void;
}): React.JSX.Element {
  const { isDark } = useAppTheme();
  const { chapters, isLoading, errorMessage, refresh } = useChapters();

  const [selectedSurah, setSelectedSurah] = React.useState<number | undefined>(undefined);
  const [selectedVerse, setSelectedVerse] = React.useState<number | undefined>(undefined);

  const handleSelectSurah = React.useCallback(
    (surahId: number) => {
      const chapter = chapters.find((item) => item.id === surahId);
      const maxVerse = chapter?.verses_count ?? 0;
      setSelectedSurah(surahId);
      // Reset verse if it exceeds max for new surah
      setSelectedVerse((prev) => {
        if (typeof prev !== 'number' || prev <= 0) return undefined;
        if (!maxVerse) return undefined;
        return prev > maxVerse ? undefined : prev;
      });
    },
    [chapters]
  );

  const handleSelectVerse = React.useCallback((verse: number) => {
    setSelectedVerse(verse);
  }, []);

  const submit = React.useCallback(() => {
    if (!selectedSurah) return;
    onNavigate(selectedSurah, selectedVerse);
  }, [onNavigate, selectedSurah, selectedVerse]);

  const subtitleText =
    subtitle ??
    (isLoading && chapters.length === 0 ? 'Loading surahs…' : undefined);

  const formPaddingClass = variant === 'card' ? 'px-5 py-5' : 'px-6 pt-5 pb-6';

  return (
    <View className={isDark ? 'dark' : ''}>
      <View
        className={
          variant === 'card'
            ? 'rounded-xl bg-surface-navigation dark:bg-surface-navigation-dark border border-border/30 dark:border-border-dark/20'
            : ''
        }
      >
        <View className={formPaddingClass}>
          {/* Header */}
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
                {title}
              </Text>
              {subtitleText ? (
                <Text className="mt-1 text-sm text-muted dark:text-muted-dark">{subtitleText}</Text>
              ) : null}
            </View>

            <Pressable
              onPress={submit}
              disabled={!selectedSurah}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel}
              className="rounded-lg bg-accent px-6 py-2"
              style={({ pressed }) => ({
                opacity: !selectedSurah ? 0.5 : pressed ? 0.9 : 1,
              })}
            >
              <Text className="text-sm font-semibold text-on-accent">{buttonLabel}</Text>
            </Pressable>
          </View>

          {/* Surah & Verse Selectors - Side by Side */}
          <View className="mt-4">
            <SurahVerseSelectorRow
              chapters={chapters}
              isLoading={isLoading}
              selectedSurah={selectedSurah}
              selectedVerse={selectedVerse}
              onSelectSurah={handleSelectSurah}
              onSelectVerse={handleSelectVerse}
            />
          </View>

          {/* Error & Retry */}
          {errorMessage && chapters.length === 0 ? (
            <View className="mt-3 gap-2">
              <Text className="text-xs text-error dark:text-error-dark">{errorMessage}</Text>
              <Pressable
                onPress={refresh}
                accessibilityRole="button"
                accessibilityLabel="Retry loading surahs"
                className="self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Search Suggestions */}
          {onSearchSuggestion ? (
            <View className="mt-4 border-t border-border/50 dark:border-border-dark/40 pt-3">
              <Text className="mb-2 text-xs font-medium text-muted dark:text-muted-dark">
                Or try searching
              </Text>
              <View className="flex-row flex-wrap justify-between gap-y-2">
                {SEARCH_SUGGESTIONS.map((suggestion) => {
                  const label =
                    suggestion.icon === 'juz'
                      ? `Juz ${suggestion.number}`
                      : suggestion.icon === 'page'
                        ? `Page ${suggestion.number}`
                        : suggestion.icon === 'surah'
                          ? (() => {
                            const chapter = chapters.find((item) => item.id === suggestion.surahId);
                            return chapter ? `Surah ${chapter.name_simple}` : suggestion.query;
                          })()
                          : suggestion.verseKey;

                  return (
                    <Pressable
                      key={suggestion.query}
                      onPress={() => onSearchSuggestion(suggestion.query)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      className="rounded-lg px-2.5 py-2 flex-row items-center gap-2"
                      style={({ pressed }) => [{ width: '48%' }, { opacity: pressed ? 0.9 : 1 }]}
                    >
                      <View className="h-5 w-5 rounded bg-accent/10 items-center justify-center">
                        <SuggestionIcon icon={suggestion.icon} />
                      </View>
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
