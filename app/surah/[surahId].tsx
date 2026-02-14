import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';

import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { SurahHeaderCard } from '@/components/surah/SurahHeaderCard';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { useSurahVerses, type SurahVerse } from '@/hooks/useSurahVerses';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Bookmark } from '@/types';

export default function SurahScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ surahId?: string | string[]; startVerse?: string | string[] }>();
  const router = useRouter();
  const surahId = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;
  const startVerseParam = Array.isArray(params.startVerse) ? params.startVerse[0] : params.startVerse;
  const startVerse = startVerseParam ? Number(startVerseParam) : NaN;
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = React.useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = React.useState('');
  const headerSearchInputRef = React.useRef<TextInput | null>(null);
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
  } | null>(null);

  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const { settings } = useSettings();
  const { isPinned, setLastRead } = useBookmarks();
  const chapterNumber = surahId ? Number(surahId) : NaN;
  const translationIds = React.useMemo(() => {
    // An explicit empty array means "no translations selected" (Arabic-only mode).
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);

  const {
    chapter,
    verses,
    isLoading,
    isRefreshing,
    isLoadingMore,
    errorMessage,
    offlineNotInstalled,
    refresh,
    retry,
    loadMore,
  } = useSurahVerses({ chapterNumber, translationIds });

  const openVerseActions = React.useCallback(
    (params: {
      verseKey: string;
      verseApiId?: number;
      arabicText: string;
      translationTexts: string[];
    }) => {
      setActiveVerse(params);
      setIsVerseActionsOpen(true);
    },
    []
  );

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const closeHeaderSearch = React.useCallback(
    ({ clearQuery }: { clearQuery: boolean }) => {
      setIsHeaderSearchOpen(false);
      if (clearQuery) setHeaderSearchQuery('');
      headerSearchInputRef.current?.blur();
      Keyboard.dismiss();
    },
    []
  );

  const updateHeaderSearchQuery = React.useCallback((value: string) => {
    setHeaderSearchQuery(value);
    setIsHeaderSearchOpen(true);
  }, []);

  const navigateToSearchPage = React.useCallback(() => {
    const trimmed = headerSearchQuery.trim();
    if (!trimmed) return;
    closeHeaderSearch({ clearQuery: true });
    router.push({ pathname: '/search', params: { query: trimmed } });
  }, [closeHeaderSearch, headerSearchQuery, router]);

  const navigateToSurahVerse = React.useCallback(
    (targetSurahId: number, verse?: number) => {
      closeHeaderSearch({ clearQuery: true });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(targetSurahId),
          ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
        },
      });
    },
    [closeHeaderSearch, router]
  );

  const navigateToJuz = React.useCallback(
    (juzNumber: number) => {
      closeHeaderSearch({ clearQuery: true });
      router.push({ pathname: '/juz/[juzNumber]', params: { juzNumber: String(juzNumber) } });
    },
    [closeHeaderSearch, router]
  );

  const navigateToPage = React.useCallback(
    (pageNumber: number) => {
      closeHeaderSearch({ clearQuery: true });
      router.push({ pathname: '/page/[pageNumber]', params: { pageNumber: String(pageNumber) } });
    },
    [closeHeaderSearch, router]
  );

  const navigateToDownloads = React.useCallback(() => {
    router.push('/downloads');
  }, [router]);

  const listExtraData = React.useMemo(
    () => ({
      arabicFontSize: settings.arabicFontSize,
      translationFontSize: settings.translationFontSize,
      arabicFontFace: settings.arabicFontFace,
      showByWords: settings.showByWords,
    }),
    [
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.translationFontSize,
    ]
  );

  const handlePlayPause = React.useCallback(() => {
    Alert.alert('Audio coming soon', 'Audio playback will be added next.');
  }, []);

  const handleBookmark = React.useCallback(() => {
    if (!activeVerse) return;
    setIsBookmarkModalOpen(true);
  }, [activeVerse]);

  const handleOpenTafsir = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const [surah, ayah] = verseKey.split(':');
    if (!surah || !ayah) return;
    router.push({ pathname: '/tafsir/[surahId]/[ayahId]', params: { surahId: surah, ayahId: ayah } });
  }, [activeVerse?.verseKey, router]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    setPlannerVerseSummary({
      verseKey,
      ...(Number.isFinite(chapterNumber) ? { surahId: chapterNumber } : {}),
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse?.arabicText, activeVerse?.translationTexts, activeVerse?.verseKey, chapterNumber]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
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
  }, [activeVerse, chapter?.name_simple]);

  const renderVerseItem = React.useCallback(
    ({ item }: { item: SurahVerse }) => {
      const translationTexts = item.translationTexts ?? [];
      const verseApiId =
        typeof item.id === 'number' && Number.isFinite(item.id) && item.id > 0 ? item.id : undefined;

      return (
        <VerseCard
          verseKey={item.verse_key}
          arabicText={item.text_uthmani ?? ''}
          translationTexts={translationTexts}
          arabicFontSize={settings.arabicFontSize}
          arabicFontFace={settings.arabicFontFace}
          translationFontSize={settings.translationFontSize}
          showByWords={settings.showByWords}
          onOpenActions={() =>
            openVerseActions({
              verseKey: item.verse_key,
              verseApiId,
              arabicText: item.text_uthmani ?? '',
              translationTexts,
            })
          }
        />
      );
    },
    [
      openVerseActions,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.translationFontSize,
    ]
  );

  const flatListRef = React.useRef<FlatList<SurahVerse> | null>(null);
  const flashListRef = React.useRef<FlashListRef<SurahVerse> | null>(null);
  const didScrollToStartRef = React.useRef(false);
  const [scrollTick, bumpScrollTick] = React.useReducer((value) => value + 1, 0);
  const scrollRetryCountRef = React.useRef(0);
  const scrollRetryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapterNumberRef = React.useRef(chapterNumber);
  React.useEffect(() => {
    chapterNumberRef.current = chapterNumber;
  }, [chapterNumber]);

  const setLastReadRef = React.useRef(setLastRead);
  React.useEffect(() => {
    setLastReadRef.current = setLastRead;
  }, [setLastRead]);

  const lastReadReportedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    lastReadReportedRef.current = null;
  }, [surahId]);

  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const currentSurahId = chapterNumberRef.current;
      if (!Number.isFinite(currentSurahId) || currentSurahId <= 0) return;

      let bestIndex = Number.POSITIVE_INFINITY;
      let bestItem: SurahVerse | null = null;

      for (const token of viewableItems) {
        if (!token.isViewable) continue;
        const index = typeof token.index === 'number' ? token.index : Number.POSITIVE_INFINITY;
        if (index >= bestIndex) continue;
        bestIndex = index;
        bestItem = token.item as SurahVerse;
      }

      if (!bestItem) return;

      const verseNumber = bestItem.verse_number;
      if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;

      const globalVerseId =
        typeof bestItem.id === 'number' && Number.isFinite(bestItem.id) && bestItem.id > 0
          ? bestItem.id
          : undefined;

      const key = `${currentSurahId}:${verseNumber}`;
      if (lastReadReportedRef.current === key) return;
      lastReadReportedRef.current = key;

      setLastReadRef.current(
        String(currentSurahId),
        verseNumber,
        bestItem.verse_key,
        globalVerseId
      );
    }
  ).current;

  React.useEffect(() => {
    return () => {
      if (!scrollRetryTimeoutRef.current) return;
      clearTimeout(scrollRetryTimeoutRef.current);
      scrollRetryTimeoutRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    didScrollToStartRef.current = false;
    scrollRetryCountRef.current = 0;
    if (scrollRetryTimeoutRef.current) {
      clearTimeout(scrollRetryTimeoutRef.current);
      scrollRetryTimeoutRef.current = null;
    }
  }, [surahId, startVerseParam]);

  React.useEffect(() => {
    if (!Number.isFinite(startVerse) || startVerse <= 0) return;
    if (didScrollToStartRef.current) return;
    if (isLoading) return;

    const targetIndex = Math.max(0, Math.floor(startVerse) - 1);

    if (targetIndex >= verses.length) {
      if (!isLoadingMore && !errorMessage) {
        loadMore();
      }
      return;
    }

    const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
    if (!list) return;

    try {
      list.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0 });
      didScrollToStartRef.current = true;
    } catch {
      if (scrollRetryCountRef.current >= 6) return;
      scrollRetryCountRef.current += 1;
      if (scrollRetryTimeoutRef.current) return;
      scrollRetryTimeoutRef.current = setTimeout(() => {
        scrollRetryTimeoutRef.current = null;
        bumpScrollTick();
      }, 120);
    }
  }, [errorMessage, isLoading, isLoadingMore, loadMore, scrollTick, startVerse, verses.length]);

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
    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof verseApiId === 'number' ? { verseApiId } : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(chapter?.name_simple ? { surahName: chapter.name_simple } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse, chapter?.name_simple]);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          title: '',
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginLeft: 12 })}
            >
              <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
            </Pressable>
          ),
          headerTitle: () => (
            <View style={{ width: '100%', paddingHorizontal: 8 }}>
              <HeaderSearchInput
                ref={(node) => {
                  headerSearchInputRef.current = node;
                }}
                value={headerSearchQuery}
                onChangeText={updateHeaderSearchQuery}
                placeholder="Search…"
                onFocus={() => setIsHeaderSearchOpen(true)}
                onSubmitEditing={navigateToSearchPage}
              />
            </View>
          ),
          headerRight: () => (
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
          ),
        }}
      />

      {Platform.OS === 'web' ? (
        <FlatList
          ref={(node) => {
            flatListRef.current = node;
          }}
          data={verses}
          keyExtractor={(item) => item.verse_key}
          extraData={listExtraData}
          renderItem={renderVerseItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshing={isRefreshing}
          onRefresh={refresh}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          ListHeaderComponent={chapter ? <SurahHeaderCard chapter={chapter} /> : null}
          ListEmptyComponent={
            offlineNotInstalled ? (
              <View className="mt-2 gap-3">
                <Text className="text-sm text-muted dark:text-muted-dark">
                  You’re offline and this translation isn’t downloaded yet.
                </Text>
                <Pressable
                  onPress={navigateToDownloads}
                  accessibilityRole="button"
                  accessibilityLabel="Download translations for offline use"
                  className="self-start rounded-lg bg-accent px-4 py-2"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-on-accent">
                    Download translations for offline use
                  </Text>
                </Pressable>
              </View>
            ) : errorMessage ? (
              <View className="mt-2 gap-3">
                <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                <Pressable
                  onPress={retry}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading verses"
                  className="self-start rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : isLoading ? (
              <View className="mt-3 flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">Loading…</Text>
              </View>
            ) : (
              <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
                No verses found for this surah.
              </Text>
            )
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View className="mt-2 flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">Loading more…</Text>
              </View>
            ) : errorMessage && verses.length ? (
              <View className="mt-2 gap-3">
                <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                <Pressable
                  onPress={loadMore}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading more verses"
                  className="self-start rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      ) : (
        <FlashList
          ref={(node) => {
            flashListRef.current = node;
          }}
          data={verses}
          keyExtractor={(item) => item.verse_key}
          extraData={listExtraData}
          renderItem={renderVerseItem}
          drawDistance={Platform.OS === 'android' ? 1200 : 800}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshing={isRefreshing}
          onRefresh={refresh}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          ListHeaderComponent={chapter ? <SurahHeaderCard chapter={chapter} /> : null}
          ListEmptyComponent={
            offlineNotInstalled ? (
              <View className="mt-2 gap-3">
                <Text className="text-sm text-muted dark:text-muted-dark">
                  You’re offline and this translation isn’t downloaded yet.
                </Text>
                <Pressable
                  onPress={navigateToDownloads}
                  accessibilityRole="button"
                  accessibilityLabel="Download translations for offline use"
                  className="self-start rounded-lg bg-accent px-4 py-2"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-on-accent">
                    Download translations for offline use
                  </Text>
                </Pressable>
              </View>
            ) : errorMessage ? (
              <View className="mt-2 gap-3">
                <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                <Pressable
                  onPress={retry}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading verses"
                  className="self-start rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : isLoading ? (
              <View className="mt-3 flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">Loading…</Text>
              </View>
            ) : (
              <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
                No verses found for this surah.
              </Text>
            )
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View className="mt-2 flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">Loading more…</Text>
              </View>
            ) : errorMessage && verses.length ? (
              <View className="mt-2 gap-3">
                <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                <Pressable
                  onPress={loadMore}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading more verses"
                  className="self-start rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={chapter?.name_simple ?? 'Surah'}
        verseKey={activeVerse?.verseKey ?? ''}
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

      <ComprehensiveSearchDropdown
        isOpen={isHeaderSearchOpen}
        query={headerSearchQuery}
        onQueryChange={updateHeaderSearchQuery}
        onClose={() => closeHeaderSearch({ clearQuery: false })}
        onNavigateToSurahVerse={navigateToSurahVerse}
        onNavigateToJuz={navigateToJuz}
        onNavigateToPage={navigateToPage}
        onNavigateToSearch={(query) => {
          const trimmed = query.trim();
          if (!trimmed) return;
          closeHeaderSearch({ clearQuery: true });
          router.push({ pathname: '/search', params: { query: trimmed } });
        }}
      />
      <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </View>
  );
}
