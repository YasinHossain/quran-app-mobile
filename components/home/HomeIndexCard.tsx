import { router, useFocusEffect } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { primeOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { warmSurahReaderBeforeNavigation } from '@/lib/surah/surahReaderWarmup';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import type { Surah } from '@/src/core/domain/entities/Surah';

import type { JuzSummary } from './JuzCard';

export type HomeIndexCardItem =
  | { type: 'surah'; surah: Surah }
  | { type: 'juz'; juz: JuzSummary }
  | { type: 'page'; pageNumber: number };

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function HomeIndexCardComponent({ item }: { item: HomeIndexCardItem }): React.JSX.Element {
  const navigationPending = React.useRef(false);
  const { settings } = useSettings();
  const { isDark } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();

  useFocusEffect(
    React.useCallback(() => {
      navigationPending.current = false;
    }, [])
  );

  const bgColor = isDark ? '#182333' : '#FFFFFF';
  const numberBadgeBgColor = isDark ? '#334155' : '#F3F4F6';
  const primaryTextColor = isDark ? '#E7E5E4' : '#374151';
  const secondaryTextColor = isDark ? '#94A3B8' : '#6B7280';
  const accentColor = isDark ? '#14B8A6' : '#0D9488';

  let number = 1;
  let title = '';
  let subtitle = '';
  let trailingText = '';

  if (item.type === 'surah') {
    number = item.surah.id;
    title = t(`surah_names.${item.surah.id}`, { fallback: item.surah.englishName });
    subtitle = `${formatNumber(item.surah.numberOfAyahs)} ${t('verses')}`;
    trailingText = item.surah.arabicName;
  } else if (item.type === 'juz') {
    number = item.juz.number;
    title = t('juz_number', { number: item.juz.number });
    subtitle =
      typeof item.juz.startSurahId === 'number' &&
      typeof item.juz.startAyah === 'number' &&
      typeof item.juz.endSurahId === 'number' &&
      typeof item.juz.endAyah === 'number'
        ? `${t(`surah_names.${item.juz.startSurahId}`)} ${formatNumber(item.juz.startAyah)} - ${t(`surah_names.${item.juz.endSurahId}`)} ${formatNumber(item.juz.endAyah)}`
        : item.juz.surahRange;
  } else {
    number = item.pageNumber;
    title = t('page_number_label', { number: item.pageNumber });
  }

  const handlePressIn = React.useCallback(() => {
    if (item.type !== 'surah' || !settings.tajweed) return;
    primeOfflineSurahNavigationPage({ surahId: item.surah.id, settings });
  }, [item, settings]);

  const handlePress = React.useCallback(() => {
    if (navigationPending.current) return;

    if (item.type === 'juz') {
      router.push({
        pathname: '/juz/[juzNumber]',
        params: { juzNumber: String(item.juz.number) },
      });
      return;
    }

    if (item.type === 'page') {
      router.push({
        pathname: '/page/[pageNumber]',
        params: { pageNumber: String(item.pageNumber) },
      });
      return;
    }

    navigationPending.current = true;
    void (async () => {
      try {
        await warmSurahReaderBeforeNavigation({ surahId: item.surah.id, settings });
        router.push({
          pathname: '/surah/[surahId]',
          params: { surahId: String(item.surah.id) },
        });
      } catch (error) {
        navigationPending.current = false;
        console.error('Failed to open surah', error);
      }
    })();
  }, [item, settings]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatNumber(number)}, ${title}${subtitle ? `, ${subtitle}` : ''}${trailingText ? `, ${trailingText}` : ''}`}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
    >
      <View
        className="h-[72px] w-full bg-surface-navigation px-4 justify-center dark:bg-surface-navigation-dark"
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
          <View
            className="h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: numberBadgeBgColor }}
          >
            <Text
              className={item.type === 'page' ? 'text-base font-bold' : 'text-lg font-bold'}
              style={{ color: accentColor }}
            >
              {formatNumber(number)}
            </Text>
          </View>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className={item.type === 'surah' ? 'text-base font-bold' : 'text-base font-semibold'}
              style={{ color: primaryTextColor }}
            >
              {title}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs"
              style={{ color: secondaryTextColor }}
            >
              {subtitle}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            className="text-lg font-semibold"
            style={{ color: primaryTextColor }}
          >
            {trailingText}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const HomeIndexCard = React.memo(HomeIndexCardComponent);
