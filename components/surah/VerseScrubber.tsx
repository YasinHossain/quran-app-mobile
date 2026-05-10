import React from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const VERSE_SCRUBBER_WIDTH = 32;
const VERSE_SCRUBBER_VISIBLE_WIDTH = 4;
const VERSE_SCRUBBER_THUMB_HEIGHT = 72;
const VERSE_SCRUBBER_SIDE_INSET = 8;
const VERSE_SCRUBBER_HIDE_DELAY_MS = 650;

export type VerseScrubberHandle = {
  show: () => void;
};

type VerseScrubberProps = {
  bottomInset: number;
  currentVerseNumber: number;
  onScrubStateChange?: (isScrubbing: boolean) => void;
  onScrubToVerse: (verseNumber: number, options?: { isFinal?: boolean }) => void;
  verseCount: number;
};

export const VerseScrubber = React.forwardRef<VerseScrubberHandle, VerseScrubberProps>(function VerseScrubber({
  bottomInset,
  currentVerseNumber,
  onScrubStateChange,
  onScrubToVerse,
  verseCount,
}, ref): React.JSX.Element | null {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [trackHeight, setTrackHeight] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [scrubVerseNumber, setScrubVerseNumber] = React.useState<number | null>(null);
  const lastScrubbedVerseRef = React.useRef<number | null>(null);
  const desiredVerseNumberRef = React.useRef<number | null>(null);
  const scrubFrameRef = React.useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const isVisibleRef = React.useRef(false);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;

  const normalizedVerseCount = Math.max(0, Math.trunc(verseCount));
  const hasScrollableVerses = normalizedVerseCount > 1;
  const isMeasured = trackHeight > 0;
  const isScrollable = hasScrollableVerses && isMeasured;
  const thumbHeight = isScrollable
    ? clampNumber(VERSE_SCRUBBER_THUMB_HEIGHT, 48, trackHeight)
    : 0;
  const maxThumbOffset = Math.max(0, trackHeight - thumbHeight);
  const rawDisplayVerseNumber =
    typeof scrubVerseNumber === 'number' ? scrubVerseNumber : currentVerseNumber;
  const displayVerseNumber = clampNumber(
    Number.isFinite(rawDisplayVerseNumber) ? Math.trunc(rawDisplayVerseNumber) : 1,
    1,
    Math.max(1, normalizedVerseCount)
  );
  const thumbOffset =
    normalizedVerseCount > 1
      ? ((displayVerseNumber - 1) / (normalizedVerseCount - 1)) * maxThumbOffset
      : 0;

  const handleTrackLayout = React.useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const height = event.nativeEvent.layout.height;
      setTrackHeight((currentHeight) =>
        Math.abs(currentHeight - height) < 1 ? currentHeight : height
      );
    },
    []
  );

  const clearHideTimer = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearScrubFrame = React.useCallback(() => {
    if (scrubFrameRef.current !== null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
  }, []);

  const scheduleHide = React.useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      isVisibleRef.current = false;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
    }, VERSE_SCRUBBER_HIDE_DELAY_MS);
  }, [clearHideTimer, opacity]);

  const showTemporarily = React.useCallback(() => {
    clearHideTimer();
    if (!isVisibleRef.current) {
      isVisibleRef.current = true;
      Animated.timing(opacity, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }).start();
    }
    scheduleHide();
  }, [clearHideTimer, opacity, scheduleHide]);

  React.useImperativeHandle(ref, () => ({ show: showTemporarily }), [showTemporarily]);

  React.useEffect(
    () => () => {
      clearHideTimer();
      clearScrubFrame();
    },
    [clearHideTimer, clearScrubFrame]
  );

  const completeDrag = React.useCallback(() => {
    onScrubStateChange?.(false);
    setIsDragging(false);
    setScrubVerseNumber(null);
    lastScrubbedVerseRef.current = null;
    desiredVerseNumberRef.current = null;
    scheduleHide();
  }, [onScrubStateChange, scheduleHide]);

  const emitScrubVerse = React.useCallback(
    (verseNumber: number, isFinal = false) => {
      lastScrubbedVerseRef.current = verseNumber;
      onScrubToVerse(verseNumber, { isFinal });
    },
    [onScrubToVerse]
  );

  const runScrubFrame = React.useCallback(() => {
    scrubFrameRef.current = null;

    const targetVerseNumber = desiredVerseNumberRef.current;
    if (targetVerseNumber === null) return;
    if (lastScrubbedVerseRef.current === targetVerseNumber) return;

    emitScrubVerse(targetVerseNumber);
  }, [emitScrubVerse]);

  const scheduleScrubFrame = React.useCallback(() => {
    if (scrubFrameRef.current !== null) return;
    scrubFrameRef.current = requestAnimationFrame(runScrubFrame);
  }, [runScrubFrame]);

  const scrubToLocationY = React.useCallback(
    (locationY: number) => {
      if (!isScrollable) return;

      const nextProgress =
        maxThumbOffset > 0
          ? clampNumber(locationY - thumbHeight / 2, 0, maxThumbOffset) / maxThumbOffset
          : 0;
      const nextVerseNumber = clampNumber(
        Math.round(nextProgress * (normalizedVerseCount - 1)) + 1,
        1,
        normalizedVerseCount
      );

      if (desiredVerseNumberRef.current === nextVerseNumber) return;

      desiredVerseNumberRef.current = nextVerseNumber;
      setScrubVerseNumber(nextVerseNumber);
      scheduleScrubFrame();
    },
    [
      isScrollable,
      maxThumbOffset,
      normalizedVerseCount,
      scheduleScrubFrame,
      thumbHeight,
    ]
  );

  const handleResponderGrant = React.useCallback(
    (event: GestureResponderEvent) => {
      clearHideTimer();
      clearScrubFrame();
      isVisibleRef.current = true;
      opacity.setValue(1);
      onScrubStateChange?.(true);
      setIsDragging(true);
      lastScrubbedVerseRef.current = null;
      desiredVerseNumberRef.current = null;
      scrubToLocationY(event.nativeEvent.locationY);
    },
    [clearHideTimer, clearScrubFrame, onScrubStateChange, opacity, scrubToLocationY]
  );

  const handleResponderMove = React.useCallback(
    (event: GestureResponderEvent) => {
      scrubToLocationY(event.nativeEvent.locationY);
    },
    [scrubToLocationY]
  );

  const finishDrag = React.useCallback(() => {
    const targetVerseNumber = desiredVerseNumberRef.current;

    if (targetVerseNumber !== null && lastScrubbedVerseRef.current !== targetVerseNumber) {
      clearScrubFrame();
      emitScrubVerse(targetVerseNumber, true);
    } else if (targetVerseNumber !== null) {
      onScrubToVerse(targetVerseNumber, { isFinal: true });
    } else {
      clearScrubFrame();
    }
    completeDrag();
  }, [clearScrubFrame, completeDrag, emitScrubVerse, onScrubToVerse]);

  if (!hasScrollableVerses) return null;

  const thumbColor = palette.tint;
  const labelBackground =
    resolvedTheme === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
  const labelBorder =
    resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.14)';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: VERSE_SCRUBBER_SIDE_INSET,
        right: 0,
        bottom: Math.max(VERSE_SCRUBBER_SIDE_INSET, bottomInset + VERSE_SCRUBBER_SIDE_INSET),
        width: VERSE_SCRUBBER_WIDTH,
        opacity,
        zIndex: 40,
        ...(Platform.OS === 'android'
          ? { elevation: 40, shadowColor: 'transparent' }
          : {}),
      }}
    >
      {isDragging && isMeasured ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: VERSE_SCRUBBER_WIDTH + 4,
            top: clampNumber(thumbOffset + thumbHeight / 2 - 18, 0, Math.max(0, trackHeight - 36)),
            minWidth: 64,
            borderRadius: 8,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: labelBorder,
            backgroundColor: labelBackground,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text
            style={{
              color: palette.text,
              fontSize: 13,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {displayVerseNumber}/{normalizedVerseCount}
          </Text>
        </View>
      ) : null}

      <View
        onLayout={handleTrackLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={finishDrag}
        onResponderTerminate={finishDrag}
        onResponderTerminationRequest={() => false}
        style={{
          flex: 1,
          width: VERSE_SCRUBBER_WIDTH,
        }}
      >
        {isMeasured ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: thumbOffset,
              right: 9,
              height: thumbHeight,
              width: VERSE_SCRUBBER_VISIBLE_WIDTH,
              borderRadius: 999,
              backgroundColor: thumbColor,
            }}
          />
        ) : null}
      </View>
    </Animated.View>
  );
});
