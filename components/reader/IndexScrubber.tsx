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

const INDEX_SCRUBBER_WIDTH = 18;
const INDEX_SCRUBBER_VISIBLE_WIDTH = 4;
const INDEX_SCRUBBER_THUMB_HEIGHT = 72;
const INDEX_SCRUBBER_SIDE_INSET = 8;
const INDEX_SCRUBBER_HIDE_DELAY_MS = 650;
const INDEX_SCRUBBER_THUMB_TOUCH_SLOP = 8;

export type IndexScrubberHandle = {
  show: () => void;
};

type IndexScrubberProps = {
  bottomInset: number;
  currentIndex: number;
  displayPrefix?: string;
  formatLabel?: (index: number, itemCount: number) => string;
  itemCount: number;
  onScrubStateChange?: (isScrubbing: boolean) => void;
  onScrubToIndex: (index: number, options?: { isFinal?: boolean }) => void;
  topInset?: number;
};

export const IndexScrubber = React.forwardRef<IndexScrubberHandle, IndexScrubberProps>(
  function IndexScrubber(
    {
      bottomInset,
      currentIndex,
      displayPrefix,
      formatLabel,
      itemCount,
      onScrubStateChange,
      onScrubToIndex,
      topInset = 0,
    },
    ref
  ): React.JSX.Element | null {
    const { resolvedTheme } = useAppTheme();
    const palette = Colors[resolvedTheme];
    const [trackHeight, setTrackHeight] = React.useState(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isTouchEnabled, setIsTouchEnabled] = React.useState(false);
    const [scrubIndex, setScrubIndex] = React.useState<number | null>(null);
    const lastScrubbedIndexRef = React.useRef<number | null>(null);
    const desiredIndexRef = React.useRef<number | null>(null);
    const dragStartPageYRef = React.useRef(0);
    const dragStartIndexRef = React.useRef(1);
    const scrubFrameRef = React.useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
    const isVisibleRef = React.useRef(false);
    const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const opacity = React.useRef(new Animated.Value(0)).current;

    const normalizedItemCount = Math.max(0, Math.trunc(itemCount));
    const hasScrollableItems = normalizedItemCount > 1;
    const isMeasured = trackHeight > 0;
    const isScrollable = hasScrollableItems && isMeasured;
    const thumbHeight = isScrollable
      ? clampNumber(INDEX_SCRUBBER_THUMB_HEIGHT, 48, trackHeight)
      : 0;
    const maxThumbOffset = Math.max(0, trackHeight - thumbHeight);
    const rawDisplayIndex = typeof scrubIndex === 'number' ? scrubIndex : currentIndex;
    const displayIndex = clampNumber(
      Number.isFinite(rawDisplayIndex) ? Math.trunc(rawDisplayIndex) : 1,
      1,
      Math.max(1, normalizedItemCount)
    );
    const thumbOffset =
      normalizedItemCount > 1
        ? ((displayIndex - 1) / (normalizedItemCount - 1)) * maxThumbOffset
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
        setIsTouchEnabled(false);
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }).start();
      }, INDEX_SCRUBBER_HIDE_DELAY_MS);
    }, [clearHideTimer, opacity]);

    const showTemporarily = React.useCallback(() => {
      clearHideTimer();
      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        setIsTouchEnabled(true);
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
      setScrubIndex(null);
      lastScrubbedIndexRef.current = null;
      desiredIndexRef.current = null;
      scheduleHide();
    }, [onScrubStateChange, scheduleHide]);

    const emitScrubIndex = React.useCallback(
      (index: number, isFinal = false) => {
        lastScrubbedIndexRef.current = index;
        onScrubToIndex(index, { isFinal });
      },
      [onScrubToIndex]
    );

    const runScrubFrame = React.useCallback(() => {
      scrubFrameRef.current = null;

      const targetIndex = desiredIndexRef.current;
      if (targetIndex === null) return;
      if (lastScrubbedIndexRef.current === targetIndex) return;

      emitScrubIndex(targetIndex);
    }, [emitScrubIndex]);

    const scheduleScrubFrame = React.useCallback(() => {
      if (scrubFrameRef.current !== null) return;
      scrubFrameRef.current = requestAnimationFrame(runScrubFrame);
    }, [runScrubFrame]);

    const canStartDragAtLocationY = React.useCallback(
      (locationY: number) => {
        if (!isScrollable) return;
        return (
          locationY >= thumbOffset - INDEX_SCRUBBER_THUMB_TOUCH_SLOP &&
          locationY <= thumbOffset + thumbHeight + INDEX_SCRUBBER_THUMB_TOUCH_SLOP
        );
      },
      [isScrollable, thumbHeight, thumbOffset]
    );

    const scrubToPageY = React.useCallback(
      (pageY: number) => {
        if (!isScrollable) return;

        const dragDeltaY = pageY - dragStartPageYRef.current;
        const itemDelta =
          maxThumbOffset > 0
            ? (dragDeltaY / maxThumbOffset) * Math.max(0, normalizedItemCount - 1)
            : 0;

        const nextIndex = clampNumber(
          Math.round(dragStartIndexRef.current + itemDelta),
          1,
          normalizedItemCount
        );

        if (desiredIndexRef.current === nextIndex) return;

        desiredIndexRef.current = nextIndex;
        setScrubIndex(nextIndex);
        scheduleScrubFrame();
      },
      [isScrollable, maxThumbOffset, normalizedItemCount, scheduleScrubFrame]
    );

    const handleResponderGrant = React.useCallback(
      (event: GestureResponderEvent) => {
        clearHideTimer();
        clearScrubFrame();
        isVisibleRef.current = true;
        setIsTouchEnabled(true);
        opacity.setValue(1);
        onScrubStateChange?.(true);
        setIsDragging(true);
        lastScrubbedIndexRef.current = null;
        desiredIndexRef.current = null;
        dragStartPageYRef.current = event.nativeEvent.pageY;
        dragStartIndexRef.current = displayIndex;
        setScrubIndex(displayIndex);
      },
      [clearHideTimer, clearScrubFrame, displayIndex, onScrubStateChange, opacity]
    );

    const handleResponderMove = React.useCallback(
      (event: GestureResponderEvent) => {
        scrubToPageY(event.nativeEvent.pageY);
      },
      [scrubToPageY]
    );

    const finishDrag = React.useCallback(() => {
      const targetIndex = desiredIndexRef.current;

      if (targetIndex !== null && lastScrubbedIndexRef.current !== targetIndex) {
        clearScrubFrame();
        emitScrubIndex(targetIndex, true);
      } else if (targetIndex !== null) {
        onScrubToIndex(targetIndex, { isFinal: true });
      } else {
        clearScrubFrame();
      }
      completeDrag();
    }, [clearScrubFrame, completeDrag, emitScrubIndex, onScrubToIndex]);

    if (!hasScrollableItems) return null;

    const thumbColor = palette.tint;
    const labelBackground =
      resolvedTheme === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
    const labelBorder =
      resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.14)';
    const labelText = formatLabel
      ? formatLabel(displayIndex, normalizedItemCount)
      : displayPrefix
        ? `${displayPrefix} ${displayIndex}/${normalizedItemCount}`
        : `${displayIndex}/${normalizedItemCount}`;

    return (
      <Animated.View
        pointerEvents={isTouchEnabled || isDragging ? 'box-none' : 'none'}
        style={{
          position: 'absolute',
          top: Math.max(INDEX_SCRUBBER_SIDE_INSET, topInset + INDEX_SCRUBBER_SIDE_INSET),
          right: 0,
          bottom: Math.max(INDEX_SCRUBBER_SIDE_INSET, bottomInset + INDEX_SCRUBBER_SIDE_INSET),
          width: INDEX_SCRUBBER_WIDTH,
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
              right: INDEX_SCRUBBER_WIDTH + 4,
              top: clampNumber(thumbOffset + thumbHeight / 2 - 18, 0, Math.max(0, trackHeight - 36)),
              minWidth: displayPrefix || formatLabel ? 84 : 64,
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
              {labelText}
            </Text>
          </View>
        ) : null}

        <View
          onLayout={handleTrackLayout}
          onStartShouldSetResponder={(event) =>
            Boolean(isTouchEnabled && canStartDragAtLocationY(event.nativeEvent.locationY))
          }
          onMoveShouldSetResponder={() => false}
          onResponderGrant={handleResponderGrant}
          onResponderMove={handleResponderMove}
          onResponderRelease={finishDrag}
          onResponderTerminate={finishDrag}
          onResponderTerminationRequest={() => false}
          style={{
            flex: 1,
            width: INDEX_SCRUBBER_WIDTH,
          }}
        >
          {isMeasured ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: thumbOffset,
                right: 7,
                height: thumbHeight,
                width: INDEX_SCRUBBER_VISIBLE_WIDTH,
                borderRadius: 999,
                backgroundColor: thumbColor,
              }}
            />
          ) : null}
        </View>
      </Animated.View>
    );
  }
);
