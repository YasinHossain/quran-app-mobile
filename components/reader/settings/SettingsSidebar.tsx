import React from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import {
  modalMotion,
  sideSheetTransform,
  useModalTransition,
} from '@/components/motion/modalTransition';
import { useAppTheme } from '@/providers/ThemeContext';

import { SettingsSidebarContent, type PanelType } from './SettingsSidebarContent';

import type { SettingsTab } from './SettingsTabToggle';

export function SettingsSidebar({
  isOpen,
  onClose,
  onAfterClose,
  showTafsirSetting = false,
  pageType,
  activeTab,
  onTabChange,
  initialPanel,
  onMushafInstalled,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  showTafsirSetting?: boolean;
  pageType?: 'verse' | 'tafsir' | 'bookmarks';
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  initialPanel?: PanelType;
  onMushafInstalled?: (packId: import('@/types').MushafPackId) => void;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark, resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const sheetWidth = Math.min(390, Math.round(width * 0.92));
  const hiddenTranslateX = sheetWidth + 12;
  const { visible, progress, onModalShow } = useModalTransition(isOpen, {
    openDuration: modalMotion.quickOpenDuration,
    closeDuration: modalMotion.quickCloseDuration,
    onAfterClose,
  });

  return (
    <Modal
      transparent
      visible={visible}
      onShow={onModalShow}
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.background,
              borderLeftColor: `${palette.border}66`,
              width: sheetWidth,
            },
            sideSheetTransform(progress, hiddenTranslateX),
          ]}
          className="border-l"
        >
          <View
            style={{
              flex: 1,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
              {visible && (
                <SettingsSidebarContent
                  onClose={onClose}
                  showTafsirSetting={showTafsirSetting}
                  pageType={pageType}
                  activeTabOverride={activeTab}
                  onTabChange={onTabChange}
                  containerWidth={sheetWidth}
                  initialPanel={initialPanel}
                  onMushafInstalled={onMushafInstalled}
                />
              )}
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
    backgroundColor: 'transparent',
    overflow: 'hidden',
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
