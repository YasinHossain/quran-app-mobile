import React from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export const modalMotion = {
  overlayColor: 'rgba(0,0,0,0.55)',
  dialog: { openDuration: 200, closeDuration: 140 },
  sheet: { openDuration: 240, closeDuration: 160 },
  drawer: { openDuration: 240, closeDuration: 160 },
  popover: { openDuration: 140, closeDuration: 100 },
  dialogTranslateY: 12,
  openEasing: Easing.bezier(0.16, 1, 0.3, 1),
  closeEasing: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

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

    Animated.timing(progress, {
      toValue: 1,
      duration: optionsRef.current.openDuration,
      easing: modalMotion.openEasing,
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

    Animated.timing(progress, {
      toValue: 0,
      duration: optionsRef.current.closeDuration,
      easing: modalMotion.closeEasing,
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
  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [modalMotion.dialogTranslateY, 0],
        }),
      },
    ],
  };
}

export function verticalSheetTransform(
  progress: Animated.Value,
  hiddenTranslateY: number
): {
  transform: Array<{ translateY: Animated.AnimatedInterpolation<number> }>;
} {
  return {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [hiddenTranslateY, 0],
        }),
      },
    ],
  };
}

export function sideSheetTransform(
  progress: Animated.Value,
  hiddenTranslateX: number
): {
  transform: Array<{ translateX: Animated.AnimatedInterpolation<number> }>;
} {
  return {
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [hiddenTranslateX, 0],
        }),
      },
    ],
  };
}
