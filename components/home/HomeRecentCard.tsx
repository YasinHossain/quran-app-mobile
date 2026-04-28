import { Clock3 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CircularProgress } from '@/components/bookmarks/last-read/CircularProgress';
import { buildNormalizedLastReadEntries } from '@/components/bookmarks/last-read/lastReadEntries';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

export function HomeRecentCard(): React.JSX.Element {
  const router = useRouter();
  const { lastRead } = useBookmarks();
  const { chapters, isLoading } = useChapters();
  const { settings } = useSettings();
  const { isDark, resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const recentEntries = React.useMemo(
    () => buildNormalizedLastReadEntries(lastRead, chapters, 5),
    [chapters, lastRead]
  );
  const hasRecentEntries = recentEntries.length > 0;
  const emptyLabel =
    isLoading && Object.keys(lastRead).length > 0
      ? 'Loading recent verses...'
      : 'Your recent verses will appear here';
  const activeShadow = React.useMemo(
    () =>
      Platform.OS === 'android'
        ? { elevation: 2 }
        : {
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          },
    []
  );

  const iconColor = palette.tint;
  const textColor = palette.text;
  const mutedTextColor = palette.muted;
  const progressTrack = isDark ? 'rgba(148,163,184,0.22)' : '#E9EDF2';
  const progressColor = palette.tint;

  const handlePress = React.useCallback(
    async (entry: (typeof recentEntries)[number]) => {
      const resolvedSurahId = Number(entry.surahId);
      if (!Number.isFinite(resolvedSurahId) || resolvedSurahId <= 0) return;

      await preloadOfflineSurahNavigationPage({
        surahId: resolvedSurahId,
        verseNumber: entry.verseNumber,
        settings,
      });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: entry.surahId,
          startVerse: String(entry.verseNumber),
        },
      });
    },
    [router, settings]
  );

  return (
    <View>
      <Text className="mb-3 px-3 text-lg font-semibold text-content-primary dark:text-content-primary-dark">
        Recent
      </Text>

      {hasRecentEntries ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipListContent}
        >
          {recentEntries.map((entry, index) => {
            const verseRef = `${entry.surahId}:${entry.verseNumber}`;
            const isLast = index === recentEntries.length - 1;
            const progressPercent =
              entry.chapter.verses_count > 0
                ? Math.min(
                    100,
                    Math.max(0, Math.round((entry.verseNumber / entry.chapter.verses_count) * 100))
                  )
                : 0;

            return (
              <Pressable
                key={entry.surahId}
                onPress={() => handlePress(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Open recent verse in ${entry.chapter.name_simple}`}
                className="flex-row items-center rounded-full bg-interactive py-1.5 pl-1.5 pr-4 dark:bg-surface-navigation-dark"
                style={({ pressed }) => [
                  {
                    minHeight: 46,
                    maxWidth: 228,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}
              >
                  <View
                    className="items-center justify-center rounded-full bg-surface-navigation dark:bg-background-dark"
                    style={[{ width: 34, height: 34 }, activeShadow]}
                  >
                    <CircularProgress
                      percentage={progressPercent}
                      size={31}
                      strokeWidth={2.75}
                      showLabel={false}
                      trackColor={progressTrack}
                      progressColor={progressColor}
                      center={<Clock3 size={14} strokeWidth={2.5} color={iconColor} />}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    className="ml-2.5 min-w-0 shrink text-[15px] font-bold"
                    style={{ color: textColor }}
                  >
                    {entry.chapter.name_simple}{' '}
                    <Text className="text-[13px] font-semibold" style={{ color: mutedTextColor }}>
                      {verseRef}
                    </Text>
                  </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View
          className="flex-row items-center rounded-full bg-interactive py-1.5 pl-1.5 pr-4 dark:bg-surface-navigation-dark"
          style={{ minHeight: 46, alignSelf: 'flex-start' }}
        >
          <View
            className="items-center justify-center rounded-full bg-surface-navigation dark:bg-background-dark"
            style={[{ width: 34, height: 34 }, activeShadow]}
          >
            <CircularProgress
              percentage={0}
              size={31}
              strokeWidth={2.75}
              showLabel={false}
              trackColor={progressTrack}
              progressColor={progressColor}
              center={<Clock3 size={14} strokeWidth={2.5} color={iconColor} />}
            />
          </View>
          <Text
            numberOfLines={1}
            className="ml-3 flex-1 text-[13px] font-semibold"
            style={{ color: mutedTextColor }}
          >
            {emptyLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipListContent: {
    paddingLeft: 12,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 4,
  },
  pillPressable: {
    borderRadius: 999,
  },
  pillSurface: {
    height: 44,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
