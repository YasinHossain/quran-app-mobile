import { Link } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export type JuzSummary = {
  number: number;
  surahRange: string;
  startSurahId?: number;
  startAyah?: number;
  endSurahId?: number;
  endAyah?: number;
};

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function JuzCardComponent({ juz }: { juz: JuzSummary }): React.JSX.Element {
  const { isDark } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
  const bgColor = isDark ? '#182333' : '#FFFFFF';
  const juzLabel = t('juz_number', { number: juz.number });
  const surahRange =
    typeof juz.startSurahId === 'number' &&
    typeof juz.startAyah === 'number' &&
    typeof juz.endSurahId === 'number' &&
    typeof juz.endAyah === 'number'
      ? `${t(`surah_names.${juz.startSurahId}`)} ${formatNumber(juz.startAyah)} - ${t(`surah_names.${juz.endSurahId}`)} ${formatNumber(juz.endAyah)}`
      : juz.surahRange;

  return (
    <Link href={{ pathname: '/juz/[juzNumber]', params: { juzNumber: String(juz.number) } }} asChild>
      <Pressable
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
            <Text className="text-lg font-bold text-accent dark:text-accent-dark">
              {formatNumber(juz.number)}
            </Text>
          </View>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-content-primary dark:text-content-primary-dark"
            >
              {juzLabel}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-content-secondary dark:text-content-secondary-dark"
            >
              {surahRange}
            </Text>
          </View>
        </View>
        </View>
      </Pressable>
    </Link>
  );
}

export const JuzCard = React.memo(JuzCardComponent);
