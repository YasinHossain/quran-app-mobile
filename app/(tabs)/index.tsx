import { Stack, router, useFocusEffect } from 'expo-router';
import { useScrollToTop } from "expo-router/react-navigation";
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import React from 'react';
import {
  Animated,
  Linking, Platform, Pressable,
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
import { HomeIndexCard, type HomeIndexCardItem } from '@/components/home/HomeIndexCard';
import {
  NativeHomeIndex,
  type NativeHomeIndexContent,
  type NativeHomeIndexHandle,
  type NativeHomeIndexItem,
  type NativeHomeIndexPressEvent,
  type NativeHomeIndexTheme,
} from '@/components/home/native/NativeHomeIndex';
import { HomeQuickLinksCard } from '@/components/home/HomeQuickLinksCard';
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';
import { HomeTabToggle, type HomeTab } from '@/components/home/HomeTabToggle';
import { HomeVerseSpotlight } from '@/components/home/HomeVerseSpotlight';
import type { JuzSummary } from '@/components/home/JuzCard';
import { AppSearchHeader } from '@/components/navigation/AppHeader';
import { useHeaderSearch } from '@/components/navigation/useHeaderSearch';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useDownloadedResourceSize } from '@/hooks/useDownloadedResourceSize';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { IndexScrubber, type IndexScrubberHandle } from '@/components/reader/IndexScrubber';
import { modalBackdropStyle, sideSheetTransform, useModalTransition } from '@/components/motion/modalTransition';
import { PortalOverlay } from '@/components/motion/PortalOverlay';
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
const NATIVE_PAGE_NUMBER_TOKEN = '__PAGE_NUMBER__';

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

type HomeListItem = HomeIndexCardItem & { key: string };

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

function getHomeItemType(item: HomeListRow): HomeListRow['type'] {
  return item.type;
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
  const [isMenuSettled, setIsMenuSettled] = React.useState(false);
  const { width } = useWindowDimensions();
  const menuWidth = Math.min(280, Math.round(width * 0.8));
  const hiddenTranslateX = -menuWidth;

  const { visible, progress, onModalShow } = useModalTransition(isMenuOpen, {
    preset: 'drawer',
    onAfterOpen: () => setIsMenuSettled(true),
    onAfterClose: () => setIsMenuSettled(false),
  });

  const { isDark, setDarkModeEnabled } = useAppTheme();
  const { t } = useUiTranslation();
  const { items: downloadItems, isLoading: isDownloadIndexLoading } = useDownloadIndexItems({
    enabled: isMenuSettled,
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
          <HeaderActionButton
            accessibilityLabel={t('open_menu', { fallback: 'Open menu' })}
            onPress={openMenu}
          >
            <Menu size={24} color={isDark ? '#E5E5E5' : '#2F3744'} />
          </HeaderActionButton>

          <PortalOverlay
            visible={visible}
            onShow={onModalShow}
            onRequestClose={closeMenu}
          >
            <View style={styles.menuRoot}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
                <Animated.View
                  style={[
                    styles.menuOverlay,
                    modalBackdropStyle(progress, isDark),
                  ]}
                />
              </Pressable>

              <Animated.View
                renderToHardwareTextureAndroid
                shouldRasterizeIOS
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
          </PortalOverlay>
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
          accessibilityLabel={
            isDark
              ? t('switch_to_light', { fallback: 'Switch to light mode' })
              : t('switch_to_dark', { fallback: 'Switch to dark mode' })
          }
          onPress={() => setDarkModeEnabled(!isDark)}
        >
          {isDark ? <Sun size={24} color="#E5E5E5" /> : <Moon size={24} color="#2F3744" />}
        </HeaderActionButton>
      }
    />
  );
}

