import React from 'react';
import { Animated, Easing, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

const DEFAULT_READER_HEADER_HEIGHT = 76;
const SCROLL_DELTA_THRESHOLD = 4;
const HIDE_SCROLL_DISTANCE = 120;
const SHOW_SCROLL_DISTANCE = 60;
const RESET_SCROLL_SUPPRESSION_MS = 450;
const MIN_TOP_VISIBLE_LOCK_DISTANCE = 32;
const HEADER_ANIMATION_DURATION = 280;

const TOGGLE_SCROLL_SUPPRESSION_MS = 300;
// Minimum time (ms) before allowing a hide↔show reversal.
// Prevents FlashList view-recycling offset spikes from toggling the header.
const DIRECTION_COMMIT_MS = 400;
// Raw offset jumps larger than this in a single scroll event are treated as
// FlashList recycling artifacts and skipped for direction tracking.
const RECYCLING_SPIKE_THRESHOLD = 250;

export function useCollapsibleReaderHeader() {
  const [headerHeight, setHeaderHeight] = React.useState(DEFAULT_READER_HEADER_HEIGHT);
  const [headerPointerEvents, setHeaderPointerEvents] = React.useState<'box-none' | 'none'>(
    'box-none'
  );
  const hiddenProgress = React.useRef(new Animated.Value(0)).current;
  const lastScrollOffsetRef = React.useRef(0);
  const smoothedOffsetRef = React.useRef(0);
  const directionalScrollDistanceRef = React.useRef(0);
  const suppressScrollUntilRef = React.useRef(0);
  const isHiddenRef = React.useRef(false);
  const isTopLockedRef = React.useRef(true);
  const hasMeasuredRef = React.useRef(false);
  const lastDirectionChangeTimeRef = React.useRef(0);
  const topVisibleLockDistance = React.useMemo(
    () => Math.max(MIN_TOP_VISIBLE_LOCK_DISTANCE, Math.round(headerHeight * 0.65)),
    [headerHeight]
  );

  const setHidden = React.useCallback(
    (hidden: boolean) => {
      if (isHiddenRef.current === hidden) return;
      isHiddenRef.current = hidden;
      lastDirectionChangeTimeRef.current = Date.now();

      // Start the new animation without calling stopAnimation() first.
      // Animated.timing internally stops any running animation on the same
      // value and picks up from the current interpolated position, avoiding
      // the visual "snap" that an explicit stopAnimation() causes.
      Animated.timing(hiddenProgress, {
        toValue: hidden ? 1 : 0,
        duration: HEADER_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      setHeaderPointerEvents(hidden ? 'none' : 'box-none');
      suppressScrollUntilRef.current = Date.now() + TOGGLE_SCROLL_SUPPRESSION_MS;
    },
    [hiddenProgress]
  );

  const handleHeaderLayout = React.useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight <= 0) return;
    
    // Lock headerHeight after first successful measure, unless a major height shift occurs (e.g., orientation change >= 25px)
    if (!hasMeasuredRef.current || Math.abs(headerHeight - nextHeight) >= 25) {
      hasMeasuredRef.current = true;
      setHeaderHeight(nextHeight);
    }
  }, [headerHeight]);

  const handleScrollOffset = React.useCallback(
    (offset: number) => {
      const normalizedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0);
      const previousOffset = lastScrollOffsetRef.current;
      lastScrollOffsetRef.current = normalizedOffset;

      // Detect recycling-induced offset spikes: a sudden large jump indicates
      // FlashList recycled views and shifted the content offset. Re-anchor
      // smoothing without triggering any direction changes.
      const rawDelta = normalizedOffset - previousOffset;
      if (previousOffset > 0 && Math.abs(rawDelta) > RECYCLING_SPIKE_THRESHOLD) {
        smoothedOffsetRef.current = normalizedOffset;
        directionalScrollDistanceRef.current = 0;
        return;
      }

      if (smoothedOffsetRef.current === 0) {
        smoothedOffsetRef.current = normalizedOffset;
      }
      const previousSmoothed = smoothedOffsetRef.current;
      const SMOOTHING_FACTOR = 0.25;
      smoothedOffsetRef.current = previousSmoothed + (normalizedOffset - previousSmoothed) * SMOOTHING_FACTOR;
      
      const delta = smoothedOffsetRef.current - previousSmoothed;

      const now = Date.now();
      if (now < suppressScrollUntilRef.current) {
        directionalScrollDistanceRef.current = 0;
        return;
      }

      if (normalizedOffset <= topVisibleLockDistance) {
        directionalScrollDistanceRef.current = 0;
        if (!isTopLockedRef.current || isHiddenRef.current) {
          setHidden(false);
        }
        isTopLockedRef.current = true;
        return;
      }

      isTopLockedRef.current = false;

      // Prevent rapid hide↔show reversals caused by FlashList recycling
      // offset oscillations. The top-lock path above bypasses this so the
      // header always appears when the user scrolls to the very top.
      const timeSinceDirectionChange = now - lastDirectionChangeTimeRef.current;
      const commitGuardActive =
        lastDirectionChangeTimeRef.current > 0 && timeSinceDirectionChange < DIRECTION_COMMIT_MS;

      if (delta > SCROLL_DELTA_THRESHOLD) {
        directionalScrollDistanceRef.current =
          directionalScrollDistanceRef.current > 0
            ? directionalScrollDistanceRef.current + delta
            : delta;
        if (directionalScrollDistanceRef.current >= HIDE_SCROLL_DISTANCE && !commitGuardActive) {
          setHidden(true);
        }
      } else if (delta < -SCROLL_DELTA_THRESHOLD) {
        directionalScrollDistanceRef.current =
          directionalScrollDistanceRef.current < 0
            ? directionalScrollDistanceRef.current + delta
            : delta;
        if (Math.abs(directionalScrollDistanceRef.current) >= SHOW_SCROLL_DISTANCE && !commitGuardActive) {
          setHidden(false);
        }
      }
    },
    [setHidden, topVisibleLockDistance]
  );

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [handleScrollOffset]
  );

  const showHeader = React.useCallback(() => setHidden(false), [setHidden]);

  const isHidden = React.useCallback(() => isHiddenRef.current, []);

  const resetHeader = React.useCallback(() => {
    hiddenProgress.stopAnimation();
    hiddenProgress.setValue(0);
    isHiddenRef.current = false;
    setHeaderPointerEvents('box-none');
    isTopLockedRef.current = true;
    lastScrollOffsetRef.current = 0;
    smoothedOffsetRef.current = 0;
    directionalScrollDistanceRef.current = 0;
    lastDirectionChangeTimeRef.current = 0;
    suppressScrollUntilRef.current = Date.now() + RESET_SCROLL_SUPPRESSION_MS;
  }, [hiddenProgress]);

  const opacity = React.useMemo(
    () =>
      hiddenProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [hiddenProgress]
  );

  const headerAnimatedStyle = React.useMemo(
    () => ({
      opacity,
    }),
    [opacity]
  );

  return {
    handleHeaderLayout,
    handleScroll,
    handleScrollOffset,
    headerAnimatedStyle,
    headerHeight,
    headerPointerEvents,
    isHidden,
    resetHeader,
    showHeader,
  };
}
