import React from 'react';
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

const DEFAULT_READER_HEADER_HEIGHT = 76;
const SCROLL_DELTA_THRESHOLD = 4;
const HIDE_SCROLL_DISTANCE = 26;
const SHOW_SCROLL_DISTANCE = 10;
const RESET_SCROLL_SUPPRESSION_MS = 450;
const MIN_TOP_VISIBLE_LOCK_DISTANCE = 32;

export function useCollapsibleReaderHeader() {
  const [headerHeight, setHeaderHeight] = React.useState(DEFAULT_READER_HEADER_HEIGHT);
  const [headerPointerEvents, setHeaderPointerEvents] = React.useState<'box-none' | 'none'>(
    'box-none'
  );
  const [isHeaderVisible, setIsHeaderVisible] = React.useState(true);
  const hiddenProgress = React.useRef(new Animated.Value(0)).current;
  const lastScrollOffsetRef = React.useRef(0);
  const directionalScrollDistanceRef = React.useRef(0);
  const suppressScrollUntilRef = React.useRef(0);
  const isHiddenRef = React.useRef(false);
  const isTopLockedRef = React.useRef(true);
  const topVisibleLockDistance = React.useMemo(
    () => Math.max(MIN_TOP_VISIBLE_LOCK_DISTANCE, Math.round(headerHeight * 0.65)),
    [headerHeight]
  );

  const setHidden = React.useCallback(
    (hidden: boolean) => {
      if (isHiddenRef.current === hidden) return;
      isHiddenRef.current = hidden;
      hiddenProgress.stopAnimation();
      hiddenProgress.setValue(hidden ? 1 : 0);
      setHeaderPointerEvents(hidden ? 'none' : 'box-none');
      setIsHeaderVisible(!hidden);
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

      if (normalizedOffset <= topVisibleLockDistance) {
        directionalScrollDistanceRef.current = 0;
        if (!isTopLockedRef.current || isHiddenRef.current) {
          setHidden(false);
        }
        isTopLockedRef.current = true;
        return;
      }

      isTopLockedRef.current = false;

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
    setIsHeaderVisible(true);
    isTopLockedRef.current = true;
    lastScrollOffsetRef.current = 0;
    directionalScrollDistanceRef.current = 0;
    suppressScrollUntilRef.current = Date.now() + RESET_SCROLL_SUPPRESSION_MS;
  }, [hiddenProgress]);

  const headerAnimatedStyle = React.useMemo(
    () => ({
      opacity: isHeaderVisible ? 1 : 0,
    }),
    [isHeaderVisible]
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
