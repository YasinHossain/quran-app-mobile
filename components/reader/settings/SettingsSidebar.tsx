import React from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { PortalOverlay } from '@/components/motion/PortalOverlay';
import { useReducedMotion } from 'react-native-reanimated';

import {
  modalBackdropStyle,
  modalMotion,
  modalSpringConfig,
  sideSheetTransform,
  useModalTransition,
} from '@/components/motion/modalTransition';
import { useAppTheme } from '@/providers/ThemeContext';

import { SettingsSidebarContent, type PanelType } from './SettingsSidebarContent';
import { TafsirSettingsContent } from './TafsirSettingsContent';

import type { SettingsTab } from './SettingsTabToggle';

export function SettingsSidebar({
  isOpen,
  onClose,
  onAfterOpen,
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
  /** Called once the drawer has finished sliding in. */
  onAfterOpen?: () => void;
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
  const reduceMotion = useReducedMotion();
  const [isMushafManagerOpen, setIsMushafManagerOpen] = React.useState(false);
  const [isMushafManagerSettled, setIsMushafManagerSettled] = React.useState(false);
  const [isDrawerSettled, setIsDrawerSettled] = React.useState(false);
  const [hasOpenedSettingsRoot, setHasOpenedSettingsRoot] = React.useState(false);
  const sheetWidth = Math.min(390, Math.round(width * 0.92));
  const hiddenTranslateX = sheetWidth + 12;
  // The full-screen mushaf manager slides over the drawer on its own native-driven
  // layer, so opening it never resizes the drawer mid-frame.
  const mushafManagerProgress = React.useRef(new Animated.Value(0)).current;
  // Hold the tab shown while open so a reader view switch doesn't swap content mid-close.
  const displayedTabRef = React.useRef(activeTab);
  if (isOpen) displayedTabRef.current = activeTab;
  const displayedTab = displayedTabRef.current;
  const { visible, progress, onModalShow } = useModalTransition(isOpen, {
    preset: 'drawer',
    onAfterOpen: () => {
      setIsDrawerSettled(true);
      onAfterOpen?.();
    },
    onAfterClose: () => {
      setIsDrawerSettled(false);
      mushafManagerProgress.stopAnimation();
      mushafManagerProgress.setValue(0);
      setIsMushafManagerOpen(false);
      setIsMushafManagerSettled(false);
      setHasOpenedSettingsRoot(false);
      onAfterClose?.();
    },
  });

  React.useEffect(() => {
    if (!isMushafManagerOpen) return;
    if (reduceMotion) {
      mushafManagerProgress.setValue(1);
      setIsMushafManagerSettled(true);
      return;
    }
    let cancelled = false;
    // Let the freshly mounted manager commit before it starts moving.
    const frame = requestAnimationFrame(() => {
      Animated.spring(mushafManagerProgress, {
        toValue: 1,
        ...modalSpringConfig('open', modalMotion.drawer.openDuration),
        isInteraction: false,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) setIsMushafManagerSettled(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isMushafManagerOpen, mushafManagerProgress, reduceMotion]);

  const mushafManagerTransform = React.useMemo(
    () => ({
      transform: [
        {
          translateX: Animated.add(
            mushafManagerProgress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }),
            progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] })
          ),
        },
      ],
    }),
    [mushafManagerProgress, progress, width]
  );

  return (
    <PortalOverlay
      visible={visible}
      onShow={onModalShow}
      onRequestClose={onClose}
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.overlay, modalBackdropStyle(progress, isDark)]} />
        </Pressable>

        <Animated.View
          shouldRasterizeIOS
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
              {visible && initialPanel === 'tafsir' && !hasOpenedSettingsRoot ? (
                <TafsirSettingsContent
                  onClose={onClose}
                  onBack={() => setHasOpenedSettingsRoot(true)}
                />
              ) : visible ? (
                <SettingsSidebarContent
                  onClose={onClose}
                  showTafsirSetting={showTafsirSetting}
                  pageType={pageType}
                  activeTabOverride={displayedTab}
                  onTabChange={onTabChange}
                  containerWidth={sheetWidth}
                  initialPanel={hasOpenedSettingsRoot ? 'root' : initialPanel}
                  onMushafInstalled={onMushafInstalled}
                  onOpenMushafManager={() => setIsMushafManagerOpen(true)}
                  hideRootWhenSubPanel={initialPanel === 'mushaf'}
                  dataEnabled={isDrawerSettled && !isMushafManagerOpen}
                />
              ) : null}
            </View>
          </View>
        </Animated.View>

        {visible && isMushafManagerOpen ? (
          <Animated.View
            shouldRasterizeIOS
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: palette.background },
              mushafManagerTransform,
            ]}
          >
            <View
              className={isDark ? 'flex-1 dark' : 'flex-1'}
              style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
            >
              <SettingsSidebarContent
                onClose={onClose}
                showTafsirSetting={showTafsirSetting}
                pageType={pageType}
                activeTabOverride={displayedTab}
                onTabChange={onTabChange}
                containerWidth={width}
                initialPanel="mushaf"
                onMushafInstalled={onMushafInstalled}
                onSubPanelBack={onClose}
                hideRootWhenSubPanel
                dataEnabled={isMushafManagerSettled}
              />
            </View>
          </Animated.View>
        ) : null}
      </View>
    </PortalOverlay>
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
  },
  sheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    overflow: 'hidden',
  },
});
