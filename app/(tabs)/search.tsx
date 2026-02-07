import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { GoToSurahVerseCard } from '@/components/search/GoToSurahVerseCard';
import { SearchVerseResultCard } from '@/components/search/SearchVerseResultCard';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import Colors from '@/constants/Colors';
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch';
import { analyzeQuery } from '@/lib/api/search';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { SearchNavigationResult } from '@/lib/api/search';

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
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string | string[] }>();
  const paramQuery = Array.isArray(params.query) ? params.query[0] : params.query;

  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const translationIds = React.useMemo(
    () => getTranslationIds(settings),
    [settings.translationId, settings.translationIds]
  );

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const [query, setQuery] = React.useState(paramQuery ?? '');
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
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(surahId),
          ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
        },
      });
    },
    [router]
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
    const showGoTo = trimmed.length === 0;
    const showShortQueryHint = trimmed.length > 0 && !shouldSearch;

    return (
      <View className="px-4 pt-6 pb-3 gap-4">
        <View>
          <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
            Search
          </Text>
          <Text className="mt-1 text-sm text-muted dark:text-muted-dark">
            Search across Surah names and verses.
          </Text>
        </View>

        <View className="rounded-xl bg-interactive dark:bg-interactive-dark px-4 py-3 flex-row items-center gap-2 border border-border/30 dark:border-border-dark/20">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
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
    navigationResults,
    palette.muted,
    query,
    shouldSearch,
    totalResults,
    trimmed.length,
  ]);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
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

      <FlashList
        data={verses}
        keyExtractor={(item) => item.verseKey}
        renderItem={({ item }) => (
          <SearchVerseResultCard
            verse={item}
            query={trimmed}
            arabicFontSize={settings.arabicFontSize}
            arabicFontFace={settings.arabicFontFace}
            translationFontSize={settings.translationFontSize}
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
              <View className="px-4 py-6 flex-row items-center gap-2">
                <ActivityIndicator size="small" color={palette.muted} />
                <Text className="text-sm text-muted dark:text-muted-dark">Searching…</Text>
              </View>
            ) : (
              <View className="px-4 py-6">
                <Text className="text-sm text-muted dark:text-muted-dark">No results.</Text>
              </View>
            )
          ) : (
            <View className="px-4 py-6" />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View className="px-4 py-6 flex-row items-center gap-2">
              <ActivityIndicator size="small" color={palette.muted} />
              <Text className="text-sm text-muted dark:text-muted-dark">Loading more…</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </View>
  );
}
