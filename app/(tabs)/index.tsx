import { Stack, router } from 'expo-router';
import { useScrollToTop } from "expo-router/react-navigation";
import React from 'react';
import {
  Animated,
  FlatList,
  Platform, Linking, Modal, Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, ExternalLink, Globe2, Menu, Moon, Settings, ShieldCheck, Sun } from 'lucide-react-native';

import { HomeRecentCard } from '@/components/home/HomeRecentCard';
import { HomeQuickLinksCard } from '@/components/home/HomeQuickLinksCard';
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';
import { HomeTabToggle, type HomeTab } from '@/components/home/HomeTabToggle';
import { HomeVerseSpotlight } from '@/components/home/HomeVerseSpotlight';
import { JuzCard, type JuzSummary } from '@/components/home/JuzCard';
import { PageCard } from '@/components/home/PageCard';
import { SurahCard } from '@/components/home/SurahCard';
import { AppSearchHeader } from '@/components/navigation/AppHeader';
import { useHeaderSearch } from '@/components/navigation/useHeaderSearch';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useDownloadedResourceSize } from '@/hooks/useDownloadedResourceSize';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { IndexScrubber, type IndexScrubberHandle } from '@/components/reader/IndexScrubber';
import { sideSheetTransform, useModalTransition } from '@/components/motion/modalTransition';
import juzData from '../../src/data/juz.json';

import type { Chapter } from '@/types';

const LIST_HORIZONTAL_PADDING = 0;
const TABS_BAR_HORIZONTAL_PADDING = 12;
const HOME_TABS_BAR_ESTIMATED_HEIGHT = 64;
const HOME_INTRO_ESTIMATED_HEIGHT = 496;
const HOME_NAV_CARD_HEIGHT = 72;
const HOME_GRID_ROW_BOTTOM_GAP = 10;
const HOME_GRID_ROW_HEIGHT = HOME_NAV_CARD_HEIGHT + HOME_GRID_ROW_BOTTOM_GAP;
const HOME_MESSAGE_ROW_HEIGHT = 52;
const HOME_CONTENT_BOTTOM_PADDING = 24;

