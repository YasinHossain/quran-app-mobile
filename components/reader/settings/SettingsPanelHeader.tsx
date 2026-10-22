import { ArrowLeft, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function SettingsPanelHeader({ title, onBack, onClose }: {
  title: string;
  onBack: () => void;
  onClose?: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View style={[styles.header, { borderBottomColor: `${palette.border}66` }]} className="border-b">
      <View style={styles.side}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.72 : 1 }]}
        >
          <ArrowLeft color={palette.text} size={18} strokeWidth={2.25} />
        </Pressable>
      </View>
      <View style={styles.title}>
        <Text className="text-lg font-semibold" numberOfLines={1} style={{ color: palette.text }}>
          {title}
        </Text>
      </View>
      <View style={styles.side}>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            hitSlop={8}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.72 : 1 }]}
          >
            <X color={palette.text} size={18} strokeWidth={2.25} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side: { width: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  button: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
