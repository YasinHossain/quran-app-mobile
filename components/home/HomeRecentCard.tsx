import { Clock3 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { buildNormalizedLastReadEntries } from '@/components/bookmarks/last-read/lastReadEntries';
import { useChapters } from '@/hooks/useChapters';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

const cardShadow =
  Platform.OS === 'android'
    ? { elevation: 2 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };

export function HomeRecentCard(): React.JSX.Element {
  const router = useRouter();
  const { lastRead } = useBookmarks();
  const { chapters, isLoading } = useChapters();
  const { settings } = useSettings();
  const { isDark } = useAppTheme();

  const recentEntries = React.useMemo(
    () => buildNormalizedLastReadEntries(lastRead, chapters, 5),
    [chapters, lastRead]
  );
  const hasRecentEntries = recentEntries.length > 0;
  const emptyLabel =
    isLoading && Object.keys(lastRead).length > 0
      ? 'Loading recent verses...'
      : 'Your recent verses will appear here';
  const chipBackground = isDark ? '#1E293B' : '#FFFFFF';
  const chipBorder = isDark ? 'rgba(148,163,184,0.24)' : 'rgba(17,24,39,0.12)';
  const iconColor = isDark ? '#D7D7D7' : '#394150';
  const textColor = isDark ? '#F0F0F0' : '#283241';
  const mutedTextColor = isDark ? '#A9A9A9' : '#667085';

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

            return (
              <Pressable
                key={entry.surahId}
                onPress={() => handlePress(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Open recent verse in ${entry.chapter.name_simple}`}
                className="h-[58px] flex-row items-center rounded-full border px-5"
                style={({ pressed }) => [
                  cardShadow,
                  {
                    minWidth: 156,
                    maxWidth: 220,
                    marginRight: isLast ? 0 : 12,
                    backgroundColor: chipBackground,
                    borderColor: chipBorder,
                    borderWidth: 1,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}
              >
                <Clock3 size={18} strokeWidth={2.3} color={iconColor} />
                <View className="ml-3 min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    className="text-[15px] font-bold"
                    style={{ color: textColor }}
                  >
                    {entry.chapter.name_simple}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-[11px] font-semibold"
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
          className="h-[58px] flex-row items-center rounded-full border px-5"
          style={[
            cardShadow,
            { backgroundColor: chipBackground, borderColor: chipBorder, borderWidth: 1 },
          ]}
        >
          <Clock3 size={18} strokeWidth={2.3} color={iconColor} />
          <Text
            numberOfLines={1}
            className="ml-3 flex-1 text-[14px] font-semibold"
            style={{ color: mutedTextColor }}
          >
            {emptyLabel}
          </Text>
        </View>
      )}
    </View>
  );
}
