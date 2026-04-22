import React from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/providers/ThemeContext';

import { SettingsSidebarContent } from './SettingsSidebarContent';

import type { SettingsTab } from './SettingsTabToggle';

export function SettingsSidebar({
  isOpen,
  onClose,
  showTafsirSetting = false,
  pageType,
  activeTab,
  onTabChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  showTafsirSetting?: boolean;
  pageType?: 'verse' | 'tafsir' | 'bookmarks';
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const sheetWidth = Math.min(390, Math.round(width * 0.92));

  const translateX = React.useRef(new Animated.Value(sheetWidth)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const animationTokenRef = React.useRef(0);
  const pendingOpenRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  const startOpenAnimation = React.useCallback(() => {
    if (!isOpen) return;
    if (!visible) return;
    if (!pendingOpenRef.current) return;
    pendingOpenRef.current = false;

    const token = ++animationTokenRef.current;
    translateX.stopAnimation();
    overlayOpacity.stopAnimation();
    translateX.setValue(sheetWidth);
    overlayOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
    });
  }, [isOpen, overlayOpacity, sheetWidth, translateX, visible]);

  React.useEffect(() => {
    if (isOpen) return;
    if (visible) return;
    translateX.stopAnimation();
    overlayOpacity.stopAnimation();
    translateX.setValue(sheetWidth);
    overlayOpacity.setValue(0);
  }, [isOpen, overlayOpacity, sheetWidth, translateX, visible]);

  React.useEffect(() => {
    if (isOpen) {
      if (visible) return;
      const token = ++animationTokenRef.current;
      pendingOpenRef.current = true;
      translateX.stopAnimation();
      overlayOpacity.stopAnimation();
      translateX.setValue(sheetWidth);
      overlayOpacity.setValue(0);
      setVisible(true);
      if (animationTokenRef.current !== token) return;
      return;
    }

    if (!visible) return;
    const token = ++animationTokenRef.current;
    pendingOpenRef.current = false;
    translateX.stopAnimation();
    overlayOpacity.stopAnimation();

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: sheetWidth,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [isOpen, overlayOpacity, sheetWidth, translateX, visible]);

  React.useLayoutEffect(() => {
    startOpenAnimation();
  }, [startOpenAnimation]);

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      hardwareAccelerated
      statusBarTranslucent
      onShow={startOpenAnimation}
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
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
          <View
            style={{
              flex: 1,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
              <SettingsSidebarContent
                onClose={onClose}
                showTafsirSetting={showTafsirSetting}
                pageType={pageType}
                activeTabOverride={activeTab}
                onTabChange={onTabChange}
                containerWidth={sheetWidth}
              />
            </View>
          </View>
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
    overflow: 'hidden',
  },
});
