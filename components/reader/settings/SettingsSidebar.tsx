import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/providers/ThemeContext';

import { SettingsSidebarContent } from './SettingsSidebarContent';

export function SettingsSidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const { isDark } = useAppTheme();
  const sheetWidth = Math.min(390, Math.round(width * 0.92));

  const translateX = React.useRef(new Animated.Value(sheetWidth)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: sheetWidth,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [isOpen, overlayOpacity, sheetWidth, translateX]);

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              width: sheetWidth,
              transform: [{ translateX }],
            },
          ]}
          className="bg-surface-navigation dark:bg-surface-navigation-dark border-l border-border/30 dark:border-border-dark/20"
        >
          <SafeAreaView edges={['top', 'bottom']} className="flex-1">
            <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
              <SettingsSidebarContent onClose={onClose} />
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
});
