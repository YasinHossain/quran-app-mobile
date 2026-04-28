import { Link } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/providers/ThemeContext';

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: '#000', elevation: 1 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function PageCardComponent({ pageNumber }: { pageNumber: number }): React.JSX.Element {
  const { isDark } = useAppTheme();
  const bgColor = isDark ? '#182333' : '#FFFFFF';

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
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-number-badge dark:bg-number-badge-dark">
            <Text className="text-base font-bold text-accent dark:text-accent-dark">
              {pageNumber}
            </Text>
          </View>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-content-primary dark:text-content-primary-dark"
            >
              {`Page ${pageNumber}`}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-content-secondary dark:text-content-secondary-dark"
            >
              Open mushaf reader
            </Text>
          </View>
        </View>
        </View>
      </Pressable>
    </Link>
  );
}

export const PageCard = React.memo(PageCardComponent);
