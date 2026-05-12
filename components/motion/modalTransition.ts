import React from 'react';
import { Animated, Easing } from 'react-native';

export const modalMotion = {
  overlayColor: 'rgba(0,0,0,0.55)',
  openDuration: 260,
  closeDuration: 180,
  quickOpenDuration: 220,
  quickCloseDuration: 160,
  openEasing: Easing.out(Easing.cubic),
  closeEasing: Easing.out(Easing.cubic),
} as const;

type UseModalTransitionOptions = {
  openDuration?: number;
  closeDuration?: number;
  onAfterClose?: () => void;
};

export function useModalTransition(
  isOpen: boolean,
  {
    openDuration = modalMotion.openDuration,
    closeDuration = modalMotion.closeDuration,
    onAfterClose,
  }: UseModalTransitionOptions = {}
): {
  visible: boolean;
  progress: Animated.Value;
  dismissEnabledRef: React.MutableRefObject<boolean>;
} {
  const progress = React.useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  const [visible, setVisible] = React.useState(isOpen);
  const visibleRef = React.useRef(isOpen);
  const dismissEnabledRef = React.useRef(isOpen);
  const animationTokenRef = React.useRef(0);
  const openFrameRef = React.useRef<number | null>(null);
  const afterCloseFrameRef = React.useRef<number | null>(null);
  const onAfterCloseRef = React.useRef(onAfterClose);

  React.useEffect(() => {
    onAfterCloseRef.current = onAfterClose;
  }, [onAfterClose]);

  React.useEffect(() => {
    return () => {
      animationTokenRef.current += 1;
      dismissEnabledRef.current = false;
      progress.stopAnimation();
      if (openFrameRef.current !== null) {
        cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }
      if (afterCloseFrameRef.current !== null) {
        cancelAnimationFrame(afterCloseFrameRef.current);
        afterCloseFrameRef.current = null;
      }
    };
  }, [progress]);

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    dismissEnabledRef.current = false;
    progress.stopAnimation();

    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    if (afterCloseFrameRef.current !== null) {
      cancelAnimationFrame(afterCloseFrameRef.current);
      afterCloseFrameRef.current = null;
    }

    if (isOpen) {
      if (!visibleRef.current) {
        progress.setValue(0);
        visibleRef.current = true;
        setVisible(true);
      }

      openFrameRef.current = requestAnimationFrame(() => {
        openFrameRef.current = null;
        if (animationTokenRef.current !== token) return;

        Animated.timing(progress, {
          toValue: 1,
          duration: openDuration,
          easing: modalMotion.openEasing,
          isInteraction: false,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) return;
          if (animationTokenRef.current !== token) return;
          dismissEnabledRef.current = true;
        });
      });

      return;
    }

    if (!visibleRef.current) {
      progress.setValue(0);
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: closeDuration,
      easing: modalMotion.closeEasing,
      isInteraction: false,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      visibleRef.current = false;
      setVisible(false);
      afterCloseFrameRef.current = requestAnimationFrame(() => {
        afterCloseFrameRef.current = null;
        onAfterCloseRef.current?.();
      });
    });
  }, [closeDuration, isOpen, openDuration, progress]);

  return { visible, progress, dismissEnabledRef };
}

export function dialogTransform(progress: Animated.Value): {
  opacity: Animated.AnimatedInterpolation<number>;
  transform: Array<{ scale: Animated.AnimatedInterpolation<number> } | { translateY: Animated.AnimatedInterpolation<number> }>;
} {
  return {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.98, 1],
    }),
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.965, 1],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
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
