import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  Platform, Linking, Modal, Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Moon, Sun } from 'lucide-react-native';

import { HomeRecentCard } from '@/components/home/HomeRecentCard';
import { HomeQuickLinksCard } from '@/components/home/HomeQuickLinksCard';
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';
import { HomeTabToggle, type HomeTab } from '@/components/home/HomeTabToggle';
import { HomeVersePlaceholder } from '@/components/home/HomeVersePlaceholder';
import { JuzCard, type JuzSummary } from '@/components/home/JuzCard';
import { PageCard } from '@/components/home/PageCard';
import { SurahCard } from '@/components/home/SurahCard';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderActionButton, HeaderSearchBar } from '@/components/search/HeaderSearchBar';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useChapters } from '@/hooks/useChapters';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import juzData from '../../src/data/juz.json';

import type { Chapter } from '@/types';

const LIST_HORIZONTAL_PADDING = 0;
const TABS_BAR_HORIZONTAL_PADDING = 12;
const HOME_SCROLLBAR_Z_INDEX = 101;
const HOME_TABS_BAR_ESTIMATED_HEIGHT = 64;
const HOME_INTRO_ESTIMATED_HEIGHT = 476;
const HOME_NAV_CARD_HEIGHT = 72;
const HOME_GRID_ROW_BOTTOM_GAP = 10;
const HOME_GRID_ROW_HEIGHT = HOME_NAV_CARD_HEIGHT + HOME_GRID_ROW_BOTTOM_GAP;
const HOME_MESSAGE_ROW_HEIGHT = 52;
const HOME_CONTENT_BOTTOM_PADDING = 24;
const HOME_SCROLLBAR_WIDTH = 26;
const HOME_SCROLLBAR_VISIBLE_WIDTH = 5;
const HOME_SCROLLBAR_MIN_THUMB_HEIGHT = 48;
const HOME_SCROLLBAR_HIDE_DELAY_MS = 650;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
  | { type: 'surah'; key: string; surah: Surah }
  | { type: 'juz'; key: string; juz: JuzSummary }
  | { type: 'page'; key: string; pageNumber: number };

type HomeListRow =
  | { type: 'intro'; key: 'intro' }
  | { type: 'tabs'; key: 'tabs' }
  | { type: 'message'; key: 'loading' | 'error'; message: string; tone: 'muted' | 'error' }
  | { type: 'grid-row'; key: string; items: HomeListItem[] };

type HomeRowLayout = {
  index: number;
  length: number;
  offset: number;
};

function chunkData<T>(data: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  return chunks;
}

function getHomeRowHeight(
  row: HomeListRow,
  homeIntroHeight: number,
  tabsBarHeight: number
): number {
  if (row.type === 'intro') return homeIntroHeight;
  if (row.type === 'tabs') return tabsBarHeight;
  if (row.type === 'message') return HOME_MESSAGE_ROW_HEIGHT;
  return HOME_GRID_ROW_HEIGHT;
}

function buildHomeRowLayouts(
  rows: HomeListRow[],
  homeIntroHeight: number,
  tabsBarHeight: number
): HomeRowLayout[] {
  let offset = 0;

  return rows.map((row, index) => {
    const length = getHomeRowHeight(row, homeIntroHeight, tabsBarHeight);
    const layout = { index, length, offset };
    offset += length;
    return layout;
  });
}

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
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const slideAnim = React.useRef(new Animated.Value(-300)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const { isDark, setDarkModeEnabled } = useAppTheme();

  const openMenu = () => {
    setIsMenuOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeMenu = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => setIsMenuOpen(false));
  };

  return (
    <HeaderSearchBar
      left={
        <View>
          <HeaderActionButton accessibilityLabel="Open menu" onPress={openMenu}>
          <Menu size={24} color={isDark ? '#E5E5E5' : '#2F3744'} />
          </HeaderActionButton>

          <Modal transparent visible={isMenuOpen} onRequestClose={closeMenu}>
            <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }}>
              <Pressable style={{ flex: 1, position: 'absolute', width: '100%', height: '100%' }} onPress={closeMenu} />
              <Animated.View
                style={{
                  width: 280,
                  height: '100%',
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  transform: [{ translateX: slideAnim }],
                  paddingTop: insets.top,
                }}
              >
                <View className="px-5 py-6 border-b border-border dark:border-border-dark">
                  <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">Quran</Text>
                </View>
                <Pressable
                  onPress={() => {
                    closeMenu();
                    Linking.openURL('https://appquran.com').catch(() => {});
                  }}
                  className="px-5 py-4 active:bg-interactive dark:active:bg-interactive-dark"
                >
                  <Text className="text-base font-semibold text-content-primary dark:text-content-primary-dark">appquran.com</Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          </Modal>
        </View>
      }
      search={
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
      }
      right={
        <HeaderActionButton
          accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onPress={() => setDarkModeEnabled(!isDark)}
        >
          {isDark ? <Sun size={24} color="#E5E5E5" /> : <Moon size={24} color="#2F3744" />}
        </HeaderActionButton>
      }
    />
  );
}

