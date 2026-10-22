import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  dialogTransform,
  fadingSurfaceProps,
  modalMotion,
  modalSpringConfig,
  useModalTransition,
} from '@/components/motion/modalTransition';
import { PortalOverlay } from '@/components/motion/PortalOverlay';
import { useAppTheme } from '@/providers/ThemeContext';

type DialogProps = {
  isOpen: boolean;
  /** Backdrop tap and Android back. Ignore the call to keep the dialog open, e.g. while busy. */
  onClose: () => void;
  children: React.ReactNode;
  /** Numeric minimum height, for dialogs whose content swaps (tabs, loading). Capped at the max. */
  minHeight?: number;
  /** Gap between the panel and the screen edges; narrower for dialogs with side-by-side fields. */
  horizontalInset?: number;
  /**
   * Build the dialog while the screen is idle and keep it mounted, hidden, while closed, so
   * opening only starts the fade. Use for dialogs another surface hands off to.
   */
  keepMounted?: boolean;
  accessibilityLabel?: string;
  /**
   * Input to focus as the entrance starts, so the keyboard rises with the dialog in one motion
   * instead of sliding in (and lifting the dialog) after it has settled.
   */
  initialFocusRef?: React.RefObject<TextInputInstance | null>;
  /** Called when the entrance has settled. */
  onAfterOpen?: () => void;
  /** Called once hidden; reset content here so the reset does not show during the exit. */
  onAfterClose?: () => void;
};

type DialogKeyboardValue = {
  /** Native-driver `translateY` the dialog applies to stay above the keyboard (zero or negative). */
  translateY: Animated.AnimatedInterpolation<number>;
  /** How far the dialog will have lifted once its keyboard motion settles. */
  liftTarget: number;
  /** The dialog's untransformed root; measure against it to get resting positions. */
  rootRef: React.RefObject<ViewInstance | null>;
};

const DialogKeyboardContext = React.createContext<DialogKeyboardValue | null>(null);

/**
 * For content that floats outside the dialog panel (in the root portal) but must move with it,
 * such as a selector list anchored to a field inside the dialog. `null` outside a dialog.
 */
export function useDialogKeyboard(): DialogKeyboardValue | null {
  return React.useContext(DialogKeyboardContext);
}

/**
 * The app's centered dialog shell: portal presentation, dimmed backdrop, fade-and-lift motion,
 * one panel style and keyboard avoidance. Dialogs supply only their content, so every dialog
 * opens, closes and fades the same way.
 */
