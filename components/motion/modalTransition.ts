import React from 'react';
import { Animated, Easing } from 'react-native';

export const modalMotion = {
  overlayColor: 'rgba(0,0,0,0.55)',
  openDuration: 280,
  closeDuration: 200,
  quickOpenDuration: 240,
  quickCloseDuration: 160,
  openEasing: Easing.bezier(0.16, 1, 0.3, 1),
  closeEasing: Easing.bezier(0.16, 1, 0.3, 1),
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
  onModalShow: () => void;
} {
  const progress = React.useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  const progressValueRef = React.useRef(isOpen ? 1 : 0);
  const [visible, setVisible] = React.useState(isOpen);
  const visibleRef = React.useRef(isOpen);
  const dismissEnabledRef = React.useRef(isOpen);
  const animationTokenRef = React.useRef(0);
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
      if (afterCloseFrameRef.current !== null) {
        cancelAnimationFrame(afterCloseFrameRef.current);
        afterCloseFrameRef.current = null;
      }
    };
  }, [progress]);

  const onModalShow = React.useCallback(() => {
    if (!isOpen) return;
    if (progressValueRef.current === 1) {
      dismissEnabledRef.current = true;
      return;
    }
    const token = ++animationTokenRef.current;
    dismissEnabledRef.current = false;
    progress.setValue(0);
    progressValueRef.current = 0;

    Animated.timing(progress, {
      toValue: 1,
      duration: openDuration,
      easing: modalMotion.openEasing,
      isInteraction: false,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      progressValueRef.current = 1;
      dismissEnabledRef.current = true;
    });
  }, [isOpen, openDuration, progress]);

  React.useEffect(() => {
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
        progressValueRef.current = 0;
        visibleRef.current = true;
        setVisible(true);
      }
      return;
    }

    if (!visibleRef.current) {
      progress.setValue(0);
      progressValueRef.current = 0;
      return;
    }

    progressValueRef.current = 0;
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
  }, [closeDuration, isOpen, progress]);

  return { visible, progress, dismissEnabledRef, onModalShow };
}

export function dialogTransform(progress: Animated.Value): {
  opacity: Animated.AnimatedInterpolation<number>;
  transform: Array<
    | { translateY: Animated.AnimatedInterpolation<number> }
    | { scale: Animated.AnimatedInterpolation<number> }
  >;
} {
  return {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
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
