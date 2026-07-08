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
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { getGoToCardSelectorVisualOffset } from './selectorDropdownLayout';
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
  if (icon === 'juz') return <Text className="text-[12px] font-bold text-accent dark:text-accent-dark">J</Text>;
  if (icon === 'page') return <Text className="text-[12px] font-bold text-accent dark:text-accent-dark">P</Text>;
  if (icon === 'ayah') return <Hash size={16} strokeWidth={2.25} color={palette.tint} />;
  return <BookOpen size={16} strokeWidth={2.25} color={palette.tint} />;
}

function toSuggestionRows(suggestions: SearchSuggestion[]): SearchSuggestion[][] {
  const rows: SearchSuggestion[][] = [];
  for (let index = 0; index < suggestions.length; index += 2) {
    rows.push(suggestions.slice(index, index + 2));
  }
  return rows;
}

export function GoToSurahVerseCard({
  title = 'Go To',
  subtitle,
  buttonLabel = 'Go',
  variant = 'card',
  onNavigate,
  onSearchSuggestion,
  dropdownVisualOffset = getGoToCardSelectorVisualOffset(),
}: {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  variant?: 'card' | 'embedded';
  onNavigate: (surahId: number, verse?: number) => void;
  onSearchSuggestion?: (query: string) => void;
  dropdownVisualOffset?: number;
}): React.JSX.Element {
  const { isDark, resolvedTheme } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
  const palette = Colors[resolvedTheme];
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
    (isLoading && chapters.length === 0 ? t('loading_surah') : undefined);
  const suggestionRows = React.useMemo(() => toSuggestionRows(SEARCH_SUGGESTIONS), []);

  const formPaddingClass = variant === 'card' ? 'px-5 pt-5 pb-4' : 'px-6 pt-5 pb-4';

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
                {title === 'Go To' ? t('go_to') : title}
              </Text>
              {subtitleText ? (
                <Text className="mt-1 text-sm text-muted dark:text-muted-dark">{subtitleText}</Text>
              ) : null}
            </View>

            <Pressable
              onPress={submit}
              disabled={!selectedSurah}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel === 'Go' ? t('go') : buttonLabel}
              className="rounded-lg bg-accent px-6 py-2"
              style={({ pressed }) => ({
                opacity: !selectedSurah ? 0.5 : pressed ? 0.9 : 1,
              })}
            >
              <Text className="text-sm font-semibold text-on-accent">{buttonLabel === 'Go' ? t('go') : buttonLabel}</Text>
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
              dropdownVisualOffset={dropdownVisualOffset}
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
                  {t('search_error_title')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Search Suggestions */}
          {onSearchSuggestion ? (
            <View className="mt-3 border-t border-border/50 dark:border-border-dark/40 pt-3">
              <Text className="mb-2 text-xs font-medium text-muted dark:text-muted-dark">
                {t('or_try_searching')}
              </Text>
              <View className="gap-1.5">
                {suggestionRows.map((row, rowIndex) => (
                  <View key={`suggestion-row-${rowIndex}`} className="flex-row gap-2.5">
                    {row.map((suggestion) => {
                      const label =
                        suggestion.icon === 'juz'
                          ? t('juz_number', { number: suggestion.number })
                          : suggestion.icon === 'page'
                            ? t('page_number_label', { number: suggestion.number })
                            : suggestion.icon === 'surah'
                              ? (() => {
                                const chapter = chapters.find((item) => item.id === suggestion.surahId);
                                if (chapter) return t(`surah_names.${chapter.id}`, { fallback: chapter.name_simple });
                                return suggestion.query.replace(/^Surah\s+/i, '');
                              })()
                              : suggestion.verseKey.replace(/\d+/g, (value) => formatNumber(Number(value)));

                      return (
                        <Pressable
                          key={suggestion.query}
                          onPress={() => onSearchSuggestion(suggestion.query)}
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          className="flex-1 min-w-0 rounded-lg px-3 py-3 flex-row items-center justify-start gap-2.5"
                          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                        >
                          <View className="h-7 w-7 rounded bg-accent/10 items-center justify-center">
                            <SuggestionIcon icon={suggestion.icon} />
                          </View>
                          <Text
                            numberOfLines={1}
                            className="flex-1 text-[16px] text-foreground dark:text-foreground-dark"
                            style={{ color: palette.text }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {row.length < 2 ? <View className="flex-1" /> : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
