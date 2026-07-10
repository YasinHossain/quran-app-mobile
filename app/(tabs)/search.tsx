import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';

import { AppHeader } from '@/components/navigation/AppHeader';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { GoToSurahVerseCard } from '@/components/search/GoToSurahVerseCard';
import { SearchVerseResultCard } from '@/components/search/SearchVerseResultCard';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch';
import { useChapters } from '@/hooks/useChapters';
import { analyzeQuery } from '@/lib/api/search';
import { warmSurahReaderBeforeNavigation } from '@/lib/surah/surahReaderWarmup';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { preloadOfflineTafsirWindow } from '@/lib/tafsir/tafsirCache';
import { useSettings } from '@/providers/SettingsContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { SearchNavigationResult } from '@/lib/api/search';
import type { Bookmark } from '@/types';

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

function NavigationChip({
  result,
  onPress,
}: {
  result: SearchNavigationResult;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={result.name}
      className="rounded-xl bg-interactive dark:bg-interactive-dark px-3 py-2"
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
        {result.name}
      </Text>
    </Pressable>
  );
}

export default function SearchScreen(): React.JSX.Element {
  const { t } = useUiTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string | string[] }>();
  const paramQuery = Array.isArray(params.query) ? params.query[0] : params.query;

  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const { isPinned } = useBookmarks();
  const audio = useAudioPlayer();
  const { chapters } = useChapters();
  const translationIds = React.useMemo(
    () => getTranslationIds(settings),
    [settings.translationId, settings.translationIds]
  );

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );
  const [activeVerse, setActiveVerse] = React.useState<{
    verseKey: string;
    verseApiId?: number;
    arabicText: string;
    translationTexts: string[];
    surahNumber: number;
  } | null>(null);

  const openVerseActions = React.useCallback(
    (params: {
      verseKey: string;
      verseApiId?: number;
      arabicText: string;
      translationTexts: string[];
      surahNumber: number;
    }) => {
      setActiveVerse(params);
      setIsVerseActionsOpen(true);
    },
    []
  );

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const handlePlayPause = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;

    if (audio.activeVerseKey === verseKey) {
      audio.togglePlay();
      return;
    }

    audio.playVerse(verseKey);
  }, [activeVerse?.verseKey, audio.activeVerseKey, audio.playVerse, audio.togglePlay]);

  const handleBookmark = React.useCallback(() => {
    if (!activeVerse) return;
    setIsBookmarkModalOpen(true);
  }, [activeVerse]);

  const handleOpenTafsir = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const [surah, ayah] = verseKey.split(':');
    if (!surah || !ayah) return;
    const surahNumber = Number(surah);
    primeVerseDetailsCache({
      verseKey,
      arabicText: activeVerse?.arabicText,
      translationIds,
      translationTexts: activeVerse?.translationTexts,
    });
    if (Number.isFinite(surahNumber) && surahNumber > 0) {
      const chapterVerseCount =
        chapters.find((chapter) => chapter.id === surahNumber)?.verses_count;
      void preloadOfflineTafsirWindow({
        surahId: surahNumber,
        ayahId: Number(ayah),
        tafsirIds: settings.tafsirIds ?? [],
        verseCount: chapterVerseCount,
      });
    }
    router.push({ pathname: '/tafsir/[surahId]/[ayahId]', params: { surahId: surah, ayahId: ayah } });
  }, [
    activeVerse?.arabicText,
    activeVerse?.translationTexts,
    activeVerse?.verseKey,
    chapters,
    router,
    settings.tafsirIds,
    translationIds,
  ]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    setPlannerVerseSummary({
      verseKey,
      surahId: activeVerse.surahNumber,
      arabicText: activeVerse.arabicText,
      translationText: activeVerse.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const chapter = chapters.find((c) => c.id === activeVerse.surahNumber);
    const lines = [
      chapter?.name_simple ? `${chapter.name_simple} ${activeVerse.verseKey}` : activeVerse.verseKey,
      '',
      activeVerse.arabicText,
      '',
      ...(activeVerse.translationTexts?.length ? [activeVerse.translationTexts[0]!] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore share failures.
    }
  }, [activeVerse, chapters]);

  const activeVersePinned = React.useMemo(() => {
    if (!activeVerse) return false;
    const apiId = typeof activeVerse.verseApiId === 'number' ? String(activeVerse.verseApiId) : null;
    return Boolean((apiId && isPinned(apiId)) || isPinned(activeVerse.verseKey));
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;
    const verseApiId =
      typeof activeVerse.verseApiId === 'number' &&
      Number.isFinite(activeVerse.verseApiId) &&
      activeVerse.verseApiId > 0
        ? activeVerse.verseApiId
        : undefined;
    const chapter = chapters.find((c) => c.id === activeVerse.surahNumber);
    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof verseApiId === 'number' ? { verseApiId } : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(chapter?.name_simple ? { surahName: chapter.name_simple } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse, chapters]);

  const [query, setQuery] = React.useState(paramQuery ?? '');
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  React.useEffect(() => {
    if (typeof paramQuery === 'string') setQuery(paramQuery);
  }, [paramQuery]);

  const trimmed = query.trim();
  const parsed = React.useMemo(() => analyzeQuery(trimmed), [trimmed]);
  const isNavigationQuery = parsed.type === 'navigation' && parsed.navigationType;
  const shouldSearch = trimmed.length >= 3 || isNavigationQuery;
  const effectiveQuery = shouldSearch ? trimmed : '';

  const {
    navigationResults,
    verses,
    isLoading,
    isLoadingMore,
    errorMessage,
    totalResults,
    hasNextPage,
    loadMore,
    refresh,
  } = usePaginatedSearch({
    query: effectiveQuery,
    translationIds,
    pageSize: 10,
  });

  const handleNavigateToSurahVerse = React.useCallback(
    (surahId: number, verse?: number) => {
      Keyboard.dismiss();
      void (async () => {
        await warmSurahReaderBeforeNavigation({ surahId, verseNumber: verse, settings });
        router.push({
          pathname: '/surah/[surahId]',
          params: {
            surahId: String(surahId),
            ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
          },
        });
      })();
    },
    [router, settings]
  );

  const handleNavResultPress = React.useCallback(
    (result: SearchNavigationResult) => {
      if (result.resultType === 'surah') {
        handleNavigateToSurahVerse(Number(result.key));
        return;
      }
      if (result.resultType === 'ayah') {
        const parsedKey = parseAyahKey(result.key);
        if (parsedKey) {
          handleNavigateToSurahVerse(parsedKey.surahId, parsedKey.verse);
          return;
        }
      }
      if (result.resultType === 'juz') {
        router.push({ pathname: '/juz/[juzNumber]', params: { juzNumber: String(result.key) } });
        return;
      }
      if (result.resultType === 'page') {
        router.push({ pathname: '/page/[pageNumber]', params: { pageNumber: String(result.key) } });
        return;
      }
    },
    [handleNavigateToSurahVerse, router]
  );

  const renderHeader = React.useMemo(() => {
    // Show "Go To" when the user is actively engaging with the search box and
    // hasn't typed a query yet. This prevents it from getting "stuck" hidden:
    // re-focusing the input always re-renders the card.
    const showGoTo = isSearchFocused && trimmed.length === 0;
    const showShortQueryHint = trimmed.length > 0 && !shouldSearch;

    return (
      <View className="pt-3 pb-3 gap-4">
        <View className="rounded-xl bg-interactive dark:bg-interactive-dark px-4 py-3 flex-row items-center gap-2 border border-border/30 dark:border-border-dark/20">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search', { fallback: 'Search' }) + '…'}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onSubmitEditing={() => Keyboard.dismiss()}
            className="flex-1 text-base text-foreground dark:text-foreground-dark"
          />
        </View>

        {showShortQueryHint ? (
          <Text className="text-sm text-muted dark:text-muted-dark">
            Type at least 3 characters to search.
          </Text>
        ) : null}

        {errorMessage ? (
          <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
        ) : null}

        {showGoTo ? (
          <GoToSurahVerseCard
            onNavigate={handleNavigateToSurahVerse}
            onSearchSuggestion={(suggestion) => setQuery(suggestion)}
            title="Go To"
            buttonLabel="Go"
          />
        ) : null}

        {navigationResults.length > 0 ? (
          <View className="gap-2">
            <Text className="text-xs font-semibold text-muted dark:text-muted-dark">Go To</Text>
            <View className="flex-row flex-wrap gap-2">
              {navigationResults.slice(0, 8).map((result) => (
                <NavigationChip
                  key={`${result.resultType}-${String(result.key)}`}
                  result={result}
                  onPress={() => handleNavResultPress(result)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {effectiveQuery ? (
          <Text className="text-xs text-muted dark:text-muted-dark">
            {totalResults ? `${totalResults} results` : 'Results'}
          </Text>
        ) : null}
      </View>
    );
  }, [
    effectiveQuery,
    errorMessage,
    handleNavResultPress,
    handleNavigateToSurahVerse,
    isSearchFocused,
    navigationResults,
    palette.muted,
    query,
    shouldSearch,
    totalResults,
    trimmed.length,
  ]);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <AppHeader
        title="Search"
        right={
          <Pressable
            onPress={() => setIsSettingsOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            {({ pressed }) => (
              <Settings
                color={palette.text}
                size={22}
                strokeWidth={2.25}
                style={{ marginRight: 12, opacity: pressed ? 0.5 : 1 }}
              />
            )}
          </Pressable>
        }
      />

      <FlashList
        data={verses}
        keyExtractor={(item) => item.verseKey}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        renderItem={({ item }) => (
          <SearchVerseResultCard
            verse={item}
            query={trimmed}
            arabicFontSize={settings.arabicFontSize}
            arabicFontFace={settings.arabicFontFace}
            translationFontSize={settings.translationFontSize}
            isAudioActive={Boolean(audio.isPlaying && audio.activeVerseKey === item.verseKey)}
            onOpenActions={() =>
              openVerseActions({
                verseKey: item.verseKey,
                verseApiId: item.verseId,
                arabicText: item.textArabic ?? '',
                translationTexts: [item.highlightedTranslation ? item.highlightedTranslation.replace(/<[^>]*>/g, '') : ''],
                surahNumber: item.surahNumber,
              })
            }
            onPress={() => handleNavigateToSurahVerse(item.surahNumber, item.verseNumber)}
          />
        )}
        ListHeaderComponent={renderHeader}
        refreshing={Boolean(effectiveQuery) && isLoading && verses.length === 0}
        onRefresh={refresh}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage) loadMore();
        }}
        ListEmptyComponent={
          effectiveQuery ? (
            isLoading ? (
              <View className="py-6 flex-row items-center gap-2">
                <ActivityIndicator size="small" color={palette.muted} />
                <Text className="text-sm text-muted dark:text-muted-dark">Searching…</Text>
              </View>
            ) : (
              <View className="py-6">
                <Text className="text-sm text-muted dark:text-muted-dark">No results.</Text>
              </View>
            )
          ) : (
            <View className="py-6" />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View className="py-6 flex-row items-center gap-2">
              <ActivityIndicator size="small" color={palette.muted} />
              <Text className="text-sm text-muted dark:text-muted-dark">Loading more…</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      />

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={
          chapters.find((c) => c.id === activeVerse?.surahNumber)?.name_simple ?? 'Surah'
        }
        verseKey={activeVerse?.verseKey ?? ''}
        isPlaying={Boolean(audio.isPlaying && audio.activeVerseKey === activeVerse?.verseKey)}
        isBookmarked={activeVersePinned}
        onPlayPause={handlePlayPause}
        onOpenTafsir={handleOpenTafsir}
        onBookmark={handleBookmark}
        onAddToPlan={handleAddToPlan}
        onShare={handleShare}
      />

      <BookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => setIsBookmarkModalOpen(false)}
        verseId={
          typeof activeVerse?.verseApiId === 'number' &&
          Number.isFinite(activeVerse.verseApiId) &&
          activeVerse.verseApiId > 0
            ? String(activeVerse.verseApiId)
            : (activeVerse?.verseKey ?? '')
        }
        verseKey={activeVerse?.verseKey ?? ''}
        metadata={activeVerseBookmarkMetadata}
      />

      {plannerVerseSummary ? (
        <AddToPlannerModal
          isOpen={isAddToPlannerOpen}
          onClose={() => setIsAddToPlannerOpen(false)}
          verseSummary={plannerVerseSummary}
        />
      ) : null}

      <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </View>
  );
}
