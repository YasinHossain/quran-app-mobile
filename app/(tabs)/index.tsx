import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  Keyboard,
  Platform,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeRecentCard } from '@/components/home/HomeRecentCard';
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';
import { HomeTabToggle, type HomeTab } from '@/components/home/HomeTabToggle';
import { HomeVersePlaceholder } from '@/components/home/HomeVersePlaceholder';
import { JuzCard, type JuzSummary } from '@/components/home/JuzCard';
import { PageCard } from '@/components/home/PageCard';
import { SurahCard } from '@/components/home/SurahCard';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useChapters } from '@/hooks/useChapters';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import juzData from '../../src/data/juz.json';

import type { Chapter } from '@/types';

const STICKY_HEADER_INDICES = [0];
const PINNED_TAB_OFFSET_TOLERANCE = 2;
const LIST_HORIZONTAL_PADDING = 12;
const TABS_BAR_HORIZONTAL_PADDING = 12;

const mapChapterToSurah = (chapter: Chapter): Surah =>
  new Surah({
    id: chapter.id,
    name: chapter.name_simple,
    arabicName: chapter.name_arabic,
    englishName: chapter.name_simple,
    englishTranslation: chapter.translated_name?.name ?? '',
    numberOfAyahs: chapter.verses_count,
    revelationType:
      chapter.revelation_place === 'makkah' ? RevelationType.MAKKI : RevelationType.MADANI,
  });

function getNumColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

type HomeListItem =
  | { type: 'tabs'; key: 'tabs' }
  | { type: 'message'; key: 'loading' | 'error'; message: string; tone: 'muted' | 'error' }
  | { type: 'surah'; key: string; surah: Surah }
  | { type: 'juz'; key: string; juz: JuzSummary }
  | { type: 'page'; key: string; pageNumber: number };

function HomeSearchHeader({
  headerSearchInputRef,
  headerSearchQuery,
  onQueryChange,
  onFocus,
  onSubmit,
}: {
  headerSearchInputRef: React.RefObject<TextInput | null>;
  headerSearchQuery: string;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 12 }}
      className="bg-background dark:bg-background-dark"
    >
      <HeaderSearchInput
        ref={(node) => {
          headerSearchInputRef.current = node;
        }}
        value={headerSearchQuery}
        onChangeText={onQueryChange}
        placeholder="Search…"
        onFocus={onFocus}
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

function HomeIntro({
  onLayout,
}: {
  onLayout: (height: number) => void;
}): React.JSX.Element {
  return (
    <View
      onLayout={(event) => onLayout(Math.round(event.nativeEvent.layout.height))}
      className="px-3 pt-3 pb-4"
    >
      <HomeVersePlaceholder />
      <View className="mt-4">
        <HomeShortcutGrid />
      </View>
      <View className="mt-3">
        <HomeRecentCard />
      </View>
    </View>
  );
}