const HomeIntro = React.memo(function HomeIntro({
  isSpotlightVisible,
  onSpotlightHeightChange,
  onHeightChange,
}: {
  isSpotlightVisible: boolean;
  onSpotlightHeightChange?: (height: number) => void;
  onHeightChange?: (height: number) => void;
}): React.JSX.Element {
  return (
    <View
      className="pb-4"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <View
        className="px-3"
        onLayout={(event) => onSpotlightHeightChange?.(event.nativeEvent.layout.height)}
      >
        <HomeVerseSpotlight isVisible={isSpotlightVisible} />
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
});

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
  const [displayedTab, setDisplayedTab] = React.useState(activeTab);
  const tabsBarWidth = Math.max(0, containerWidth - LIST_HORIZONTAL_PADDING * 2);
  const toggleWidth = Math.max(0, tabsBarWidth - TABS_BAR_HORIZONTAL_PADDING * 2);

  React.useEffect(() => {
    setDisplayedTab(activeTab);
  }, [activeTab]);

  const handleTabChange = React.useCallback(
    (tab: HomeTab) => {
      // Paint the selected segment before React reconciles the replacement
      // list. This keeps input feedback immediate even on a busy JS thread.
      setDisplayedTab(tab);
      onTabChange(tab);
    },
    [onTabChange]
  );

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
          activeTab={displayedTab}
          width={toggleWidth}
          onTabChange={handleTabChange}
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
      rows.push({ type: 'grid-row', key: `grid-row:${index}`, items: chunk });
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
      rows.push({ type: 'grid-row', key: `grid-row:${index}`, items: chunk });
    });
    return rows;
  }

  const items = pageNumbers.map((pageNumber) => ({
    type: 'page' as const,
    key: `page:${pageNumber}`,
    pageNumber,
  }));
  chunkData(items, numColumns).forEach((chunk, index) => {
    rows.push({ type: 'grid-row', key: `grid-row:${index}`, items: chunk });
  });
  return rows;
}

