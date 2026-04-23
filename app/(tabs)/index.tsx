import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeRecentCard } from '@/components/home/HomeRecentCard';
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';
import { HomeTabToggle, type HomeTab } from '@/components/home/HomeTabToggle';
import { PageGrid } from '@/components/home/PageGrid';
import { HomeVersePlaceholder } from '@/components/home/HomeVersePlaceholder';
import { JuzGrid } from '@/components/home/JuzGrid';
import { SurahGrid } from '@/components/home/SurahGrid';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useChapters } from '@/hooks/useChapters';
import juzData from '../../src/data/juz.json';

import type { Chapter } from '@/types';

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
      style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12 }}
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

export default function ReadScreen(): React.JSX.Element {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<HomeTab>('surah');
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = React.useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = React.useState('');
  const headerSearchInputRef = React.useRef<TextInput | null>(null);
  const { chapters, isLoading, errorMessage } = useChapters();
  const surahs = React.useMemo(() => chapters.map(mapChapterToSurah), [chapters]);
  const pageNumbers = React.useMemo(() => Array.from({ length: 604 }, (_, index) => index + 1), []);

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
    (surahId: number, verse?: number) => {
      closeHeaderSearch({ clearQuery: true });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(surahId),
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

  const listHeader = (
    <View className="px-4 pt-3 pb-4">
      <HomeVersePlaceholder />
      <View className="mt-4">
        <HomeShortcutGrid />
      </View>
      <View className="mt-3">
        <HomeRecentCard />
      </View>
      <View className="mt-4">
        <HomeTabToggle activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
    </View>
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
        {activeTab === 'surah' ? (
          surahs.length === 0 && errorMessage ? (
            <View className="flex-1">
              {listHeader}
              <View className="px-4">
                <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
              </View>
            </View>
          ) : surahs.length === 0 && isLoading ? (
            <View className="flex-1">
              {listHeader}
              <View className="px-4">
                <Text className="text-sm text-muted dark:text-muted-dark">Loading…</Text>
              </View>
            </View>
          ) : (
            <SurahGrid surahs={surahs} listHeader={listHeader} />
          )
        ) : activeTab === 'juz' ? (
          <JuzGrid juzs={juzData} listHeader={listHeader} />
        ) : (
          <PageGrid pages={pageNumbers} listHeader={listHeader} />
        )}
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
