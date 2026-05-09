import React from 'react';
import {
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
const VERSE_SCRUBBER_VISIBLE_WIDTH = 6;
const VERSE_SCRUBBER_THUMB_HEIGHT = 116;
const VERSE_SCRUBBER_SIDE_INSET = 8;

export function VerseScrubber({
  bottomInset,
  currentVerseNumber,
  onScrubEnd,
  onScrubToVerse,
  verseCount,
}: {
  bottomInset: number;
  currentVerseNumber: number;
  onScrubEnd: () => void;
  onScrubToVerse: (verseNumber: number) => void;
  verseCount: number;
}): React.JSX.Element | null {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [trackHeight, setTrackHeight] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [scrubVerseNumber, setScrubVerseNumber] = React.useState<number | null>(null);
  const lastScrubbedVerseRef = React.useRef<number | null>(null);

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

      if (lastScrubbedVerseRef.current === nextVerseNumber) return;
      lastScrubbedVerseRef.current = nextVerseNumber;
      setScrubVerseNumber(nextVerseNumber);
      onScrubToVerse(nextVerseNumber);
    },
    [isScrollable, maxThumbOffset, normalizedVerseCount, onScrubToVerse, thumbHeight]
  );

  const handleResponderGrant = React.useCallback(
    (event: GestureResponderEvent) => {
      setIsDragging(true);
      lastScrubbedVerseRef.current = null;
      scrubToLocationY(event.nativeEvent.locationY);
    },
    [scrubToLocationY]
  );

  const handleResponderMove = React.useCallback(
    (event: GestureResponderEvent) => {
      scrubToLocationY(event.nativeEvent.locationY);
    },
    [scrubToLocationY]
  );

  const finishDrag = React.useCallback(() => {
    setIsDragging(false);
    setScrubVerseNumber(null);
    lastScrubbedVerseRef.current = null;
    onScrubEnd();
  }, [onScrubEnd]);

  if (!hasScrollableVerses) return null;

  const thumbColor = palette.tint;
  const trackColor = resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.22)' : 'rgba(15, 23, 42, 0.12)';
  const labelBackground = resolvedTheme === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
  const labelBorder = resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.14)';

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: VERSE_SCRUBBER_SIDE_INSET,
        right: 0,
        bottom: Math.max(VERSE_SCRUBBER_SIDE_INSET, bottomInset + VERSE_SCRUBBER_SIDE_INSET),
        width: VERSE_SCRUBBER_WIDTH,
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
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                right: 11,
                bottom: 0,
                width: 2,
                borderRadius: 999,
                backgroundColor: trackColor,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: thumbOffset,
                right: 8,
                height: thumbHeight,
                width: VERSE_SCRUBBER_VISIBLE_WIDTH,
                borderRadius: 999,
                backgroundColor: thumbColor,
              }}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}
