import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  Platform, Linking, Modal, Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
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
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useChapters } from '@/hooks/useChapters';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import juzData from '../../src/data/juz.json';

import type { Chapter } from '@/types';

const LIST_HORIZONTAL_PADDING = 0;
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
  | { type: 'surah'; key: string; surah: Surah }
  | { type: 'juz'; key: string; juz: JuzSummary }
  | { type: 'page'; key: string; pageNumber: number };

type HomeListRow =
  | { type: 'tabs'; key: 'tabs' }
  | { type: 'message'; key: 'loading' | 'error'; message: string; tone: 'muted' | 'error' }
  | { type: 'grid-row'; key: string; items: HomeListItem[] };

function chunkData<T>(data: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  return chunks;
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
    <View
      style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 12 }}
      className="bg-background dark:bg-background-dark flex-row items-center gap-3"
    >
      <View>
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          className="p-2 -ml-2 rounded-full active:bg-interactive dark:active:bg-interactive-dark"
        >
          <Menu size={24} color={isDark ? '#E5E5E5' : '#2F3744'} />
        </Pressable>

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

      <View className="flex-1">
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

      <Pressable
        onPress={() => setDarkModeEnabled(!isDark)}
        hitSlop={8}
        className="p-2 -mr-2 rounded-full active:bg-interactive dark:active:bg-interactive-dark"
      >
        {isDark ? <Sun size={24} color="#E5E5E5" /> : <Moon size={24} color="#2F3744" />}
      </Pressable>
    </View>
  );
}

function HomeIntro(): React.JSX.Element {
  return (
    <View className="pt-3 pb-4">
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
  onTabChange,
}: {
  activeTab: HomeTab;
  containerWidth: number;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  const tabsBarWidth = Math.max(0, containerWidth - LIST_HORIZONTAL_PADDING * 2);
  const toggleWidth = Math.max(0, tabsBarWidth - TABS_BAR_HORIZONTAL_PADDING * 2);

  return (
    <View 
      className="bg-background dark:bg-background-dark"
      style={{ zIndex: 10 }}
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
  numColumns,
}: {
  activeTab: HomeTab;
  errorMessage: string | null;
  isLoading: boolean;
  pageNumbers: number[];
  surahs: Surah[];
  numColumns: number;
}): HomeListRow[] {
  const rows: HomeListRow[] = [{ type: 'tabs', key: 'tabs' }];

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

  const listHeader = React.useMemo(
    () => <HomeIntro />,
    []
  );

  const renderItem = React.useCallback(
    ({ item }: { item: HomeListRow }) => {
      if (item.type === 'tabs') {
        return (
          <HomeTabsBar
            activeTab={activeTab}
            containerWidth={width}
            onTabChange={handleTabChange}
          />
        );
      }

      if (item.type === 'message') {
        return <HomeListMessage message={item.message} tone={item.tone} />;
      }

      if (item.type === 'grid-row') {
        return (
          <View style={{ flexDirection: 'row', width: '100%' }}>
            {item.items.map((gridItem, idx) => {
              const flex = 1 / numColumns;
              
              if (gridItem.type === 'surah') {
                return (
                  <View key={gridItem.key} style={{ flex, marginBottom: 10, paddingHorizontal: 12 }}>
                    <SurahCard surah={gridItem.surah} />
                  </View>
                );
              }

              if (gridItem.type === 'juz') {
                return (
                  <View key={gridItem.key} style={{ flex, marginBottom: 10, paddingHorizontal: 12 }}>
                    <JuzCard juz={gridItem.juz} />
                  </View>
                );
              }

              return (
                <View key={gridItem.key} style={{ flex, marginBottom: 10, paddingHorizontal: 12 }}>
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
    [activeTab, handleTabChange, width, numColumns]
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
        <FlatList
          ref={listRef}
          key={`home-flatlist`}
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          stickyHeaderIndices={[1]}
          scrollEventThrottle={16}
          initialNumToRender={8}
          maxToRenderPerBatch={12}
          windowSize={Platform.OS === 'android' ? 11 : 5}
          removeClippedSubviews={Platform.OS === 'android'}
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
