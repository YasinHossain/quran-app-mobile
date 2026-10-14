import React from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export const modalMotion = {
  overlayColor: 'rgba(0,0,0,0.55)',
  backdropColor: {
    light: 'rgba(0,0,0,0.34)',
    dark: 'rgba(0,0,0,0.46)',
  },
  dialog: { openDuration: 200, closeDuration: 140 },
  sheet: { openDuration: 240, closeDuration: 160 },
  drawer: { openDuration: 240, closeDuration: 160 },
  popover: { openDuration: 140, closeDuration: 100 },
  dialogTranslateY: 12,
} as const;

/**
 * Native-driver timing animations are not used for modal motion. React Native's Android
 * `FrameBasedAnimationDriver` samples them from a precomputed 60 fps frame table, so on 90/120 Hz
 * screens every second or third display frame repeats the previous position and the motion
 * judders even on flagship phones. Native springs are integrated against the real frame time, so
 * they advance on every display frame.
 *
 * Entrances use a critically damped spring whose midpoint matches the Material 3 standard curve
 * and which comes to rest without overshoot. Exits use a light, overshoot-clamped spring that
 * leaves at speed, like standard-accelerate, and ends exactly at the preset duration.
 */
const OPEN_SPRING_TIME_CONSTANT = 6.6;
const CLOSE_SPRING_DAMPING_RATIO = 0.3;
const CLOSE_SPRING_TIME_CONSTANT = 1.966;
const REST_DISPLACEMENT = 0.002;

export function modalSpringConfig(direction: 'open' | 'close', durationMs: number) {
  const seconds = Math.max(1, durationMs) / 1000;
  const isOpen = direction === 'open';
  const naturalFrequency = (isOpen ? OPEN_SPRING_TIME_CONSTANT : CLOSE_SPRING_TIME_CONSTANT) / seconds;
  const dampingRatio = isOpen ? 1 : CLOSE_SPRING_DAMPING_RATIO;
  return {
    mass: 1,
    stiffness: naturalFrequency * naturalFrequency,
    damping: 2 * dampingRatio * naturalFrequency,
    overshootClamping: true,
    restDisplacementThreshold: REST_DISPLACEMENT,
    restSpeedThreshold: naturalFrequency * 0.0025,
  };
}

/**
 * Animated interpolations are graph nodes. Creating a new one during a render makes React Native
 * detach the previous node from the native view and attach a replacement, which can drop or
 * snap frames when a surface re-renders mid-transition (for example when its data arrives).
 * Cache them per progress value so every render reuses the node that is already animating.
 */
const animatedStyleCache = new WeakMap<Animated.Value, Map<string, object>>();

function cachedAnimatedStyle<T extends object>(
  progress: Animated.Value,
  key: string,
  create: () => T
): T {
  let styles = animatedStyleCache.get(progress);
  if (!styles) {
    styles = new Map();
    animatedStyleCache.set(progress, styles);
  }
  let style = styles.get(key) as T | undefined;
  if (!style) {
    style = create();
    styles.set(key, style);
  }
  return style;
}

/**
 * Backdrops should support the surface motion without flashing the whole screen.
 * The panel keeps its responsive easing while the dim layer starts more gently.
 */
export function modalBackdropStyle(progress: Animated.Value, isDark: boolean) {
  return cachedAnimatedStyle(progress, `backdrop:${isDark ? 'dark' : 'light'}`, () => ({
    backgroundColor: isDark ? modalMotion.backdropColor.dark : modalMotion.backdropColor.light,
    opacity: progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.28, 1],
      extrapolate: 'clamp',
    }),
  }));
}

type UseModalTransitionOptions = {
  preset?: 'dialog' | 'sheet' | 'drawer' | 'popover';
  openDuration?: number;
  closeDuration?: number;
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
};

