import React from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Bookmark, Calendar, Clock3, Pin } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

const SHORTCUTS = [
  { label: 'Recent', icon: Clock3, route: { pathname: '/bookmarks', params: { section: 'last-read' } } },
  { label: 'Bookmarks', icon: Bookmark, route: { pathname: '/bookmarks', params: { section: 'bookmarks' } } },
  { label: 'Planner', icon: Calendar, route: { pathname: '/planner' } },
  { label: 'Pinned', icon: Pin, route: { pathname: '/bookmarks', params: { section: 'pinned' } } },
] as const;

const tileShadow =
  Platform.OS === 'android'
    ? { elevation: 2 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      };

export function HomeShortcutGrid(): React.JSX.Element {
  const router = useRouter();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { width } = useWindowDimensions();
  const numColumns = 4;
  const gap = 10;
  const horizontalPadding = 32;
  const tileWidth = React.useMemo(
    () => (width - horizontalPadding - gap * (numColumns - 1)) / numColumns,
    [gap, numColumns, width]
  );

  return (
    <View className="flex-row flex-wrap">
      {SHORTCUTS.map(({ label, icon: Icon, route }, index) => {
        const isLastInRow = (index + 1) % numColumns === 0;
        const handlePress = (): void => {
          if ('params' in route) {
            router.push({ pathname: route.pathname, params: route.params });
            return;
          }
          router.push(route.pathname);
        };

        return (
          <View
            key={label}
            className="mb-3 items-center"
            style={{ marginRight: isLastInRow ? 0 : gap, width: tileWidth }}
          >
            <Pressable
              onPress={handlePress}
              accessibilityRole="button"
              accessibilityLabel={label}
              className={[
                'h-[78px] w-full items-center justify-center rounded-[20px] border border-border/15',
                'bg-surface-navigation dark:border-border-dark/15 dark:bg-surface-navigation-dark',
              ].join(' ')}
              style={({ pressed }) => [
                tileShadow,
                {
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Icon size={24} strokeWidth={2.15} color={palette.text} />
            </Pressable>

            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              className="mt-2 text-center text-[12px] font-semibold text-content-primary dark:text-content-primary-dark"
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
