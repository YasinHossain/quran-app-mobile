import React from 'react';
import { router } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { SettingsSidebarContent } from '@/components/reader/settings/SettingsSidebarContent';
import { useAppTheme } from '@/providers/ThemeContext';

export default function SettingsScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark, resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View
      className={isDark ? 'flex-1 dark' : 'flex-1'}
      style={{
        backgroundColor: palette.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <SettingsSidebarContent onClose={() => router.back()} containerWidth={width} />
    </View>
  );
}
