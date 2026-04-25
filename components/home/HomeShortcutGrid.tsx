import React from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Bookmark, Calendar, Clock3, Pin } from 'lucide-react-native';
import { useRouter } from 'expo-router';

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
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      };

export function HomeShortcutGrid(): React.JSX.Element {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const numColumns = 4;
  const gap = 12;
  const horizontalPadding = 32;
  const tileWidth = React.useMemo(
    () => (width - horizontalPadding - gap * (numColumns - 1)) / numColumns,
    [gap, numColumns, width]
  );
  const iconBoxSize = React.useMemo(() => Math.min(66, Math.max(58, tileWidth - 10)), [tileWidth]);
  const tileBackground = isDark ? '#202124' : '#F1F3F5';
  const tileBorder = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(17,24,39,0.045)';
  const iconColor = isDark ? '#D7D7D7' : '#394150';
  const labelColor = isDark ? '#E5E5E5' : '#2F3744';

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
              className="items-center justify-center rounded-[18px] border"
              style={({ pressed }) => [
                tileShadow,
                {
                  width: iconBoxSize,
                  height: iconBoxSize,
                  backgroundColor: tileBackground,
                  borderColor: tileBorder,
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Icon size={27} strokeWidth={2.15} color={iconColor} />
            </Pressable>

            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              className="mt-2 text-center text-[13px] font-bold"
              style={{ color: labelColor }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
