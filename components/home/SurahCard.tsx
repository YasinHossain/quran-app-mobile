import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import {
  preloadOfflineSurahNavigationPage,
  primeOfflineSurahNavigationPage,
} from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import type { Surah } from '@/src/core/domain/entities/Surah';

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
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
  const { t, formatNumber } = useUiTranslation();
  const bgColor = isDark ? '#182333' : '#FFFFFF';
  const localizedSurahName = t(`surah_names.${surah.id}`, { fallback: surah.englishName });
  const verseCountLabel = `${formatNumber(surah.numberOfAyahs)} ${t('verses')}`;

  const handlePressIn = React.useCallback(() => {
    if (!settings.tajweed) return;
    primeOfflineSurahNavigationPage({ surahId: surah.id, settings });
  }, [settings, surah.id]);

  const handlePress = React.useCallback(async () => {
    await preloadOfflineSurahNavigationPage({ surahId: surah.id, settings });
    router.push({ pathname: '/surah/[surahId]', params: { surahId: String(surah.id) } });
  }, [router, settings, surah.id]);

  return (
    <Pressable
      onPressIn={handlePressIn}
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
          <Text className="text-lg font-bold text-accent dark:text-accent-dark">{formatNumber(surah.id)}</Text>
        </View>

        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            className="text-base font-bold text-content-primary dark:text-content-primary-dark"
          >
            {localizedSurahName}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs text-content-secondary dark:text-content-secondary-dark"
          >
            {verseCountLabel}
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