export function useModalTransition(
  isOpen: boolean,
  {
    preset = 'dialog',
    openDuration = modalMotion[preset].openDuration,
    closeDuration = modalMotion[preset].closeDuration,
    onAfterOpen,
    onAfterClose,
  }: UseModalTransitionOptions = {}
): {
  visible: boolean;
  progress: Animated.Value;
  dismissEnabledRef: React.MutableRefObject<boolean>;
  onModalShow: () => void;
} {
  const reduceMotion = useReducedMotion();
  // A conditionally mounted, already-open modal still needs an entrance animation.
  const progress = React.useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = React.useState(isOpen);
  const visibleRef = React.useRef(isOpen);
  const hasShownRef = React.useRef(false);
  const dismissEnabledRef = React.useRef(false);
  const animationTokenRef = React.useRef(0);
  const afterCloseFrameRef = React.useRef<number | null>(null);
  const optionsRef = React.useRef({
    isOpen, openDuration, closeDuration, reduceMotion, onAfterOpen, onAfterClose,
  });

  React.useLayoutEffect(() => {
    optionsRef.current = { isOpen, openDuration, closeDuration, reduceMotion, onAfterOpen, onAfterClose };
  });

  React.useLayoutEffect(() => {
    return () => {
      animationTokenRef.current += 1;
      dismissEnabledRef.current = false;
      progress.stopAnimation();
      if (afterCloseFrameRef.current !== null) {
        cancelAnimationFrame(afterCloseFrameRef.current);
        afterCloseFrameRef.current = null;
      }
    };
  }, [progress]);

  const startOpening = React.useCallback(() => {
    const token = ++animationTokenRef.current;
    dismissEnabledRef.current = false;
    progress.stopAnimation();

    const complete = () => {
      if (animationTokenRef.current !== token || !optionsRef.current.isOpen) return;
      dismissEnabledRef.current = true;
      optionsRef.current.onAfterOpen?.();
    };

    if (optionsRef.current.reduceMotion) {
      progress.setValue(1);
      complete();
      return;
    }

    Animated.spring(progress, {
      toValue: 1,
      ...modalSpringConfig('open', optionsRef.current.openDuration),
      isInteraction: false,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) complete();
    });
  }, [progress]);

  const onModalShow = React.useCallback(() => {
    if (!visibleRef.current || hasShownRef.current) return;
    hasShownRef.current = true;
    if (optionsRef.current.isOpen) startOpening();
  }, [startOpening]);

  React.useLayoutEffect(() => {
    const token = ++animationTokenRef.current;
    dismissEnabledRef.current = false;
    progress.stopAnimation();

    if (afterCloseFrameRef.current !== null) {
      cancelAnimationFrame(afterCloseFrameRef.current);
      afterCloseFrameRef.current = null;
    }

    if (isOpen) {
      if (!visibleRef.current) {
        progress.setValue(0);
        hasShownRef.current = false;
        visibleRef.current = true;
        setVisible(true);
      } else if (hasShownRef.current) {
        // Reversing an exit does not trigger another native Modal onShow event.
        startOpening();
      }
      return;
    }

    if (!visibleRef.current) {
      progress.setValue(0);
      return;
    }

    const complete = () => {
      if (animationTokenRef.current !== token) return;
      visibleRef.current = false;
      hasShownRef.current = false;
      setVisible(false);
      afterCloseFrameRef.current = requestAnimationFrame(() => {
        afterCloseFrameRef.current = null;
        optionsRef.current.onAfterClose?.();
      });
    };

    if (optionsRef.current.reduceMotion || optionsRef.current.closeDuration === 0) {
      progress.setValue(0);
      complete();
      return;
    }

    Animated.spring(progress, {
      toValue: 0,
      ...modalSpringConfig('close', optionsRef.current.closeDuration),
      isInteraction: false,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) complete();
    });
  }, [isOpen, progress, startOpening]);

  return { visible, progress, dismissEnabledRef, onModalShow };
}

// Lightweight motion for content-heavy dialogs: fade and a short lift, without zoom.
export function dialogTransform(progress: Animated.Value) {
  return cachedAnimatedStyle(progress, 'dialog', () => ({
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [modalMotion.dialogTranslateY, 0],
        }),
      },
    ],
  }));
}

/**
 * Pager-style slide for switching bottom tabs. `progress` is -1 for a tab before the active one,
 * 0 for the active tab and 1 for a tab after it, so the incoming tab slides in from its side while
 * the outgoing one slides away. Both scenes stay opaque and only translate, so a frame paints
 * about one screen of pixels; off-screen tabs are not drawn. Pass a negative `distance` for RTL.
 */
export function horizontalSlideSceneStyle(progress: Animated.Value, distance: number) {
  return cachedAnimatedStyle(progress, `slide-x:${distance}`, () => ({
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-distance, 0, distance],
        }),
      },
    ],
  }));
}

export function verticalSheetTransform(
  progress: Animated.Value,
  hiddenTranslateY: number
): {
  transform: Array<{ translateY: Animated.AnimatedInterpolation<number> }>;
} {
  return cachedAnimatedStyle(progress, `vertical:${hiddenTranslateY}`, () => ({
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [hiddenTranslateY, 0],
        }),
      },
    ],
  }));
}

export function sideSheetTransform(
  progress: Animated.Value,
  hiddenTranslateX: number
): {
  transform: Array<{ translateX: Animated.AnimatedInterpolation<number> }>;
} {
  return cachedAnimatedStyle(progress, `side:${hiddenTranslateX}`, () => ({
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [hiddenTranslateX, 0],
        }),
      },
    ],
  }));
}
