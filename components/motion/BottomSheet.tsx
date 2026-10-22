import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  modalBackdropStyle,
  useModalTransition,
  verticalSheetTransform,
} from '@/components/motion/modalTransition';
import { PortalOverlay } from '@/components/motion/PortalOverlay';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

type BottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Fixed numeric sheet height (also its min and max). Omit it to size the sheet to its content. */
  height?: number;
  maxHeight?: number;
  maxWidth?: number;
  backgroundColor?: string;
  /** Override the close duration, e.g. `0` when an action hands off to another surface. */
  closeDuration?: number;
  /**
   * Build the sheet while the screen is idle and keep it mounted, hidden, while closed, so
   * opening only reveals it and starts the native-driver slide. Disable only for heavy sheets.
   */
  keepMounted?: boolean;
  accessibilityLabel?: string;
  backdropAccessibilityLabel?: string;
  /** Called when the slide starts. */
  onShow?: () => void;
  /** Called when the slide has settled. Defer heavy content swaps until this point. */
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
};

/**
 * The app's bottom sheet shell: portal presentation, dimmed backdrop, native-driver slide and
 * bottom safe area. Sheets supply only their content, so every bottom sheet shares one motion.
 */
export function BottomSheet({
  isOpen,
  onClose,
  children,
  height,
  maxHeight,
  maxWidth = 640,
  backgroundColor,
  closeDuration,
  keepMounted = true,
  accessibilityLabel,
  backdropAccessibilityLabel,
  onShow,
  onAfterOpen,
  onAfterClose,
}: BottomSheetProps): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const latestHeightRef = React.useRef<number | null>(null);
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);

  const handleAfterClose = React.useCallback(() => {
    // Adopt a height measured while open (e.g. on a first, cold open) for the next slide.
    if (latestHeightRef.current !== null) setMeasuredHeight(latestHeightRef.current);
    onAfterClose?.();
  }, [onAfterClose]);

  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    preset: 'sheet',
    closeDuration,
    onAfterOpen,
    onAfterClose: handleAfterClose,
  });

  const handleShow = React.useCallback(() => {
    onModalShow();
    onShow?.();
  }, [onModalShow, onShow]);

  const handleOverlayPress = React.useCallback(() => {
    if (dismissEnabledRef.current) onClose();
  }, [dismissEnabledRef, onClose]);

  const handleSheetLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.ceil(event.nativeEvent.layout.height);
      latestHeightRef.current = nextHeight;
      // Changing the travel distance mid-slide would swap the animated node; wait until hidden.
      if (!visible) setMeasuredHeight(nextHeight);
    },
    [visible]
  );

  // Travel exactly the sheet's own height, so the slide starts moving on its first frame.
  const hiddenTranslateY = Math.max(
    1,
    height ?? measuredHeight ?? Math.max(500, Math.round(windowHeight * 0.65))
  );
  const resolvedMaxHeight = maxHeight ?? Math.max(0, Math.round(windowHeight * 0.9));
  const sheetBackground = backgroundColor ?? (isDark ? palette.background : palette.surface);

  return (
    <PortalOverlay
      keepMounted={keepMounted}
      visible={visible}
      onShow={handleShow}
      onRequestClose={onClose}
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable
          accessibilityLabel={backdropAccessibilityLabel}
          accessibilityRole={backdropAccessibilityLabel ? 'button' : undefined}
          style={StyleSheet.absoluteFill}
          onPress={handleOverlayPress}
        >
          <Animated.View style={[styles.overlay, modalBackdropStyle(progress, isDark)]} />
        </Pressable>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          onLayout={handleSheetLayout}
          style={[
            styles.sheet,
            {
              maxWidth,
              maxHeight: resolvedMaxHeight,
              backgroundColor: sheetBackground,
            },
            height !== undefined && { height, minHeight: height, maxHeight: height },
            verticalSheetTransform(progress, hiddenTranslateY),
          ]}
        >
          <SafeAreaView
            edges={['bottom']}
            style={height !== undefined ? styles.fill : undefined}
          >
            {children}
          </SafeAreaView>
        </Animated.View>
      </View>
    </PortalOverlay>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
  },
  sheet: {
    width: '100%',
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // No overflow clipping: a rounded clip path is re-rasterized for the whole sheet every frame
    // of the slide. Sheet content stays inside its padding, so nothing reaches the corners.
  },
  fill: {
    flex: 1,
  },
});