function HomeTabsBar({
  activeTab,
  containerWidth,
  isSticky,
  onTabChange,
}: {
  activeTab: HomeTab;
  containerWidth: number;
  isSticky: boolean;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  const tabsBarWidth = Math.max(0, containerWidth - LIST_HORIZONTAL_PADDING * 2);
  const toggleWidth = Math.max(0, tabsBarWidth - TABS_BAR_HORIZONTAL_PADDING * 2);

  return (
    <View
      className="bg-background dark:bg-background-dark"
      style={isSticky ? { zIndex: 10, elevation: 8 } : undefined}
    >
      <View className="px-3 pb-3 pt-1" style={{ width: tabsBarWidth, alignSelf: 'center' }}>
        <HomeTabToggle activeTab={activeTab} width={toggleWidth} onTabChange={onTabChange} />
      </View>
    </View>
  );
}

function HomeListMessage({
  message,
  tone,
}: {
  message: string;
  tone: 'muted' | 'error';
}): React.JSX.Element {
  return (
    <View className="px-3 py-4">
      <Text
        className={
          tone === 'error'
            ? 'text-sm text-error dark:text-error-dark'
            : 'text-sm text-muted dark:text-muted-dark'
        }
      >
        {message}
      </Text>
    </View>
  );
}

function buildHomeListData({
  activeTab,
  errorMessage,
  isLoading,
  pageNumbers,
  surahs,
}: {
  activeTab: HomeTab;
  errorMessage: string | null;
  isLoading: boolean;
  pageNumbers: number[];
  surahs: Surah[];
}): HomeListItem[] {
  const data: HomeListItem[] = [{ type: 'tabs', key: 'tabs' }];

  if (activeTab === 'surah') {
    if (errorMessage) {
      data.push({ type: 'message', key: 'error', message: errorMessage, tone: 'error' });
      return data;
    }

    if (isLoading) {
      data.push({ type: 'message', key: 'loading', message: 'Loading…', tone: 'muted' });
      return data;
    }

    data.push(
      ...surahs.map((surah) => ({ type: 'surah' as const, key: `surah:${surah.id}`, surah }))
    );
    return data;
  }

  if (activeTab === 'juz') {
    data.push(
      ...(juzData as JuzSummary[]).map((juz) => ({
        type: 'juz' as const,
        key: `juz:${juz.number}`,
        juz,
      }))
    );
    return data;
  }

  data.push(
    ...pageNumbers.map((pageNumber) => ({
      type: 'page' as const,
      key: `page:${pageNumber}`,
      pageNumber,
    }))
  );
  return data;
}

export default function ReadScreen(): React.JSX.Element {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<HomeTab>('surah');
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = React.useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = React.useState('');
  const headerSearchInputRef = React.useRef<TextInput | null>(null);
  const listRef = React.useRef<FlashListRef<HomeListItem> | null>(null);
  const introHeightRef = React.useRef(0);
  const scrollOffsetRef = React.useRef(0);
  const pendingPinnedTabRef = React.useRef<HomeTab | null>(null);
  const pendingPinnedCommitFrameRef = React.useRef<number | null>(null);
  const { chapters, isLoading, errorMessage } = useChapters();
  const { settings } = useSettings();
  const surahs = React.useMemo(() => chapters.map(mapChapterToSurah), [chapters]);
  const pageNumbers = React.useMemo(() => Array.from({ length: 604 }, (_, index) => index + 1), []);
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  const listData = React.useMemo(
    () => buildHomeListData({ activeTab, errorMessage, isLoading, pageNumbers, surahs }),
    [activeTab, errorMessage, isLoading, pageNumbers, surahs]
  );

  const closeHeaderSearch = React.useCallback(({ clearQuery }: { clearQuery: boolean }) => {
    setIsHeaderSearchOpen(false);
    if (clearQuery) setHeaderSearchQuery('');
    headerSearchInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const updateHeaderSearchQuery = React.useCallback((value: string) => {
    setHeaderSearchQuery(value);
    setIsHeaderSearchOpen(true);
  }, []);

  const navigateToSearchPage = React.useCallback(
    (queryOverride?: string) => {
      const trimmed = (queryOverride ?? headerSearchQuery).trim();
      if (!trimmed) return;
      closeHeaderSearch({ clearQuery: true });
      router.push({ pathname: '/search', params: { query: trimmed } });
    },
    [closeHeaderSearch, headerSearchQuery, router]
  );

  const navigateToSurahVerse = React.useCallback(
    async (surahId: number, verse?: number) => {
      closeHeaderSearch({ clearQuery: true });
      await preloadOfflineSurahNavigationPage({ surahId, verseNumber: verse, settings });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(surahId),
          ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
        },
      });
    },
    [closeHeaderSearch, router, settings]
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

  const handleIntroLayout = React.useCallback((height: number) => {
    introHeightRef.current = Math.max(0, height);
  }, []);

  const cancelPendingPinnedCommitFrame = React.useCallback(() => {
    if (pendingPinnedCommitFrameRef.current !== null) {
      cancelAnimationFrame(pendingPinnedCommitFrameRef.current);
      pendingPinnedCommitFrameRef.current = null;
    }
  }, []);

  const commitPendingPinnedTab = React.useCallback(() => {
    const pendingTab = pendingPinnedTabRef.current;
    if (pendingTab === null) return;

    pendingPinnedTabRef.current = null;
    setActiveTab((currentTab) => (currentTab === pendingTab ? currentTab : pendingTab));
  }, []);

  const schedulePendingPinnedCommit = React.useCallback(() => {
    cancelPendingPinnedCommitFrame();

    pendingPinnedCommitFrameRef.current = requestAnimationFrame(() => {
      pendingPinnedCommitFrameRef.current = requestAnimationFrame(() => {
        pendingPinnedCommitFrameRef.current = null;
        commitPendingPinnedTab();
      });
    });
  }, [cancelPendingPinnedCommitFrame, commitPendingPinnedTab]);

  React.useEffect(() => cancelPendingPinnedCommitFrame, [cancelPendingPinnedCommitFrame]);

  const handleListScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextOffset = event.nativeEvent.contentOffset.y;
      scrollOffsetRef.current = nextOffset;

      if (
        pendingPinnedTabRef.current !== null &&
        nextOffset <= introHeightRef.current + PINNED_TAB_OFFSET_TOLERANCE
      ) {
        cancelPendingPinnedCommitFrame();
        commitPendingPinnedTab();
      }
    },
    [cancelPendingPinnedCommitFrame, commitPendingPinnedTab]
  );

  const handleTabChange = React.useCallback(
    (tab: HomeTab) => {
      cancelPendingPinnedCommitFrame();
      pendingPinnedTabRef.current = null;

      if (tab === activeTab) return;

      const pinnedOffset = introHeightRef.current;
      const isPastIntro =
        pinnedOffset > 0 && scrollOffsetRef.current >= pinnedOffset - PINNED_TAB_OFFSET_TOLERANCE;

      if (isPastIntro) {
        pendingPinnedTabRef.current = tab;
        listRef.current?.scrollToOffset({ offset: pinnedOffset, animated: false });
        schedulePendingPinnedCommit();
        return;
      }

      setActiveTab(tab);
    },
    [activeTab, cancelPendingPinnedCommitFrame, schedulePendingPinnedCommit]
  );

  const listHeader = React.useMemo(
    () => <HomeIntro onLayout={handleIntroLayout} />,
    [handleIntroLayout]
  );

  const renderItem = React.useCallback(
    ({ item, target }: ListRenderItemInfo<HomeListItem>) => {
      if (item.type === 'tabs') {
        return (
          <HomeTabsBar
            activeTab={activeTab}
            containerWidth={width}
            isSticky={target === 'StickyHeader'}
            onTabChange={handleTabChange}
          />
        );
      }

      if (item.type === 'message') {
        return <HomeListMessage message={item.message} tone={item.tone} />;
      }

      if (item.type === 'surah') {
        return (
          <View style={{ flex: 1, marginBottom: 12, paddingHorizontal: 6 }}>
            <SurahCard surah={item.surah} />
          </View>
        );
      }

      if (item.type === 'juz') {
        return (
          <View style={{ flex: 1, marginBottom: 12, paddingHorizontal: 6 }}>
            <JuzCard juz={item.juz} />
          </View>
        );
      }

      return (
        <View style={{ flex: 1, marginBottom: 12, paddingHorizontal: 6 }}>
          <PageCard pageNumber={item.pageNumber} />
        </View>
      );
    },
    [activeTab, handleTabChange, width]
  );

  const overrideItemLayout = React.useCallback(
    (layout: { span?: number }, item: HomeListItem, _index: number, maxColumns: number) => {
      if (item.type === 'tabs' || item.type === 'message') {
        layout.span = maxColumns;
      }
    },
    []
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          header: () => (
            <HomeSearchHeader
              headerSearchInputRef={headerSearchInputRef}
              headerSearchQuery={headerSearchQuery}
              onQueryChange={updateHeaderSearchQuery}
              onFocus={() => setIsHeaderSearchOpen(true)}
              onSubmit={() => navigateToSearchPage()}
            />
          ),
        }}
      />

      <View className="flex-1">
        <FlashList
          ref={listRef}
          key={`home:${numColumns}`}
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          numColumns={numColumns}
          stickyHeaderIndices={STICKY_HEADER_INDICES}
          ListHeaderComponent={listHeader}
          onScroll={handleListScroll}
          scrollEventThrottle={32}
          drawDistance={Platform.OS === 'android' ? 900 : 650}
          overrideProps={{ initialDrawBatchSize: 12 }}
          getItemType={(item) => item.type}
          overrideItemLayout={overrideItemLayout}
          maintainVisibleContentPosition={{ disabled: true }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: 24,
            paddingHorizontal: LIST_HORIZONTAL_PADDING,
          }}
          extraData={activeTab}
          style={{ flex: 1 }}
        />
      </View>

      <ComprehensiveSearchDropdown
        isOpen={isHeaderSearchOpen}
        query={headerSearchQuery}
        onQueryChange={updateHeaderSearchQuery}
        onClose={() => closeHeaderSearch({ clearQuery: false })}
        onNavigateToSurahVerse={navigateToSurahVerse}
        onNavigateToJuz={navigateToJuz}
        onNavigateToPage={navigateToPage}
        onNavigateToSearch={navigateToSearchPage}
      />
    </View>
  );
}