function HomeIntro({
  onHeightChange,
}: {
  onHeightChange?: (height: number) => void;
}): React.JSX.Element {
  return (
    <View
      className="pt-3 pb-4"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <View className="px-3">
        <HomeVersePlaceholder />
      </View>
      <View className="mt-4 px-3">
        <HomeShortcutGrid />
      </View>
      <View className="mt-3">
        <HomeRecentCard />
      </View>
      <View className="mt-3">
        <HomeQuickLinksCard />
      </View>
    </View>
  );
}

function HomeTabsBar({
  activeTab,
  containerWidth,
  onHeightChange,
  onTabChange,
}: {
  activeTab: HomeTab;
  containerWidth: number;
  onHeightChange?: (height: number) => void;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  const tabsBarWidth = Math.max(0, containerWidth - LIST_HORIZONTAL_PADDING * 2);
  const toggleWidth = Math.max(0, tabsBarWidth - TABS_BAR_HORIZONTAL_PADDING * 2);

  return (
    <View
      collapsable={false}
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      className="bg-background dark:bg-background-dark"
    >
      <View
        className="px-3 pb-3 pt-1"
        style={{ width: tabsBarWidth, alignSelf: 'center' }}
      >
        <HomeTabToggle
          activeTab={activeTab}
          width={toggleWidth}
          onTabChange={onTabChange}
        />
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

function HomeScrollBar({
  contentHeight,
  getCurrentScrollOffset,
  onScrollToOffset,
  scrollY,
  topInset,
  viewportHeight,
}: {
  contentHeight: number;
  getCurrentScrollOffset: () => number;
  onScrollToOffset: (offset: number) => void;
  scrollY: Animated.Value;
  topInset: number;
  viewportHeight: number;
}): React.JSX.Element | null {
  const { isDark } = useAppTheme();
  const trackHeight = Math.max(0, viewportHeight - topInset - 8);
  const maxScrollOffset = Math.max(0, contentHeight - viewportHeight);
  const isScrollable = maxScrollOffset > 1 && trackHeight > HOME_SCROLLBAR_MIN_THUMB_HEIGHT;
  const thumbHeight = isScrollable
    ? clampNumber(
        (viewportHeight / contentHeight) * trackHeight,
        HOME_SCROLLBAR_MIN_THUMB_HEIGHT,
        trackHeight
      )
    : 0;
  const maxThumbOffset = Math.max(0, trackHeight - thumbHeight);
  const dragStartOffsetRef = React.useRef(0);
  const dragStartYRef = React.useRef(0);
  const pendingScrollOffsetRef = React.useRef<number | null>(null);
  const scrollFrameRef = React.useRef<number | null>(null);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;

  const thumbTranslateY = React.useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, Math.max(maxScrollOffset, 1)],
        outputRange: [0, Math.max(maxThumbOffset, 1)],
        extrapolate: 'clamp',
      }),
    [maxScrollOffset, maxThumbOffset, scrollY]
  );

  const flushPendingScrollOffset = React.useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }

    const pendingOffset = pendingScrollOffsetRef.current;
    pendingScrollOffsetRef.current = null;
    if (pendingOffset !== null) {
      onScrollToOffset(pendingOffset);
    }
  }, [onScrollToOffset]);

  const clearHideTimer = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const fadeScrollBarOut = React.useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const showScrollBar = React.useCallback(() => {
    clearHideTimer();
    Animated.timing(opacity, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();

    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      fadeScrollBarOut();
    }, HOME_SCROLLBAR_HIDE_DELAY_MS);
  }, [clearHideTimer, fadeScrollBarOut, opacity]);

  const scheduleScrollToOffset = React.useCallback(
    (offset: number) => {
      pendingScrollOffsetRef.current = offset;
      if (scrollFrameRef.current !== null) return;

      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const pendingOffset = pendingScrollOffsetRef.current;
        pendingScrollOffsetRef.current = null;
        if (pendingOffset !== null) {
          onScrollToOffset(pendingOffset);
        }
      });
    },
    [onScrollToOffset]
  );

  const scrollToDragPageY = React.useCallback(
    (pageY: number) => {
      const dragDeltaY = pageY - dragStartYRef.current;
      const scrollDelta = (dragDeltaY / Math.max(maxThumbOffset, 1)) * maxScrollOffset;
      scheduleScrollToOffset(
        clampNumber(dragStartOffsetRef.current + scrollDelta, 0, maxScrollOffset)
      );
    },
    [maxScrollOffset, maxThumbOffset, scheduleScrollToOffset]
  );

  React.useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      clearHideTimer();
    },
    [clearHideTimer]
  );

  React.useEffect(() => {
    if (!isScrollable) {
      opacity.setValue(0);
      return undefined;
    }

    const listenerId = scrollY.addListener(() => {
      showScrollBar();
    });

    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [isScrollable, opacity, scrollY, showScrollBar]);

  const hideScrollBarSoon = React.useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      fadeScrollBarOut();
    }, HOME_SCROLLBAR_HIDE_DELAY_MS);
  }, [clearHideTimer, fadeScrollBarOut]);

  const finishDrag = React.useCallback(() => {
    flushPendingScrollOffset();
    hideScrollBarSoon();
  }, [flushPendingScrollOffset, hideScrollBarSoon]);

  const handleResponderGrant = React.useCallback(
    (event: GestureResponderEvent) => {
      showScrollBar();
      dragStartOffsetRef.current = clampNumber(getCurrentScrollOffset(), 0, maxScrollOffset);
      dragStartYRef.current = event.nativeEvent.pageY;
    },
    [getCurrentScrollOffset, maxScrollOffset, showScrollBar]
  );

  const handleResponderMove = React.useCallback(
    (event: GestureResponderEvent) => {
      showScrollBar();
      scrollToDragPageY(event.nativeEvent.pageY);
    },
    [scrollToDragPageY, showScrollBar]
  );

  if (!isScrollable) return null;

  const thumbColor = isDark ? 'rgba(226, 232, 240, 0.62)' : 'rgba(47, 55, 68, 0.48)';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: topInset,
        right: 0,
        bottom: 8,
        width: HOME_SCROLLBAR_WIDTH,
        opacity,
        zIndex: HOME_SCROLLBAR_Z_INDEX,
        ...(Platform.OS === 'android'
          ? { elevation: HOME_SCROLLBAR_Z_INDEX, shadowColor: 'transparent' }
          : {}),
      }}
    >
      <Animated.View
        onStartShouldSetResponder={() => isScrollable}
        onMoveShouldSetResponder={() => isScrollable}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={finishDrag}
        onResponderTerminate={finishDrag}
        onResponderTerminationRequest={() => false}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: HOME_SCROLLBAR_WIDTH,
          height: thumbHeight,
          transform: [{ translateY: thumbTranslateY }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 8,
            bottom: 0,
            width: HOME_SCROLLBAR_VISIBLE_WIDTH,
            borderRadius: 999,
            backgroundColor: thumbColor,
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

function buildHomeListData({
  activeTab,
  errorMessage,
  isLoading,
  pageNumbers,
  surahs,
  numColumns,
}: {
  activeTab: HomeTab;
  errorMessage: string | null;
  isLoading: boolean;
  pageNumbers: number[];
  surahs: Surah[];
  numColumns: number;
}): HomeListRow[] {
  const rows: HomeListRow[] = [
    { type: 'intro', key: 'intro' },
    { type: 'tabs', key: 'tabs' },
  ];

  if (activeTab === 'surah') {
    if (errorMessage) {
      rows.push({ type: 'message', key: 'error', message: errorMessage, tone: 'error' });
      return rows;
    }

    if (isLoading) {
      rows.push({ type: 'message', key: 'loading', message: 'Loading…', tone: 'muted' });
      return rows;
    }

    const items = surahs.map((surah) => ({ type: 'surah' as const, key: `surah:${surah.id}`, surah }));
    chunkData(items, numColumns).forEach((chunk, index) => {
      rows.push({ type: 'grid-row', key: `surah-row:${index}`, items: chunk });
    });
    return rows;
  }

  if (activeTab === 'juz') {
    const items = (juzData as JuzSummary[]).map((juz) => ({
      type: 'juz' as const,
      key: `juz:${juz.number}`,
      juz,
    }));
    chunkData(items, numColumns).forEach((chunk, index) => {
      rows.push({ type: 'grid-row', key: `juz-row:${index}`, items: chunk });
    });
    return rows;
  }

  const items = pageNumbers.map((pageNumber) => ({
    type: 'page' as const,
    key: `page:${pageNumber}`,
    pageNumber,
  }));
  chunkData(items, numColumns).forEach((chunk, index) => {
    rows.push({ type: 'grid-row', key: `page-row:${index}`, items: chunk });
  });
  return rows;
}

export default function ReadScreen(): React.JSX.Element {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<HomeTab>('surah');
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = React.useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = React.useState('');
  const headerSearchInputRef = React.useRef<TextInput | null>(null);
  const listRef = React.useRef<FlatList<HomeListRow> | null>(null);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const homeIntroHeightRef = React.useRef(0);
  const listScrollOffsetRef = React.useRef(0);
  const [homeIntroHeight, setHomeIntroHeight] = React.useState(0);
  const [tabsBarHeight, setTabsBarHeight] = React.useState(HOME_TABS_BAR_ESTIMATED_HEIGHT);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const { chapters, isLoading, errorMessage } = useChapters();
  const { settings } = useSettings();
  const surahs = React.useMemo(() => chapters.map(mapChapterToSurah), [chapters]);
  const pageNumbers = React.useMemo(() => Array.from({ length: 604 }, (_, index) => index + 1), []);
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  const listData = React.useMemo(
    () => buildHomeListData({ activeTab, errorMessage, isLoading, pageNumbers, surahs, numColumns }),
    [activeTab, errorMessage, isLoading, pageNumbers, surahs, numColumns]
  );
  const effectiveHomeIntroHeight =
    homeIntroHeight > 0 ? homeIntroHeight : HOME_INTRO_ESTIMATED_HEIGHT;
  const rowLayouts = React.useMemo(
    () => buildHomeRowLayouts(listData, effectiveHomeIntroHeight, tabsBarHeight),
    [effectiveHomeIntroHeight, listData, tabsBarHeight]
  );
  const listContentHeight = React.useMemo(() => {
    const lastLayout = rowLayouts[rowLayouts.length - 1];
    const rowsHeight = lastLayout ? lastLayout.offset + lastLayout.length : 0;
    return rowsHeight + HOME_CONTENT_BOTTOM_PADDING;
  }, [rowLayouts]);
  const getHomeItemLayout = React.useCallback(
    (_data: ArrayLike<HomeListRow> | null | undefined, index: number) => {
      return rowLayouts[index] ?? { index, length: HOME_GRID_ROW_HEIGHT, offset: 0 };
    },
    [rowLayouts]
  );
  const listExtraData = React.useMemo(
    () => ({ activeTab, homeIntroHeight: effectiveHomeIntroHeight, numColumns, tabsBarHeight }),
    [activeTab, effectiveHomeIntroHeight, numColumns, tabsBarHeight]
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

  const handleTabChange = React.useCallback(
    (tab: HomeTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
    },
    [activeTab]
  );

  const handleHomeIntroHeightChange = React.useCallback((height: number) => {
    if (Math.abs(homeIntroHeightRef.current - height) < 1) return;

    homeIntroHeightRef.current = height;
    setHomeIntroHeight(height);
  }, []);

  const handleTabsBarHeightChange = React.useCallback((height: number) => {
    setTabsBarHeight((currentHeight) =>
      Math.abs(currentHeight - height) < 1 ? currentHeight : height
    );
  }, []);

  const handleListScroll = React.useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offset = event.nativeEvent.contentOffset.y;
    listScrollOffsetRef.current = offset;
  }, []);

  const handleAnimatedListScroll = React.useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        listener: handleListScroll,
        useNativeDriver: true,
      }),
    [handleListScroll, scrollY]
  );

  const handleListLayout = React.useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const height = event.nativeEvent.layout.height;
    setListViewportHeight((currentHeight) =>
      Math.abs(currentHeight - height) < 1 ? currentHeight : height
    );
  }, []);

  const scrollToHomeOffset = React.useCallback((offset: number) => {
    const maxOffset = Math.max(0, listContentHeight - listViewportHeight);
    const nextOffset = clampNumber(offset, 0, maxOffset);
    listScrollOffsetRef.current = nextOffset;
    scrollY.setValue(nextOffset);
    listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
  }, [listContentHeight, listViewportHeight, scrollY]);

  const getCurrentScrollOffset = React.useCallback(() => listScrollOffsetRef.current, []);

  React.useEffect(() => {
    if (listViewportHeight <= 0) return;

    const maxOffset = Math.max(0, listContentHeight - listViewportHeight);
    if (listScrollOffsetRef.current <= maxOffset) return;

    scrollToHomeOffset(maxOffset);
  }, [listContentHeight, listViewportHeight, scrollToHomeOffset]);

  const renderItem = React.useCallback(
    ({ item }: { item: HomeListRow }) => {
      if (item.type === 'intro') {
        return <HomeIntro onHeightChange={handleHomeIntroHeightChange} />;
      }

      if (item.type === 'tabs') {
        return (
          <HomeTabsBar
            activeTab={activeTab}
            containerWidth={width}
            onHeightChange={handleTabsBarHeightChange}
            onTabChange={handleTabChange}
          />
        );
      }

      if (item.type === 'message') {
        return (
          <View style={{ height: HOME_MESSAGE_ROW_HEIGHT }}>
            <HomeListMessage message={item.message} tone={item.tone} />
          </View>
        );
      }

      if (item.type === 'grid-row') {
        return (
          <View style={{ flexDirection: 'row', width: '100%', height: HOME_GRID_ROW_HEIGHT }}>
            {item.items.map((gridItem) => {
              const flex = 1 / numColumns;
              
              if (gridItem.type === 'surah') {
                return (
                  <View key={gridItem.key} style={{ flex, height: HOME_NAV_CARD_HEIGHT, paddingHorizontal: 12 }}>
                    <SurahCard surah={gridItem.surah} />
                  </View>
                );
              }

              if (gridItem.type === 'juz') {
                return (
                  <View key={gridItem.key} style={{ flex, height: HOME_NAV_CARD_HEIGHT, paddingHorizontal: 12 }}>
                    <JuzCard juz={gridItem.juz} />
                  </View>
                );
              }

              return (
                <View key={gridItem.key} style={{ flex, height: HOME_NAV_CARD_HEIGHT, paddingHorizontal: 12 }}>
                  <PageCard pageNumber={gridItem.pageNumber} />
                </View>
              );
            })}
            {Array.from({ length: numColumns - item.items.length }).map((_, idx) => (
              <View key={`empty-${idx}`} style={{ flex: 1 / numColumns, paddingHorizontal: 12 }} />
            ))}
          </View>
        );
      }
      
      return null;
    },
    [
      activeTab,
      handleHomeIntroHeightChange,
      handleTabChange,
      handleTabsBarHeightChange,
      numColumns,
      width,
    ]
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
        <Animated.FlatList
          ref={listRef}
          key={`home-flatlist`}
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          getItemLayout={getHomeItemLayout}
          removeClippedSubviews={Platform.OS === 'android'}
          onLayout={handleListLayout}
          onScroll={handleAnimatedListScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={32}
          windowSize={Platform.OS === 'android' ? 11 : 7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: HOME_CONTENT_BOTTOM_PADDING,
            paddingHorizontal: LIST_HORIZONTAL_PADDING,
          }}
          extraData={listExtraData}
          style={{ flex: 1 }}
        />
        <HomeScrollBar
          contentHeight={listContentHeight}
          getCurrentScrollOffset={getCurrentScrollOffset}
          onScrollToOffset={scrollToHomeOffset}
          scrollY={scrollY}
          topInset={8}
          viewportHeight={listViewportHeight}
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
