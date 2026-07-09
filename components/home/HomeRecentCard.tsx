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
import { useUiTranslation } from '@/providers/UiLanguageContext';

export function HomeRecentCard(): React.JSX.Element {
  const router = useRouter();
  const { lastRead, isHydrated } = useBookmarks();
  const { chapters, isLoading } = useChapters();
  const { settings } = useSettings();
  const { isDark, resolvedTheme } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
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
        ? { elevation: 0 }
        : {
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          },
    []
  );
  const chipShadow = React.useMemo(
    () =>
      Platform.OS === 'android'
        ? { elevation: 0, shadowColor: '#000' }
        : {
            shadowColor: '#000',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
          },
    []
  );

  const iconColor = palette.tint;
  const textColor = palette.text;
  const mutedTextColor = palette.muted;
  const chipBackground = isDark ? palette.surfaceNavigation : palette.interactive;
  const borderColor = 'transparent';
  const borderWidth = 0;
  const iconCircleBackground = isDark ? '#0F172A' : '#FFFFFF';
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
      <Text className="mb-3 px-3 text-lg font-semibold" style={{ color: textColor }}>
        {t('home_quicklink_recent')}
      </Text>

      {!isHydrated ? (
        <View
          className="mx-3 flex-row items-center rounded-full py-1.5 pl-1.5 pr-4"
          style={{
            minHeight: 46,
            width: 190,
            alignSelf: 'flex-start',
            backgroundColor: chipBackground,
            borderRadius: 999,
            borderWidth: 1,
            borderColor,
            opacity: 0,
          }}
        />
      ) : hasRecentEntries ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipListContent}
        >
          {recentEntries.map((entry) => {
            const verseRef = `${formatNumber(Number(entry.surahId))}:${formatNumber(entry.verseNumber)}`;
            const surahName = t(`surah_names.${entry.surahId}`, {
              fallback: entry.chapter.name_simple,
            });
            const progressPercent =
              entry.chapter.verses_count > 0
                ? Math.min(
                    100,
                    Math.max(0, Math.round((entry.verseNumber / entry.chapter.verses_count) * 100))
                  )
                : 0;

            return (
              <Pressable
                key={`${entry.surahId}-${entry.verseNumber}`}
                onPress={() => handlePress(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Open recent verse in ${surahName}`}
                style={({ pressed }) => ({
                  maxWidth: 228,
                  opacity: pressed ? 0.92 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <View
                  className="flex-row items-center rounded-full py-1.5 pl-1.5 pr-4"
                  style={[
                    {
                      minHeight: 46,
                      maxWidth: 228,
                      backgroundColor: chipBackground,
                      borderRadius: 999,
                      borderWidth,
                      borderColor,
                    },
                    chipShadow,
                  ]}
                >
                  <View
                    className="items-center justify-center rounded-full"
                    style={[{ width: 34, height: 34, backgroundColor: iconCircleBackground }, activeShadow]}
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
                    className="ml-2.5 text-[15px] font-bold"
                    ellipsizeMode="tail"
                    style={{ color: textColor, maxWidth: 168 }}
                  >
                    {surahName}{' '}
                    <Text className="text-[13px] font-semibold" style={{ color: mutedTextColor }}>
                      {verseRef}
                    </Text>
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View
          className="mx-3 flex-row items-center rounded-full py-1.5 pl-1.5 pr-4"
          style={[{
            minHeight: 46,
            alignSelf: 'flex-start',
            backgroundColor: chipBackground,
            borderRadius: 999,
            borderWidth,
            borderColor,
          }, chipShadow]}
        >
          <View
            className="items-center justify-center rounded-full"
            style={[{ width: 34, height: 34, backgroundColor: iconCircleBackground }, activeShadow]}
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
});
