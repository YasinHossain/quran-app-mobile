import React from 'react';
import { Animated, Easing, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

const DEFAULT_READER_HEADER_HEIGHT = 76;
const SCROLL_DELTA_THRESHOLD = 4;
const HIDE_SCROLL_DISTANCE = 26;
const SHOW_SCROLL_DISTANCE = 10;
const RESET_SCROLL_SUPPRESSION_MS = 450;

export function useCollapsibleReaderHeader() {
  const [headerHeight, setHeaderHeight] = React.useState(DEFAULT_READER_HEADER_HEIGHT);
  const hiddenProgress = React.useRef(new Animated.Value(0)).current;
  const lastScrollOffsetRef = React.useRef(0);
  const directionalScrollDistanceRef = React.useRef(0);
  const suppressScrollUntilRef = React.useRef(0);
  const isHiddenRef = React.useRef(false);

  const setHidden = React.useCallback(
    (hidden: boolean) => {
      if (isHiddenRef.current === hidden) return;
      isHiddenRef.current = hidden;
      Animated.timing(hiddenProgress, {
        toValue: hidden ? 1 : 0,
        duration: hidden ? 380 : 260,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }).start();
    },
    [hiddenProgress]
  );

  const handleHeaderLayout = React.useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight <= 0) return;
    setHeaderHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
    );
  }, []);

  const handleScrollOffset = React.useCallback(
    (offset: number) => {
      const normalizedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0);
      const previousOffset = lastScrollOffsetRef.current;
      const delta = normalizedOffset - previousOffset;
      lastScrollOffsetRef.current = normalizedOffset;

      if (Date.now() < suppressScrollUntilRef.current) {
        directionalScrollDistanceRef.current = 0;
        return;
      }

      if (normalizedOffset <= 2) {
        directionalScrollDistanceRef.current = 0;
        setHidden(false);
        return;
      }

      if (delta > SCROLL_DELTA_THRESHOLD) {
        directionalScrollDistanceRef.current =
          directionalScrollDistanceRef.current > 0
            ? directionalScrollDistanceRef.current + delta
            : delta;
        if (directionalScrollDistanceRef.current >= HIDE_SCROLL_DISTANCE) {
          setHidden(true);
        }
      } else if (delta < -SCROLL_DELTA_THRESHOLD) {
        directionalScrollDistanceRef.current =
          directionalScrollDistanceRef.current < 0
            ? directionalScrollDistanceRef.current + delta
            : delta;
        if (Math.abs(directionalScrollDistanceRef.current) >= SHOW_SCROLL_DISTANCE) {
          setHidden(false);
        }
      }
    },
    [setHidden]
  );

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [handleScrollOffset]
  );

  const showHeader = React.useCallback(() => setHidden(false), [setHidden]);

  const resetHeader = React.useCallback(() => {
    hiddenProgress.stopAnimation();
    hiddenProgress.setValue(0);
    isHiddenRef.current = false;
    lastScrollOffsetRef.current = 0;
    directionalScrollDistanceRef.current = 0;
    suppressScrollUntilRef.current = Date.now() + RESET_SCROLL_SUPPRESSION_MS;
  }, [hiddenProgress]);

  const headerAnimatedStyle = React.useMemo(
    () => ({
      transform: [
        {
          translateY: hiddenProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -headerHeight],
          }),
        },
      ],
    }),
    [headerHeight, hiddenProgress]
  );

  return {
    handleHeaderLayout,
    handleScroll,
    handleScrollOffset,
    headerAnimatedStyle,
    headerHeight,
    resetHeader,
    showHeader,
  };
}