export default function ReadScreen(): React.JSX.Element {
  const [activeTab, setActiveTab] = React.useState<HomeTab>('surah');
  const selectedTabRef = React.useRef<HomeTab>('surah');
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { t, formatNumber, localizeDigits } = useUiTranslation();
  const { settings } = useSettings();
  const [searchHeaderHeight, setSearchHeaderHeight] = React.useState(0);
  const headerSearch = useHeaderSearch();
  const listRef = React.useRef<FlashListRef<HomeListRow> | null>(null);
  const nativeListRef = React.useRef<NativeHomeIndexHandle | null>(null);
  useScrollToTop(Platform.OS === 'android' ? nativeListRef : listRef);
  const homeIntroHeightRef = React.useRef(0);
  const spotlightHeightRef = React.useRef(0);
  const listScrollOffsetRef = React.useRef(0);
  const pendingTabScrollRef = React.useRef<{ tab: HomeTab; offset: number } | null>(null);
  const [homeIntroHeight, setHomeIntroHeight] = React.useState(0);
  const [isSpotlightVisible, setIsSpotlightVisible] = React.useState(true);
  const [tabsBarHeight, setTabsBarHeight] = React.useState(HOME_TABS_BAR_ESTIMATED_HEIGHT);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const { chapters, isLoading, errorMessage } = useChapters();
  const surahs = React.useMemo(() => chapters.map(mapChapterToSurah), [chapters]);
  const pageNumbers = React.useMemo(() => Array.from({ length: 604 }, (_, index) => index + 1), []);
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  const insets = useSafeAreaInsets();
  const scrubberRef = React.useRef<IndexScrubberHandle | null>(null);
  const currentScrubIndexRef = React.useRef(1);
  const isScrubbingRef = React.useRef(false);
  const navigationPendingRef = React.useRef(false);

  const updateCurrentScrubIndex = React.useCallback((index: number) => {
    if (currentScrubIndexRef.current === index) return;
    currentScrubIndexRef.current = index;
    scrubberRef.current?.setCurrentIndex(index);
  }, []);

  const listDataByTab = React.useMemo(
    () => ({
      surah: buildHomeListData({
        activeTab: 'surah',
        errorMessage,
        isLoading,
        pageNumbers,
        surahs,
        numColumns,
        loadingLabel: t('loading'),
      }),
      juz: buildHomeListData({
        activeTab: 'juz',
        errorMessage,
        isLoading,
        pageNumbers,
        surahs,
        numColumns,
        loadingLabel: t('loading'),
      }),
      page: buildHomeListData({
        activeTab: 'page',
        errorMessage,
        isLoading,
        pageNumbers,
        surahs,
        numColumns,
        loadingLabel: t('loading'),
      }),
    }),
    [errorMessage, isLoading, pageNumbers, surahs, numColumns, t]
  );
  const listData = listDataByTab[activeTab];
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
  const handleTabChange = React.useCallback(
    (tab: HomeTab) => {
      if (tab === selectedTabRef.current) return;

      const currentOffset = listScrollOffsetRef.current;
      pendingTabScrollRef.current = {
        tab,
        offset: currentOffset,
      };
      selectedTabRef.current = tab;

      // The rows are already prepared and FlashList recycles the visible
      // cells, so keep the tab and its content in the same urgent update.
      setActiveTab(tab);
    },
    []
  );

  const handleHomeIntroHeightChange = React.useCallback((height: number) => {
    if (Math.abs(homeIntroHeightRef.current - height) < 1) return;

    homeIntroHeightRef.current = height;
    setHomeIntroHeight(height);
  }, []);

  const handleSpotlightHeightChange = React.useCallback((height: number) => {
    spotlightHeightRef.current = height;
  }, []);

  const handleTabsBarHeightChange = React.useCallback((height: number) => {
    setTabsBarHeight((currentHeight) =>
      Math.abs(currentHeight - height) < 1 ? currentHeight : height
    );
  }, []);

  const handleScrubStateChange = React.useCallback((isScrubbing: boolean) => {
    isScrubbingRef.current = isScrubbing;
  }, []);

  const updateCurrentIndexFromScroll = React.useCallback(
    (offset: number) => {
      if (isScrubbingRef.current) return;

      const gridStartOffset = effectiveHomeIntroHeight + tabsBarHeight;
      // All grid rows have a fixed height. Deriving the row directly keeps
      // page-600 scrolling O(1) instead of scanning every preceding layout on
      // each 16 ms scroll event.
      if (offset < gridStartOffset) {
        updateCurrentScrubIndex(1);
        return;
      }

      const gridRowIdx = Math.floor(
        (offset - gridStartOffset) / HOME_GRID_ROW_HEIGHT
      );
      const firstItemIdx = gridRowIdx * numColumns + 1;

      let maxItems = 604;
      if (activeTab === 'surah') maxItems = surahs.length;
      else if (activeTab === 'juz') maxItems = 30;

      const clampedIndex = clampNumber(firstItemIdx, 1, maxItems);
      updateCurrentScrubIndex(clampedIndex);
    },
    [
      effectiveHomeIntroHeight,
      tabsBarHeight,
      numColumns,
      activeTab,
      surahs.length,
      updateCurrentScrubIndex,
    ]
  );

  const handleListScroll = React.useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offset = event.nativeEvent.contentOffset.y;
      listScrollOffsetRef.current = offset;
      setIsSpotlightVisible((visible) => {
        const spotlightHeight = spotlightHeightRef.current;
        const nextVisible = spotlightHeight <= 0 || offset < spotlightHeight;
        return visible === nextVisible ? visible : nextVisible;
      });
      updateCurrentIndexFromScroll(offset);
      scrubberRef.current?.show();
    },
    [updateCurrentIndexFromScroll]
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
    listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
  }, [listContentHeight, listViewportHeight]);

  const handleScrubToIndex = React.useCallback(
    (index: number, options?: { isFinal?: boolean; position?: number }) => {
      const position = options?.isFinal ? index : options?.position ?? index;
      const itemPosition = position - 1;
      const rowPosition = itemPosition / numColumns;
      const rowIdx = Math.floor(rowPosition);
      const flatListRowIdx = 2 + rowIdx;

      const layout = rowLayouts[flatListRowIdx];
      if (layout) {
        const rowFraction = options?.isFinal ? 0 : rowPosition - rowIdx;
        scrollToHomeOffset(layout.offset + rowFraction * HOME_GRID_ROW_HEIGHT);
        updateCurrentScrubIndex(index);
      }
    },
    [numColumns, rowLayouts, scrollToHomeOffset, updateCurrentScrubIndex]
  );

  const formatScrubberLabel = React.useCallback(
    (index: number) => {
      if (activeTab === 'surah') {
        const surah = surahs[index - 1];
        return surah
          ? t(`surah_names.${surah.id}`, { fallback: surah.name })
          : `${t('surah_tab')} ${formatNumber(index)}`;
      }
      if (activeTab === 'juz') {
        return t('juz_number', { number: index });
      }
      return t('page_number_label', { number: index });
    },
    [activeTab, formatNumber, surahs, t]
  );

  const nativeContent = React.useMemo<NativeHomeIndexContent>(() => {
    if (activeTab === 'surah') {
      if (isLoading || errorMessage) return { kind: 'items', items: [] };
      const items: NativeHomeIndexItem[] = surahs.map((surah) => {
        const numberLabel = formatNumber(surah.id);
        const title = t(`surah_names.${surah.id}`, { fallback: surah.englishName });
        const subtitle = `${formatNumber(surah.numberOfAyahs)} ${t('verses')}`;
        return {
          type: 'surah',
          number: surah.id,
          numberLabel,
          title,
          subtitle,
          trailingText: surah.arabicName,
          accessibilityLabel: `${numberLabel}, ${title}, ${subtitle}, ${surah.arabicName}`,
        };
      });
      return { kind: 'items', items };
    }

    if (activeTab === 'juz') {
      const items: NativeHomeIndexItem[] = (juzData as JuzSummary[]).map((juz) => {
        const numberLabel = formatNumber(juz.number);
        const title = t('juz_number', { number: juz.number });
        const subtitle =
          typeof juz.startSurahId === 'number' &&
          typeof juz.startAyah === 'number' &&
          typeof juz.endSurahId === 'number' &&
          typeof juz.endAyah === 'number'
            ? `${t(`surah_names.${juz.startSurahId}`)} ${formatNumber(juz.startAyah)} - ${t(`surah_names.${juz.endSurahId}`)} ${formatNumber(juz.endAyah)}`
            : juz.surahRange;
        return {
          type: 'juz',
          number: juz.number,
          numberLabel,
          title,
          subtitle,
          trailingText: '',
          accessibilityLabel: `${numberLabel}, ${title}, ${subtitle}`,
        };
      });
      return { kind: 'items', items };
    }

    return {
      kind: 'pages',
      count: 604,
      digits: localizeDigits('0123456789'),
      titleTemplate: t('page_number_label', { number: NATIVE_PAGE_NUMBER_TOKEN }),
    };
  }, [activeTab, errorMessage, formatNumber, isLoading, localizeDigits, surahs, t]);

  const nativeTheme = React.useMemo<NativeHomeIndexTheme>(
    () => ({
      accentColor: palette.accent,
      backgroundColor: palette.background,
      cardColor: palette.surfaceNavigation,
      numberBadgeColor: resolvedTheme === 'dark' ? '#334155' : palette.interactive,
      primaryTextColor: palette.text,
      secondaryTextColor: palette.muted,
    }),
    [palette, resolvedTheme]
  );

  const nativeMessage =
    activeTab === 'surah'
      ? errorMessage
        ? { message: errorMessage, tone: 'error' as const }
        : isLoading
          ? { message: t('loading'), tone: 'muted' as const }
          : null
      : null;
  const nativeHeaderHeight =
    effectiveHomeIntroHeight + tabsBarHeight + (nativeMessage ? HOME_MESSAGE_ROW_HEIGHT : 0);
  useFocusEffect(
    React.useCallback(() => {
      navigationPendingRef.current = false;
    }, [])
  );

  const handleNativeItemPress = React.useCallback(
    (event: { nativeEvent: NativeHomeIndexPressEvent }) => {
      const { type, number } = event.nativeEvent;
      if (navigationPendingRef.current) return;
      navigationPendingRef.current = true;

      if (type === 'juz') {
        router.push({ pathname: '/juz/[juzNumber]', params: { juzNumber: String(number) } });
        return;
      }
      if (type === 'page') {
        router.push({ pathname: '/page/[pageNumber]', params: { pageNumber: String(number) } });
        return;
      }
      const surah = surahs.find((candidate) => candidate.id === number);
      if (!surah) {
        navigationPendingRef.current = false;
        return;
      }

      // The reader takes a complete synchronous local snapshot on its first render.
      // Starting an async read here makes that snapshot wait and exposes loading UI.
      router.push({ pathname: '/surah/[surahId]', params: { surahId: String(number) } });
    },
    [surahs]
  );

  React.useEffect(() => {
    if (listViewportHeight <= 0) return;

    const maxOffset = Math.max(0, listContentHeight - listViewportHeight);
    if (listScrollOffsetRef.current <= maxOffset) return;

    scrollToHomeOffset(maxOffset);
  }, [listContentHeight, listViewportHeight, scrollToHomeOffset]);

  React.useLayoutEffect(() => {
    updateCurrentScrubIndex(1);
  }, [activeTab, updateCurrentScrubIndex]);

  React.useEffect(() => {
    const pendingScroll = pendingTabScrollRef.current;
    if (!pendingScroll || pendingScroll.tab !== activeTab) return;

    pendingTabScrollRef.current = null;
    const frame = requestAnimationFrame(() => {
      scrollToHomeOffset(pendingScroll.offset);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, scrollToHomeOffset]);

  const renderItem = React.useCallback(
    ({ item }: { item: HomeListRow }) => {
      if (item.type === 'intro') {
        return (
          <HomeIntro
            isSpotlightVisible={isSpotlightVisible}
            onSpotlightHeightChange={handleSpotlightHeightChange}
            onHeightChange={handleHomeIntroHeightChange}
          />
        );
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
            {item.items.map((gridItem, itemIndex) => {
              const flex = 1 / numColumns;
              return (
                <View key={`slot:${itemIndex}`} style={{ flex, height: HOME_NAV_CARD_HEIGHT, paddingHorizontal: 12 }}>
                  <HomeIndexCard item={gridItem} />
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
      handleSpotlightHeightChange,
      handleTabChange,
      handleTabsBarHeightChange,
      isSpotlightVisible,
      numColumns,
      width,
    ]
  );

  const drawDistance = React.useMemo(
    () => Math.max(Platform.OS === 'android' ? 1200 : 900, listViewportHeight * 2),
    [listViewportHeight]
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

      <View
        className="flex-1"
        style={{ backgroundColor: palette.background }}
      >
        {Platform.OS === 'android' ? (
          <NativeHomeIndex
            ref={nativeListRef}
            style={styles.list}
            bottomInset={insets.bottom + 8}
            headerHeight={nativeHeaderHeight}
            headerIntroHeight={effectiveHomeIntroHeight}
            content={nativeContent}
            numColumns={numColumns}
            tabsHeight={tabsBarHeight}
            theme={nativeTheme}
            onHeaderVisibilityChange={(event) => {
              setIsSpotlightVisible(event.nativeEvent.visible);
            }}
            onItemPress={handleNativeItemPress}
            onTabPress={(event) => handleTabChange(event.nativeEvent.tab)}
          >
            <View
              collapsable={false}
              style={{ height: nativeHeaderHeight, width: '100%' }}
            >
              <HomeIntro
                isSpotlightVisible={isSpotlightVisible}
                onSpotlightHeightChange={handleSpotlightHeightChange}
                onHeightChange={handleHomeIntroHeightChange}
              />
              <HomeTabsBar
                activeTab={activeTab}
                containerWidth={width}
                onHeightChange={handleTabsBarHeightChange}
                onTabChange={handleTabChange}
              />
              {nativeMessage ? (
                <View style={{ height: HOME_MESSAGE_ROW_HEIGHT }}>
                  <HomeListMessage message={nativeMessage.message} tone={nativeMessage.tone} />
                </View>
              ) : null}
            </View>
          </NativeHomeIndex>
        ) : (
          <>
            <FlashList
              ref={listRef}
              key={`home-flatlist`}
              data={listData}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              getItemType={getHomeItemType}
              onLayout={handleListLayout}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              drawDistance={drawDistance}
              maintainVisibleContentPosition={{ disabled: true }}
              overrideProps={{ initialDrawBatchSize: 12 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              style={styles.list}
            />
            <IndexScrubber
              ref={scrubberRef}
              bottomInset={8}
              continuousUpdates
              topInset={0}
              currentIndex={1}
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
          </>
        )}
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: HOME_CONTENT_BOTTOM_PADDING,
    paddingHorizontal: LIST_HORIZONTAL_PADDING,
  },
  menuRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  menuOverlay: {
    flex: 1,
  },
  menuSheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
});