export function Dialog({
  isOpen,
  onClose,
  children,
  minHeight,
  horizontalInset = 16,
  keepMounted = false,
  accessibilityLabel,
  initialFocusRef,
  onAfterOpen,
  onAfterClose,
}: DialogProps): React.JSX.Element {
  const { isDark } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    onAfterOpen,
    onAfterClose,
  });

  // The frame that first draws the dialog (and caches the screen behind it) can take ~70 ms on a
  // budget phone. Starting the entrance then meant it was already past halfway when first seen,
  // so the dialog jumped in; start it on the next frame so it plays from the beginning.
  const showFrameRef = React.useRef<number | null>(null);
  const handleShow = React.useCallback(() => {
    if (showFrameRef.current !== null) cancelAnimationFrame(showFrameRef.current);
    showFrameRef.current = requestAnimationFrame(() => {
      showFrameRef.current = null;
      onModalShow();
      initialFocusRef?.current?.focus();
    });
  }, [initialFocusRef, onModalShow]);
  React.useEffect(
    () => () => {
      if (showFrameRef.current !== null) cancelAnimationFrame(showFrameRef.current);
    },
    []
  );

  const handleBackdropPress = React.useCallback(() => {
    if (dismissEnabledRef.current) onClose();
  }, [dismissEnabledRef, onClose]);

  const maxHeight = Math.max(0, Math.round(windowHeight * 0.9));
  const rootRef = React.useRef<ViewInstance>(null);
  const keyboardLift = useKeyboardLift(visible, insets.bottom);
  const keyboardValue = React.useMemo(
    () => ({ translateY: keyboardLift.translateY, liftTarget: keyboardLift.liftTarget, rootRef }),
    [keyboardLift.liftTarget, keyboardLift.translateY]
  );

  return (
    <PortalOverlay
      keepMounted={keepMounted}
      visible={visible}
      onShow={handleShow}
      onRequestClose={onClose}
    >
      {/* The portal host sits outside the screen's `dark` class, so set it again here. */}
      <View
        ref={rootRef}
        className={isDark ? 'dark' : ''}
        style={[
          styles.root,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: horizontalInset,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress}>
          <Animated.View style={[styles.backdrop, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          style={[styles.keyboardArea, { transform: [{ translateY: keyboardLift.translateY }] }]}
        >
          <Animated.View
            {...fadingSurfaceProps}
            onLayout={keyboardLift.onPanelLayout}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            className="overflow-hidden rounded-2xl border border-border/40 bg-surface dark:border-border-dark/30 dark:bg-background-dark"
            style={[
              styles.surface,
              { maxHeight },
              minHeight !== undefined && { minHeight: Math.min(minHeight, maxHeight) },
              dialogTransform(progress),
            ]}
          >
            <DialogKeyboardContext.Provider value={keyboardValue}>
              {children}
            </DialogKeyboardContext.Provider>
          </Animated.View>
        </Animated.View>
      </View>
    </PortalOverlay>
  );
}

/** Matches the bottom sheets' entrance, so the dialog rises like the verse actions sheet. */
const KEYBOARD_LIFT_DURATION = modalMotion.sheet.openDuration;

/**
 * Keeps the panel centred in the space above the keyboard, never past the top of the safe area.
 * When the keyboard starts to move, the dialog springs to where it will settle on the native
 * driver, like the bottom sheets. Following the keyboard frame by frame re-laid out the dialog
 * on every frame, through Reanimated commits that pause while React commits, so the lift lagged
 * and stalled on a budget phone. A panel taller than the space above the keyboard keeps its
 * height; its bottom goes under the keyboard and its content still scrolls. A kept-mounted
 * dialog ignores the keyboard while hidden.
 */
function useKeyboardLift(
  active: boolean,
  bottomInset: number
): {
  translateY: Animated.AnimatedInterpolation<number>;
  liftTarget: number;
  onPanelLayout: (event: LayoutChangeEvent) => void;
} {
  const reduceMotion = useReducedMotion();
  const lift = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useMemo(
    () => lift.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }),
    [lift]
  );
  const [liftTarget, setLiftTarget] = React.useState(0);
  const liftTargetRef = React.useRef(0);
  const keyboardHeightRef = React.useRef(0);
  const panelTopRef = React.useRef(0);
  const optionsRef = React.useRef({ active, bottomInset, reduceMotion });
  React.useLayoutEffect(() => {
    optionsRef.current = { active, bottomInset, reduceMotion };
  });

  const settle = React.useCallback(
    (animated: boolean) => {
      const options = optionsRef.current;
      // The root already keeps the bottom safe-area inset clear, and the keyboard covers it.
      const covered = Math.max(0, keyboardHeightRef.current - options.bottomInset);
      const target = options.active ? Math.max(0, Math.min(covered / 2, panelTopRef.current)) : 0;
      if (target === liftTargetRef.current) return;
      liftTargetRef.current = target;
      setLiftTarget(target);
      lift.stopAnimation();
      if (!animated || options.reduceMotion) {
        lift.setValue(target);
        return;
      }
      Animated.spring(lift, {
        toValue: target,
        ...modalSpringConfig('open', KEYBOARD_LIFT_DURATION),
        isInteraction: false,
        useNativeDriver: true,
      }).start();
    },
    [lift]
  );

  React.useEffect(() => {
    // `willShow` carries the destination height as the keyboard starts to move.
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', (event) => {
        keyboardHeightRef.current = event.height;
        settle(true);
      }),
      KeyboardEvents.addListener('keyboardWillHide', () => {
        keyboardHeightRef.current = 0;
        settle(true);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [settle]);

  // A dialog can open over a keyboard that is already up; it resets once hidden.
  React.useLayoutEffect(() => {
    keyboardHeightRef.current = KeyboardController.isVisible() ? KeyboardController.state().height : 0;
    settle(false);
  }, [active, settle]);

  const onPanelLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      panelTopRef.current = event.nativeEvent.layout.y;
      settle(true);
    },
    [settle]
  );

  return { translateY, liftTarget, onPanelLayout };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: modalMotion.dialogBackdropColor,
  },
  keyboardArea: {
    flex: 1,
    justifyContent: 'center',
  },
  surface: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    // Shrink to the max height; dialog content scrolls inside.
    flexShrink: 1,
  },
});
