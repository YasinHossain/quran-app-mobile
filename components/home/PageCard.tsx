import { Link } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function PageCardComponent({ pageNumber }: { pageNumber: number }): React.JSX.Element {
  const { isDark } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
  const bgColor = isDark ? '#182333' : '#FFFFFF';
  const numberBadgeBgColor = isDark ? '#334155' : '#F3F4F6';
  const primaryTextColor = isDark ? '#E7E5E4' : '#374151';
  const accentColor = isDark ? '#14B8A6' : '#0D9488';

  return (
    <Link
      href={{ pathname: '/page/[pageNumber]', params: { pageNumber: String(pageNumber) } }}
      asChild
    >
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
          <View
            className="h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: numberBadgeBgColor }}
          >
            <Text className="text-base font-bold" style={{ color: accentColor }}>
              {formatNumber(pageNumber)}
            </Text>
          </View>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className="text-base font-semibold"
              style={{ color: primaryTextColor }}
            >
              {t('page_number_label', { number: pageNumber })}
            </Text>
          </View>
        </View>
        </View>
      </Pressable>
    </Link>
  );
}

export const PageCard = React.memo(PageCardComponent);
