import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { buildNormalizedLastReadEntries } from '@/components/bookmarks/last-read/lastReadEntries';
import { useChapters } from '@/hooks/useChapters';
import { useBookmarks } from '@/providers/BookmarkContext';

const cardShadow =
  Platform.OS === 'android'
    ? { elevation: 3 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };

export function HomeRecentCard(): React.JSX.Element {
  const router = useRouter();
  const { lastRead } = useBookmarks();
  const { chapters, isLoading } = useChapters();

  const latestEntry = React.useMemo(
    () => buildNormalizedLastReadEntries(lastRead, chapters, 1)[0] ?? null,
    [chapters, lastRead]
  );
  const isDisabled = latestEntry === null;
  const subtitle = latestEntry
    ? `${latestEntry.chapter.name_simple} ${latestEntry.surahId}:${latestEntry.verseNumber}`
    : isLoading && Object.keys(lastRead).length > 0
      ? 'Loading recent verse...'
      : 'Your recent verse will appear here';

  return (
    <View>
      <Text className="mb-3 text-lg font-semibold text-content-primary dark:text-content-primary-dark">
        Recent
      </Text>
      <Pressable
        onPress={() => {
          if (!latestEntry) return;
          router.push({
            pathname: '/surah/[surahId]',
            params: {
              surahId: latestEntry.surahId,
              startVerse: String(latestEntry.verseNumber),
            },
          });
        }}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={
          latestEntry ? `Open recent verse in ${latestEntry.chapter.name_simple}` : 'Recent'
        }
        accessibilityState={{ disabled: isDisabled }}
        className={[
          'self-start rounded-full border border-border/15 px-4 py-3',
          'bg-surface-navigation dark:border-border-dark/15 dark:bg-surface-navigation-dark',
        ].join(' ')}
        style={({ pressed }) => [
          cardShadow,
          {
            maxWidth: '100%',
            opacity: isDisabled ? 0.78 : pressed ? 0.92 : 1,
            transform: [{ scale: !isDisabled && pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <View className="flex-row items-center gap-2">
          {latestEntry ? (
            <Text className="text-sm font-semibold text-content-primary dark:text-content-primary-dark">
              Continue
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            className="text-sm text-content-secondary dark:text-content-secondary-dark"
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
