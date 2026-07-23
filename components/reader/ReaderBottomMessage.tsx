import React from 'react';
import { Info } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function ReaderBottomMessage({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[styles.position, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.message,
          {
            backgroundColor: resolvedTheme === 'dark' ? '#E8F3EC' : '#173F30',
          },
        ]}
      >
        <Info color={resolvedTheme === 'dark' ? '#173F30' : '#FFFFFF'} size={18} strokeWidth={2.4} />
        <Text
          style={[
            styles.text,
            { color: resolvedTheme === 'dark' ? '#173F30' : palette.onAccent },
          ]}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: { left: 18, position: 'absolute', right: 18, zIndex: 100 },
  message: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    maxWidth: 440,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 7 },
        shadowOpacity: 0.18,
        shadowRadius: 15,
      },
      android: { elevation: 7 },
    }),
  },
  text: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
});
