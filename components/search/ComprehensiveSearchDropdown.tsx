import { BookOpen, Hash, Search as SearchIcon } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useQuickSearch } from '@/hooks/useQuickSearch';
import { highlightMissingQueryWords, isArabicQuery } from '@/lib/utils/searchHighlight';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { GoToSurahVerseCard } from './GoToSurahVerseCard';
import { HighlightedText } from './HighlightedText';

import type { SearchNavigationResult, SearchVerseResult } from '@/lib/api/search';

const QPC_UNSUPPORTED_GLYPH = '\u06DF';

function getFirstFontFamily(fontFace: string | undefined): string | undefined {
  if (!fontFace) return undefined;
  const first = fontFace.split(',')[0]?.trim();
  if (!first) return undefined;
  return first.replace(/^['"]|['"]$/g, '').trim() || undefined;
}

function resolveArabicFontFamily(fontFace: string | undefined, arabicText: string): string {
  const normalized = getFirstFontFamily(fontFace) ?? 'UthmanicHafs1Ver18';
  const sanitized = arabicText.trim();
  const shouldUseScheherazadeFallback =
    normalized.includes('UthmanicHafs1Ver18') && sanitized.includes(QPC_UNSUPPORTED_GLYPH);
  return shouldUseScheherazadeFallback ? 'Scheherazade New' : normalized;
}

function getTranslationIds(settings: ReturnType<typeof useSettings>['settings']): number[] {
  const ids = settings.translationIds?.length ? settings.translationIds : [settings.translationId ?? 20];
  return ids.filter((id) => Number.isFinite(id) && id > 0);
}

function parseAyahKey(key: string | number): { surahId: number; verse: number } | null {
  const raw = typeof key === 'string' ? key : String(key);
  const [s, a] = raw.split(':');
  const surahId = Number.parseInt(s ?? '', 10);
  const verse = Number.parseInt(a ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verse)) return null;
  if (surahId <= 0 || verse <= 0) return null;
  return { surahId, verse };
}

function NavIcon({ type }: { type: SearchNavigationResult['resultType'] }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  if (type === 'surah') return <BookOpen size={16} strokeWidth={2.25} color={palette.tint} />;
  if (type === 'ayah') return <Hash size={16} strokeWidth={2.25} color={palette.tint} />;
  if (type === 'juz') return <Text className="text-xs font-bold text-accent dark:text-accent-dark">J</Text>;
  if (type === 'page') return <Text className="text-xs font-bold text-accent dark:text-accent-dark">P</Text>;
  return <SearchIcon size={16} strokeWidth={2.25} color={palette.tint} />;
}

function NavigationRow({
  result,
  onPress,
}: {
  result: SearchNavigationResult;
  onPress: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={result.name}
      className="px-4 py-3 flex-row items-center gap-3"
      style={({ pressed }) => ({ backgroundColor: pressed ? `${palette.tint}1A` : 'transparent' })}
    >
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
        <NavIcon type={result.resultType} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground dark:text-foreground-dark">
          {result.name}
        </Text>
        <Text className="mt-0.5 text-xs text-muted dark:text-muted-dark capitalize">
          {result.resultType}
        </Text>
      </View>
    </Pressable>
  );
}

function VersePreviewRow({
  verse,
  query,
  onPress,
  showDivider,
  arabicFontSize,
  translationFontSize,
  arabicFontFace,
}: {
  verse: SearchVerseResult;
  query: string;
  onPress: () => void;
  showDivider: boolean;
  arabicFontSize: number;
  translationFontSize: number;
  arabicFontFace?: string;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const arabic = isArabicQuery(query);

  const highlighted = React.useMemo(() => {
    const base = arabic ? verse.textArabic : verse.highlightedTranslation;
    return highlightMissingQueryWords(base ?? '', query);
  }, [arabic, query, verse.highlightedTranslation, verse.textArabic]);
  const arabicFamily = React.useMemo(
    () => resolveArabicFontFamily(arabicFontFace, verse.textArabic ?? ''),
    [arabicFontFace, verse.textArabic]
  );

  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Go to ${verse.verseKey}`}
        className="px-4 py-4"
        style={({ pressed }) => ({ backgroundColor: pressed ? `${palette.tint}14` : 'transparent' })}
      >
        <View className="flex-row items-start gap-3">
          <View className="mt-0.5 rounded-md bg-accent px-2 py-1">
            <Text className="text-xs font-semibold text-on-accent">{verse.verseKey}</Text>
          </View>

          <View className="flex-1">
            <HighlightedText
              html={highlighted}
              numberOfLines={3}
              textStyle={{
                color: palette.text,
                fontSize: arabic ? arabicFontSize : Math.max(13, translationFontSize - 2),
                lineHeight: arabic ? Math.max(22, arabicFontSize + 6) : 22,
                fontFamily: arabic ? arabicFamily : undefined,
                writingDirection: arabic ? 'rtl' : 'auto',
                textAlign: arabic ? 'right' : 'left',
              }}
              highlightStyle={{
                backgroundColor: `${palette.tint}22`,
                color: palette.text,
                fontWeight: '700',
              }}
            />
          </View>
        </View>
      </Pressable>

      {showDivider ? (
        <View style={{ height: StyleSheet.hairlineWidth }} className="bg-border/30 dark:bg-border-dark/30" />
      ) : null}
    </View>
  );
}

export function ComprehensiveSearchDropdown({
  isOpen,
  query,
  onQueryChange,
  onClose,
  onNavigateToSurahVerse,
  onNavigateToJuz,
  onNavigateToPage,
  onNavigateToSearch,
}: {
  isOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onNavigateToSurahVerse: (surahId: number, verse?: number) => void;
  onNavigateToJuz: (juzNumber: number) => void;
  onNavigateToPage: (pageNumber: number) => void;
  onNavigateToSearch: (query: string) => void;
}): React.JSX.Element | null {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const [cardLayout, setCardLayout] = React.useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const { settings } = useSettings();
  const translationIds = React.useMemo(() => getTranslationIds(settings), [settings.translationId, settings.translationIds]);

  const { isLoading, errorMessage, navigationResults, verseResults } = useQuickSearch({
    enabled: isOpen,
    query,
    translationIds,
    perPage: 10,
  });

  const trimmedQuery = query.trim();
  const showGoTo = trimmedQuery.length === 0;
  const hasNavigationResults = navigationResults.length > 0;
  const previewVerses = React.useMemo(() => verseResults.slice(0, 10), [verseResults]);
  const hasVerseResults = previewVerses.length > 0;
  const hasResults = hasNavigationResults || hasVerseResults;

  const maxHeight = Math.max(0, Math.round(windowHeight * 0.82));
  const goToMinHeight = Math.min(360, Math.max(300, Math.round(windowHeight * 0.3)));
  const minHeight = showGoTo
    ? Math.min(maxHeight, goToMinHeight)
    : Math.min(maxHeight, Math.max(520, Math.round(windowHeight * 0.72)));

  const handleNavPress = React.useCallback(
    (result: SearchNavigationResult) => {
      if (result.resultType === 'surah') {
        onNavigateToSurahVerse(Number(result.key));
        return;
      }

      if (result.resultType === 'ayah') {
        const parsed = parseAyahKey(result.key);
        if (parsed) {
          onNavigateToSurahVerse(parsed.surahId, parsed.verse);
          return;
        }
      }

      if (result.resultType === 'juz') {
        onNavigateToJuz(Number(result.key));
        return;
      }

      if (result.resultType === 'page') {
        onNavigateToPage(Number(result.key));
        return;
      }

      onNavigateToSearch(trimmedQuery);
    },
    [onNavigateToJuz, onNavigateToPage, onNavigateToSearch, onNavigateToSurahVerse, trimmedQuery]
  );

  const handleVersePress = React.useCallback(
    (verse: SearchVerseResult) => {
      onNavigateToSurahVerse(verse.surahNumber, verse.verseNumber);
    },
    [onNavigateToSurahVerse]
  );

  if (!isOpen) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} pointerEvents="none" className="bg-black/30" />

      {cardLayout ? (
        <>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            style={[
              styles.outsidePressable,
              { left: 0, right: 0, top: 0, height: Math.max(0, cardLayout.y - 1) },
            ]}
          />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            style={[
              styles.outsidePressable,
              {
                left: 0,
                right: 0,
                top: Math.max(0, cardLayout.y + cardLayout.height + 1),
                bottom: 0,
              },
            ]}
          />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            style={[
              styles.outsidePressable,
              {
                left: 0,
                top: cardLayout.y,
                width: Math.max(0, cardLayout.x - 1),
                height: cardLayout.height,
              },
            ]}
          />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            style={[
              styles.outsidePressable,
              {
                left: Math.max(0, cardLayout.x + cardLayout.width + 1),
                right: 0,
                top: cardLayout.y,
                height: cardLayout.height,
              },
            ]}
          />
        </>
      ) : null}

      <View
        onLayout={(event) => {
          setCardLayout(event.nativeEvent.layout);
        }}
        style={[styles.card, { maxHeight, minHeight }]}
        className="bg-surface-navigation dark:bg-surface-navigation-dark border border-border/30 dark:border-border-dark/20"
      >
        <View className={isDark ? 'dark' : ''} style={styles.inner}>
          {showGoTo ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.goToContent}
              nestedScrollEnabled
            >
              <GoToSurahVerseCard
                onNavigate={onNavigateToSurahVerse}
                onSearchSuggestion={(suggestion) => onQueryChange(suggestion)}
                title="Go To"
                buttonLabel="Go"
                variant="embedded"
              />
            </ScrollView>
          ) : (
            <View style={styles.resultsContainer}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.resultsScrollContent}>
                {isLoading ? (
                  <View className="px-4 py-4 flex-row items-center gap-3">
                    <ActivityIndicator size="small" color={palette.muted} />
                    <Text className="text-sm text-muted dark:text-muted-dark">Searching…</Text>
                  </View>
                ) : null}

                {errorMessage ? (
                  <View className="px-4 py-4">
                    <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                  </View>
                ) : null}

                {hasNavigationResults ? (
                  <View className="border-b border-border/50 dark:border-border-dark/40 py-2">
                    <Text className="px-4 py-1 text-xs font-medium uppercase tracking-wider text-muted dark:text-muted-dark">
                      Go To
                    </Text>
                    {navigationResults.map((result) => (
                      <NavigationRow
                        key={`${result.resultType}-${String(result.key)}`}
                        result={result}
                        onPress={() => handleNavPress(result)}
                      />
                    ))}
                  </View>
                ) : null}

                {hasVerseResults ? (
                  <View className="py-2">
                    <View className="px-4 py-1 flex-row items-center justify-between">
                      <Text className="text-xs font-medium uppercase tracking-wider text-muted dark:text-muted-dark">
                        Search Results
                      </Text>
                      <Text className="text-xs text-muted dark:text-muted-dark">
                        Showing {previewVerses.length}
                      </Text>
                    </View>
                    <View className="border-y border-border/50 dark:border-border-dark/40">
                      {previewVerses.map((verse, index) => (
                        <VersePreviewRow
                          key={verse.verseKey}
                          verse={verse}
                          query={trimmedQuery}
                          onPress={() => handleVersePress(verse)}
                          showDivider={index < previewVerses.length - 1}
                          arabicFontSize={settings.arabicFontSize}
                          translationFontSize={settings.translationFontSize}
                          arabicFontFace={settings.arabicFontFace}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {!isLoading && !errorMessage && !hasResults ? (
                  <View className="px-4 py-8 items-center">
                    <Text className="text-sm text-muted dark:text-muted-dark">
                      No results found for “{trimmedQuery}”
                    </Text>
                  </View>
                ) : null}
              </ScrollView>

              <View className="p-3 border-t border-border/50 dark:border-border-dark/40">
                <Pressable
                  onPress={() => onNavigateToSearch(trimmedQuery)}
                  accessibilityRole="button"
                  accessibilityLabel="View all search results"
                  className="rounded-lg px-4 py-2.5 border border-accent/30 bg-accent/10"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <View className="flex-row items-center justify-center gap-2">
                    <SearchIcon color={palette.tint} size={16} strokeWidth={2.25} />
                    <Text className="text-sm font-medium text-accent dark:text-accent-dark">
                      View all results for “{trimmedQuery}”
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  outsidePressable: {
    position: 'absolute',
    backgroundColor: 'transparent',
    zIndex: 0,
  },
  card: {
    width: '100%',
    maxWidth: 704,
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'visible',
    zIndex: 1,
    elevation: 12,
  },
  inner: { flex: 1 },
  goToContent: { paddingTop: 6, paddingBottom: 4 },
  resultsContainer: { flex: 1 },
  resultsScrollContent: { paddingVertical: 4 },
});
