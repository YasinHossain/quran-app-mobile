import React from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Bookmark, Calendar, Clock3, Pin } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { useAppTheme } from '@/providers/ThemeContext';

const SHORTCUTS = [
  { label: 'Recent', icon: Clock3, route: { pathname: '/bookmarks', params: { section: 'last-read' } } },
  { label: 'Bookmarks', icon: Bookmark, route: { pathname: '/bookmarks', params: { section: 'bookmarks' } } },
  { label: 'Pinned', icon: Pin, route: { pathname: '/bookmarks', params: { section: 'pinned' } } },
  { label: 'Planner', icon: Calendar, route: { pathname: '/planner' } },
] as const;

const tileShadow =
  Platform.OS === 'android'
    ? { elevation: 2 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };

export function HomeShortcutGrid(): React.JSX.Element {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const numColumns = 4;
  const gap = 10;
  const horizontalPadding = 24;
  const gridWidth = width > 0 ? width : 320;
  const tileWidth = React.useMemo(
    () => (gridWidth - horizontalPadding - gap * (numColumns - 1)) / numColumns,
    [gap, gridWidth, numColumns]
  );
  const iconBoxSize = React.useMemo(() => Math.min(66, Math.max(54, tileWidth - 8)), [tileWidth]);
  const iconBorderRadius = React.useMemo(() => Math.round(iconBoxSize * 0.24), [iconBoxSize]);
  const tileBackground = isDark ? '#1E293B' : '#FFFFFF';
  const tileBorder = isDark ? 'rgba(148,163,184,0.24)' : 'rgba(17,24,39,0.12)';
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
              className="items-center justify-center"
              style={({ pressed }) => [
                tileShadow,
                {
                  width: iconBoxSize,
                  height: iconBoxSize,
                  backgroundColor: tileBackground,
                  borderColor: tileBorder,
                  borderRadius: iconBorderRadius,
                  borderWidth: 1,
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
