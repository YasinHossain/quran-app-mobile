import { Link } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';

import type { Surah } from '@/src/core/domain/entities/Surah';

const cardShadow =
  Platform.OS === 'android'
    ? { elevation: 3 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
      };

export function SurahCard({ surah }: { surah: Surah }): React.JSX.Element {
  return (
    <Link
      href={{ pathname: '/surah/[surahId]', params: { surahId: String(surah.id) } }}
      asChild
    >
      <Pressable
        className={[
          'h-20 w-full rounded-xl border border-border/30 dark:border-border-dark/20',
          'bg-surface-navigation dark:bg-surface-navigation-dark',
          'px-4 py-4',
        ].join(' ')}
        style={({ pressed }) => [cardShadow, { opacity: pressed ? 0.92 : 1 }]}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-number-badge dark:bg-number-badge-dark">
            <Text className="text-lg font-bold text-accent dark:text-accent-dark">{surah.id}</Text>
          </View>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className="text-base font-bold text-content-primary dark:text-content-primary-dark"
            >
              {surah.englishName}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-content-secondary dark:text-content-secondary-dark"
            >
              {surah.numberOfAyahs} Verses
            </Text>
          </View>

          <Text
            numberOfLines={1}
            className="text-lg font-semibold text-foreground dark:text-foreground-dark"
          >
            {surah.arabicName}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
