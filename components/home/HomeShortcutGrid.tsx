import React from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Bookmark, Calendar, Clock3, Pin } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import Colors from '@/constants/Colors';
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
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      };

export function HomeShortcutGrid(): React.JSX.Element {
  const router = useRouter();
  const { isDark, resolvedTheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const numColumns = 4;
  const gap = 10;
  const screenWidth = width > 0 ? width : 320;
  const iconBoxSize = 48; // Smaller iOS app icon size
  const itemWidth = iconBoxSize; // Match container exactly to icon size for perfect gap calculation
  const iconBorderRadius = 12; // Squircle
  const tileBackground = isDark ? '#182333' : '#FFFFFF';
  const iconColor = Colors[resolvedTheme].tint; // Emerald green
  const labelColor = isDark ? '#E5E5E5' : '#2F3744';

  return (
    <View 
      className="flex-row justify-evenly w-full"
      style={{ marginLeft: -12, width: screenWidth }} // Negate the parent's px-3 padding so justify-evenly divides the full screen
    >
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
            style={{ width: itemWidth }}
          >
            <Pressable
              onPress={handlePress}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <View
                className="items-center justify-center"
                style={[
                  Platform.OS === 'android' ? { shadowColor: '#000', elevation: 1.5 } : tileShadow,
                  {
                    width: iconBoxSize,
                    height: iconBoxSize,
                    backgroundColor: tileBackground,
                    borderRadius: iconBorderRadius,
                    borderWidth: 0, // Explicitly ensure no border
                  },
                ]}
              >
                <Icon size={24} strokeWidth={1.5} color={iconColor} />
              </View>
            </Pressable>

            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              className="mt-2 text-center text-[13px] font-bold"
              style={{ color: labelColor, width: 80 }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
