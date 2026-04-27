import { Clock3 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { CircularProgress } from '@/components/bookmarks/last-read/CircularProgress';
import { buildNormalizedLastReadEntries } from '@/components/bookmarks/last-read/lastReadEntries';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

const cardShadow =
  Platform.OS === 'android'
    ? { elevation: 1 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      };

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
  const chipBackground = isDark ? '#182333' : palette.surface;
  const chipBorder = isDark ? 'rgba(148,163,184,0.24)' : palette.border;
  const iconBackground = isDark ? '#F8FAFC' : '#FFFFFF';
  const iconColor = palette.muted;
  const textColor = palette.text;
  const mutedTextColor = palette.muted;
  const progressTrack = isDark ? 'rgba(148,163,184,0.22)' : '#E9EDF2';
  const progressColor = isDark ? '#94A3B8' : '#A7B0BD';

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
      <Text className="mb-3 text-lg font-semibold text-content-primary dark:text-content-primary-dark">
        Recent
      </Text>

      {hasRecentEntries ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 16 }}
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
                className="flex-row items-center rounded-full"
                style={({ pressed }) => [
                  cardShadow,
                  {
                    height: 48,
                    minWidth: 158,
                    maxWidth: 220,
                    marginRight: isLast ? 0 : 12,
                    paddingLeft: 9,
                    paddingRight: 16,
                    backgroundColor: chipBackground,
                    borderColor: chipBorder,
                    borderWidth: 1,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}
              >
                <View
                  className="h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: iconBackground }}
                >
                  <CircularProgress
                    percentage={progressPercent}
                    size={28}
                    strokeWidth={2.5}
                    showLabel={false}
                    trackColor={progressTrack}
                    progressColor={progressColor}
                    center={<Clock3 size={13} strokeWidth={2.5} color={iconColor} />}
                  />
                </View>
                <View className="ml-2.5 min-w-0 flex-1 flex-row items-baseline">
                  <Text
                    numberOfLines={1}
                    className="min-w-0 shrink text-[14px] font-bold"
                    style={{ color: textColor, maxWidth: 132 }}
                  >
                    {entry.chapter.name_simple}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="ml-2 text-[12px] font-semibold"
                    style={{ color: mutedTextColor }}
                  >
                    {verseRef}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View
          className="flex-row items-center rounded-full"
          style={[
            cardShadow,
            {
              height: 48,
              paddingLeft: 9,
              paddingRight: 16,
              backgroundColor: chipBackground,
              borderColor: chipBorder,
              borderWidth: 1,
            },
          ]}
        >
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: iconBackground }}
          >
            <CircularProgress
              percentage={0}
              size={28}
              strokeWidth={2.5}
              showLabel={false}
              trackColor={progressTrack}
              progressColor={progressColor}
              center={<Clock3 size={13} strokeWidth={2.5} color={iconColor} />}
            />
          </View>
          <Text
            numberOfLines={1}
            className="ml-2.5 flex-1 text-[13px] font-semibold"
            style={{ color: mutedTextColor }}
          >
            {emptyLabel}
          </Text>
        </View>
      )}
    </View>
  );
}
