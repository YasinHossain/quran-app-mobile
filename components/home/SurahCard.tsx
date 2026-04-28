import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import type { Surah } from '@/src/core/domain/entities/Surah';

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: '#000', elevation: 1 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function SurahCardComponent({ surah }: { surah: Surah }): React.JSX.Element {
  const router = useRouter();
  const { settings } = useSettings();
  const { isDark } = useAppTheme();
  const bgColor = isDark ? '#182333' : '#FFFFFF';

  const handlePress = React.useCallback(async () => {
    await preloadOfflineSurahNavigationPage({ surahId: surah.id, settings });
    router.push({ pathname: '/surah/[surahId]', params: { surahId: String(surah.id) } });
  }, [router, settings, surah.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
    >
      <View
        className={[
          'h-[72px] w-full',
          'bg-surface-navigation dark:bg-surface-navigation-dark',
          'px-4 justify-center',
        ].join(' ')}
        style={[
          cardShadow,
          {
            borderRadius: 12,
            borderWidth: 0,
            backgroundColor: bgColor,
          },
        ]}
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
      </View>
    </Pressable>
  );
}

export const SurahCard = React.memo(SurahCardComponent);