type MenuRowProps = {
  children?: React.ReactNode;
  icon: React.ReactNode;
  onPress: () => void;
  subtitle?: string;
  title: string;
};

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
  onLayout,
}: {
  headerSearchInputRef: React.RefObject<TextInput | null>;
  headerSearchQuery: string;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onSubmit: () => void;
  onLayout?: (event: any) => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { width } = useWindowDimensions();
  const menuWidth = Math.min(280, Math.round(width * 0.8));
  const hiddenTranslateX = -menuWidth;

  const { visible, progress, onModalShow } = useModalTransition(isMenuOpen, {
    openDuration: 380,
    closeDuration: 300,
  });

  const { isDark, setDarkModeEnabled } = useAppTheme();
  const { t } = useUiTranslation();
  const { items: downloadItems, isLoading: isDownloadIndexLoading } = useDownloadIndexItems({
    enabled: isMenuOpen,
  });
  const { label: downloadedResourceSizeLabel } = useDownloadedResourceSize(downloadItems);

  const openMenu = () => setIsMenuOpen(true);
  const closeMenu = () => setIsMenuOpen(false);

  const renderMenuRow = ({ children, icon, onPress, subtitle, title }: MenuRowProps) => (
    <Pressable
      onPress={onPress}
      className="px-5 py-3 active:bg-interactive dark:active:bg-interactive-dark flex-row items-center gap-3"
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-interactive dark:bg-interactive-dark">
        {icon}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-semibold text-content-primary dark:text-content-primary-dark">
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs text-content-secondary dark:text-content-secondary-dark"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </Pressable>
  );

  return (
    <AppSearchHeader
      onLayout={onLayout}
      style={{ zIndex: 50, elevation: 0 }}
      left={
        <View>
          <HeaderActionButton accessibilityLabel="Open menu" onPress={openMenu}>
            <Menu size={24} color={isDark ? '#E5E5E5' : '#2F3744'} />
          </HeaderActionButton>

          <Modal
            transparent
            visible={visible}
            onShow={onModalShow}
            onRequestClose={closeMenu}
            animationType="none"
            statusBarTranslucent
            {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
          >
            <View style={styles.menuRoot}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
                <Animated.View
                  style={[
                    styles.menuOverlay,
                    {
                      opacity: progress,
                    },
                  ]}
                />
              </Pressable>

              <Animated.View
                style={[
                  styles.menuSheet,
                  {
                    width: menuWidth,
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    paddingTop: insets.top,
                  },
                  sideSheetTransform(progress, hiddenTranslateX),
                ]}
                className="border-r border-border/30 dark:border-border-dark/20"
              >
                <View className="px-5 py-6 border-b border-border dark:border-border-dark">
                  <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">{t('title')}</Text>
                </View>
                <View className="flex-1">
                  {renderMenuRow({
                    icon: (
                      <Settings
                        size={20}
                        color={Colors[isDark ? 'dark' : 'light'].tint}
                        strokeWidth={2}
                      />
                    ),
                    onPress: () => {
                      closeMenu();
                      router.push('/settings');
                    },
                    title: t('settings', { fallback: 'Settings' }),
                  })}
                  {renderMenuRow({
                    icon: (
                      <Download size={20} color={Colors[isDark ? 'dark' : 'light'].tint} strokeWidth={2} />
                    ),
                    onPress: () => {
                      closeMenu();
                      router.push('/downloads');
                    },
                    title: t('downloads', { fallback: 'Downloads' }),
                    children:
                      downloadedResourceSizeLabel && !isDownloadIndexLoading ? (
                        <View
                          className="rounded-full border border-border/20 bg-interactive px-2.5 py-0.5 dark:border-border-dark/10 dark:bg-surface-navigation-dark"
                          style={{ flexShrink: 0 }}
                        >
                          <Text className="text-[10px] font-bold text-content-secondary dark:text-content-secondary-dark">
                            {downloadedResourceSizeLabel}
                          </Text>
                        </View>
                      ) : null,
                  })}
                  {renderMenuRow({
                    icon: (
                      <ShieldCheck
                        size={20}
                        color={Colors[isDark ? 'dark' : 'light'].tint}
                        strokeWidth={2}
                      />
                    ),
                    onPress: () => {
                      closeMenu();
                      router.push('/privacy');
                    },
                    title: t('home_footer_privacy_policy', { fallback: 'Privacy Policy' }),
                  })}
                  {renderMenuRow({
                    children: (
                      <ExternalLink
                        size={16}
                        color={isDark ? '#94A3B8' : '#6B7280'}
                        strokeWidth={2}
                      />
                    ),
                    icon: (
                      <Globe2 size={20} color={Colors[isDark ? 'dark' : 'light'].tint} strokeWidth={2} />
                    ),
                    onPress: () => {
                      closeMenu();
                      Linking.openURL('https://appquran.com').catch(() => {});
                    },
                    title: 'appquran.com',
                  })}
                </View>
              </Animated.View>
            </View>
          </Modal>
        </View>
      }
      inputRef={headerSearchInputRef}
      value={headerSearchQuery}
      onChangeText={onQueryChange}
      placeholder={t('search_placeholder_header')}
      onFocus={onFocus}
      onSubmitEditing={onSubmit}
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
      className="pb-4"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <View className="px-3">
        <HomeVerseSpotlight />
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
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const tabsBarWidth = Math.max(0, containerWidth - LIST_HORIZONTAL_PADDING * 2);
  const toggleWidth = Math.max(0, tabsBarWidth - TABS_BAR_HORIZONTAL_PADDING * 2);

  return (
    <View
      collapsable={false}
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={{ backgroundColor: palette.background }}
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



function buildHomeListData({
  activeTab,
  errorMessage,
  isLoading,
  pageNumbers,
  surahs,
  numColumns,
  loadingLabel,
}: {
  activeTab: HomeTab;
  errorMessage: string | null;
  isLoading: boolean;
  pageNumbers: number[];
  surahs: Surah[];
  numColumns: number;
  loadingLabel: string;
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
      rows.push({ type: 'message', key: 'loading', message: loadingLabel, tone: 'muted' });
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
  const [activeTab, setActiveTab] = React.useState<HomeTab>('surah');
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { t } = useUiTranslation();
  const [searchHeaderHeight, setSearchHeaderHeight] = React.useState(0);
  const headerSearch = useHeaderSearch();
  const listRef = React.useRef<FlatList<HomeListRow> | null>(null);
  useScrollToTop(listRef);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const homeIntroHeightRef = React.useRef(0);
  const listScrollOffsetRef = React.useRef(0);
  const [homeIntroHeight, setHomeIntroHeight] = React.useState(0);
  const [tabsBarHeight, setTabsBarHeight] = React.useState(HOME_TABS_BAR_ESTIMATED_HEIGHT);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const { chapters, isLoading, errorMessage } = useChapters();
  const surahs = React.useMemo(() => chapters.map(mapChapterToSurah), [chapters]);
  const pageNumbers = React.useMemo(() => Array.from({ length: 604 }, (_, index) => index + 1), []);
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  const insets = useSafeAreaInsets();
  const scrubberRef = React.useRef<IndexScrubberHandle | null>(null);
  const [currentScrubIndex, setCurrentScrubIndex] = React.useState(1);
  const isScrubbingRef = React.useRef(false);
  const lastScrubScrollIndexRef = React.useRef<number | null>(null);

  const listData = React.useMemo(
    () =>
      buildHomeListData({
        activeTab,
        errorMessage,
        isLoading,
        pageNumbers,
        surahs,
        numColumns,
        loadingLabel: t('loading'),
      }),
    [activeTab, errorMessage, isLoading, pageNumbers, surahs, numColumns, t]
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

  const handleTabChange = React.useCallback(
    (tab: HomeTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      setCurrentScrubIndex(1);
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

  const handleScrubStateChange = React.useCallback((isScrubbing: boolean) => {
    isScrubbingRef.current = isScrubbing;
    if (!isScrubbing) {
      lastScrubScrollIndexRef.current = null;
    }
  }, []);

  const updateCurrentIndexFromScroll = React.useCallback(
    (offset: number) => {
      if (isScrubbingRef.current) return;

      const gridStartOffset = effectiveHomeIntroHeight + tabsBarHeight;
      if (offset < gridStartOffset) {
        setCurrentScrubIndex((prev) => (prev === 1 ? prev : 1));
        return;
      }

      const row = rowLayouts.find((r) => r.offset + r.length > offset);
      if (row && row.index >= 2) {
        const gridRowIdx = row.index - 2;
        const firstItemIdx = gridRowIdx * numColumns + 1;

        let maxItems = 604;
        if (activeTab === 'surah') maxItems = surahs.length;
        else if (activeTab === 'juz') maxItems = 30;

        const clampedIndex = clampNumber(firstItemIdx, 1, maxItems);
        setCurrentScrubIndex((prev) => (prev === clampedIndex ? prev : clampedIndex));
      }
    },
    [effectiveHomeIntroHeight, tabsBarHeight, rowLayouts, numColumns, activeTab, surahs.length]
  );

  const handleListScroll = React.useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offset = event.nativeEvent.contentOffset.y;
      listScrollOffsetRef.current = offset;
      updateCurrentIndexFromScroll(offset);
      scrubberRef.current?.show();
    },
    [updateCurrentIndexFromScroll]
  );

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

  const handleScrubToIndex = React.useCallback(
    (index: number, options?: { isFinal?: boolean }) => {
      const isFinal = Boolean(options?.isFinal);
      const itemIndex = index - 1;
      const rowIdx = Math.floor(itemIndex / numColumns);
      const flatListRowIdx = 2 + rowIdx;

      if (!isFinal && lastScrubScrollIndexRef.current === index) {
        return;
      }
      lastScrubScrollIndexRef.current = index;

      const layout = rowLayouts[flatListRowIdx];
      if (layout) {
        listScrollOffsetRef.current = layout.offset;
        scrollY.setValue(layout.offset);
        listRef.current?.scrollToOffset({ offset: layout.offset, animated: false });
        if (isFinal) {
          setCurrentScrubIndex(index);
        }
      }
    },
    [numColumns, rowLayouts, scrollY]
  );

  const formatScrubberLabel = React.useCallback(
    (index: number) => {
      if (activeTab === 'surah') {
        const surah = surahs[index - 1];
        return surah
          ? t(`surah_names.${surah.id}`, { fallback: surah.name })
          : `${t('surah_tab')} ${index}`;
      }
      if (activeTab === 'juz') {
        return t('juz_number', { number: index });
      }
      return t('page_number_label', { number: index });
    },
    [activeTab, surahs, t]
  );

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
    <View className="flex-1" style={{ backgroundColor: palette.background }}>
      <HomeSearchHeader
        headerSearchInputRef={headerSearch.inputRef}
        headerSearchQuery={headerSearch.query}
        onQueryChange={headerSearch.updateQuery}
        onFocus={() => headerSearch.setIsOpen(true)}
        onSubmit={() => headerSearch.navigateToSearch()}
        onLayout={(event) => {
          setSearchHeaderHeight(event.nativeEvent.layout.height);
        }}
      />

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
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
        <IndexScrubber
          ref={scrubberRef}
          bottomInset={8}
          topInset={0}
          currentIndex={currentScrubIndex}
          itemCount={
            activeTab === 'surah'
              ? surahs.length
              : activeTab === 'juz'
              ? 30
              : 604
          }
          formatLabel={formatScrubberLabel}
          onScrubStateChange={handleScrubStateChange}
          onScrubToIndex={handleScrubToIndex}
        />
      </View>

      <ComprehensiveSearchDropdown
        isOpen={headerSearch.isOpen}
        query={headerSearch.query}
        onQueryChange={headerSearch.updateQuery}
        onClose={() => headerSearch.close({ clearQuery: false })}
        onNavigateToMushaf={headerSearch.navigateToMushaf}
        onNavigateToSurahVerse={headerSearch.navigateToSurahVerse}
        onNavigateToTafsir={headerSearch.navigateToTafsir}
        onNavigateToTranslation={headerSearch.navigateToTranslation}
        onNavigateToJuz={headerSearch.navigateToJuz}
        onNavigateToPage={headerSearch.navigateToPage}
        onNavigateToSearch={headerSearch.navigateToSearch}
        topInset={searchHeaderHeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  menuRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  menuSheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
});
