import { BookOpen, Hash, Search as SearchIcon, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useQuickSearch } from '@/hooks/useQuickSearch';
import { highlightMissingQueryWords, isArabicQuery } from '@/lib/utils/searchHighlight';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { GoToSurahVerseCard } from './GoToSurahVerseCard';
import { HighlightedText } from './HighlightedText';

import type { SearchNavigationResult, SearchVerseResult } from '@/lib/api/search';

function getTranslationIds(settings: ReturnType<typeof useSettings>['settings']): number[] {
  const ids = settings.translationIds?.length
    ? settings.translationIds
    : [settings.translationId ?? 20];
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
}: {
  verse: SearchVerseResult;
  query: string;
  onPress: () => void;
  showDivider: boolean;
  arabicFontSize: number;
  translationFontSize: number;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const arabic = isArabicQuery(query);

  const highlighted = React.useMemo(() => {
    const base = arabic ? verse.textArabic : verse.highlightedTranslation;
    return highlightMissingQueryWords(base ?? '', query);
  }, [arabic, query, verse.highlightedTranslation, verse.textArabic]);

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

export function ComprehensiveSearchModal({
  isOpen,
  onClose,
  initialQuery = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}): React.JSX.Element {
  const router = useRouter();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const { settings } = useSettings();
  const translationIds = React.useMemo(
    () => getTranslationIds(settings),
    [settings.translationId, settings.translationIds]
  );

  const [query, setQuery] = React.useState(initialQuery);
  const inputRef = React.useRef<TextInput | null>(null);

  const { isLoading, errorMessage, navigationResults, verseResults } = useQuickSearch({
    query,
    translationIds,
    perPage: 10,
  });

  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(24)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  const closeAndReset = React.useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    closeAndReset();
  }, [closeAndReset]);

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    overlayOpacity.stopAnimation();
    translateY.stopAnimation();

    if (isOpen) {
      dismissEnabledRef.current = false;
      setVisible(true);
      setQuery(initialQuery);

      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      const enableDismissTimeout = setTimeout(() => {
        if (animationTokenRef.current !== token) return;
        dismissEnabledRef.current = true;
      }, 220);

      const focusTimeout = setTimeout(() => {
        if (animationTokenRef.current !== token) return;
        inputRef.current?.focus();
      }, 260);

      return () => {
        clearTimeout(enableDismissTimeout);
        clearTimeout(focusTimeout);
      };
    }

    dismissEnabledRef.current = false;
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 24, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [initialQuery, isOpen, overlayOpacity, translateY]);

  const navigateToSearchPage = React.useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    closeAndReset();
    router.push({ pathname: '/search', params: { query: trimmed } });
  }, [closeAndReset, query, router]);

  const navigateToSurahVerse = React.useCallback(
    (surahId: number, verse?: number) => {
      closeAndReset();
      router.push({
        pathname: '/surah/[surahId]',
        params: { surahId: String(surahId), ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}) },
      });
    },
    [closeAndReset, router]
  );

  const handleNavPress = React.useCallback(
    (result: SearchNavigationResult) => {
      if (result.resultType === 'surah') {
        navigateToSurahVerse(Number(result.key));
        return;
      }

      if (result.resultType === 'ayah') {
        const parsed = parseAyahKey(result.key);
        if (parsed) {
          navigateToSurahVerse(parsed.surahId, parsed.verse);
          return;
        }
      }

      if (result.resultType === 'juz') {
        closeAndReset();
        router.push({ pathname: '/juz/[juzNumber]', params: { juzNumber: String(result.key) } });
        return;
      }

      if (result.resultType === 'page') {
        closeAndReset();
        router.push({ pathname: '/page/[pageNumber]', params: { pageNumber: String(result.key) } });
        return;
      }

      navigateToSearchPage();
    },
    [closeAndReset, navigateToSearchPage, navigateToSurahVerse, router]
  );

  const handleVersePress = React.useCallback(
    (verse: SearchVerseResult) => {
      navigateToSurahVerse(verse.surahNumber, verse.verseNumber);
    },
    [navigateToSurahVerse]
  );

  const trimmedQuery = query.trim();
  const showGoTo = trimmedQuery.length === 0;
  const hasNavigationResults = navigationResults.length > 0;
  const previewVerses = React.useMemo(() => verseResults.slice(0, 10), [verseResults]);
  const hasVerseResults = previewVerses.length > 0;
  const hasResults = hasNavigationResults || hasVerseResults;

  const maxHeight = Math.max(0, Math.round(windowHeight * 0.9));
  const minHeight = showGoTo
    ? Math.min(maxHeight, Math.max(420, Math.round(windowHeight * 0.58)))
    : Math.min(maxHeight, Math.max(520, Math.round(windowHeight * 0.72)));

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={closeAndReset}
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.card,
            { maxHeight, minHeight },
            { transform: [{ translateY }] },
          ]}
          className="bg-surface-navigation dark:bg-surface-navigation-dark border border-border/30 dark:border-border-dark/20"
        >
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <KeyboardAvoidingView
              style={styles.inner}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View className={isDark ? 'dark' : ''} style={styles.inner}>
                <View className="px-4 py-3 border-b border-border/50 dark:border-border-dark/40 flex-row items-center gap-3">
                  <View className="flex-1 rounded-lg border border-border dark:border-border-dark bg-interactive/60 dark:bg-interactive-dark px-3 py-2.5 flex-row items-center gap-2">
                    <SearchIcon color={palette.muted} size={16} strokeWidth={2.25} />
                    <TextInput
                      ref={(node) => {
                        inputRef.current = node;
                      }}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search…"
                      placeholderTextColor={palette.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                      onSubmitEditing={navigateToSearchPage}
                      className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                    />
                  </View>

                  <Pressable
                    onPress={closeAndReset}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <X color={palette.muted} size={18} strokeWidth={2.25} />
                  </Pressable>
                </View>

                {showGoTo ? (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.goToContent}
                    nestedScrollEnabled
                  >
                    <GoToSurahVerseCard
                      onNavigate={navigateToSurahVerse}
                      onSearchSuggestion={(suggestion) => setQuery(suggestion)}
                      title="Go To"
                      buttonLabel="Go"
                      variant="card"
                    />
                  </ScrollView>
                ) : (
                  <View style={styles.resultsContainer}>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.resultsScrollContent}
                    >
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
                        onPress={navigateToSearchPage}
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
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  overlay: { flex: 1, backgroundColor: '#00000080' },
  card: {
    width: '100%',
    maxWidth: 704,
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  safeArea: { flex: 1 },
  inner: { flex: 1 },
  goToContent: { padding: 16, paddingBottom: 20 },
  resultsContainer: { flex: 1 },
  resultsScrollContent: { paddingVertical: 4 },
});
