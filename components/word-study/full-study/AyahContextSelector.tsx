import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import {
  getCollapsedAyahCapacity,
  getSelectedAyahExcerpt,
  shouldCollapseAyah,
  type AyahExcerptRange,
} from './ayahContextSelectorModel';

const COLLAPSED_LINE_COUNT = 3;
const ARABIC_FONT_SIZE = 31;
const ARABIC_LINE_HEIGHT = 54;
const COLLAPSED_EXCERPT_FILL_FACTOR = 1.25;
const EXPANSION_DURATION = 260;

export type AyahContextWord = {
  location: {
    verseKey: string;
    locationKey: string;
    wordPosition: number;
  };
  surfaceUthmani: string;
};

type RetainedExcerpt = AyahExcerptRange & {
  verseKey: string;
  capacity: number;
};

export function AyahContextSelector({
  words,
  selectedPosition,
  onSelect,
}: {
  words: readonly AyahContextWord[];
  selectedPosition: number;
  onSelect: (position: number) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const reduceMotion = Boolean(useReducedMotion());
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const effectiveFontScale = Math.max(1, fontScale);
  const collapsedHeight = COLLAPSED_LINE_COUNT * ARABIC_LINE_HEIGHT * effectiveFontScale;
  const [expanded, setExpanded] = React.useState(false);
  const [showFullContent, setShowFullContent] = React.useState(false);
  const disclosureProgress = React.useRef(new Animated.Value(0)).current;
  const viewportHeight = React.useRef(new Animated.Value(collapsedHeight)).current;
  const fullContentHeightRef = React.useRef<number | null>(null);
  const verseKey = words[0]?.location.verseKey ?? '';
  const layoutIdentity = `${verseKey}:${collapsedHeight}`;
  const previousLayoutIdentityRef = React.useRef(layoutIdentity);
  const capacity = getCollapsedAyahCapacity(
    viewportWidth,
    ARABIC_FONT_SIZE * effectiveFontScale,
    COLLAPSED_LINE_COUNT
  );
  const excerptCapacity = Math.round(capacity * COLLAPSED_EXCERPT_FILL_FACTOR);
  const excerptWords = React.useMemo(
    () => words.map((word) => ({
      wordPosition: word.location.wordPosition,
      surfaceUthmani: word.surfaceUthmani,
    })),
    [words]
  );
  const isCollapsible = shouldCollapseAyah(excerptWords, capacity);
  const desiredRange = getSelectedAyahExcerpt(
    excerptWords,
    selectedPosition,
    excerptCapacity
  );
  const [retainedExcerpt, setRetainedExcerpt] = React.useState<RetainedExcerpt>(() => ({
    ...desiredRange,
    verseKey,
    capacity: excerptCapacity,
  }));
  const retainedRangeIsUsable =
    retainedExcerpt.verseKey === verseKey
    && retainedExcerpt.capacity === excerptCapacity
    && words.slice(retainedExcerpt.startIndex, retainedExcerpt.endIndex)
      .some((word) => word.location.wordPosition === selectedPosition);
  const collapsedRange = retainedRangeIsUsable ? retainedExcerpt : {
    ...desiredRange,
    verseKey,
    capacity: excerptCapacity,
  };

  React.useEffect(() => {
    if (
      retainedExcerpt.verseKey === collapsedRange.verseKey
      && retainedExcerpt.capacity === collapsedRange.capacity
      && retainedExcerpt.startIndex === collapsedRange.startIndex
      && retainedExcerpt.endIndex === collapsedRange.endIndex
    ) return;
    setRetainedExcerpt(collapsedRange);
  }, [collapsedRange, retainedExcerpt]);

  React.useEffect(() => {
    if (previousLayoutIdentityRef.current === layoutIdentity) return;
    previousLayoutIdentityRef.current = layoutIdentity;
    setExpanded(false);
    setShowFullContent(false);
    disclosureProgress.setValue(0);
    viewportHeight.setValue(collapsedHeight);
    fullContentHeightRef.current = null;
  }, [collapsedHeight, disclosureProgress, layoutIdentity, viewportHeight]);

  const animateViewportHeight = React.useCallback((height: number, onFinished?: () => void) => {
    viewportHeight.stopAnimation();
    if (reduceMotion) {
      viewportHeight.setValue(height);
      onFinished?.();
      return;
    }
    Animated.timing(viewportHeight, {
      toValue: height,
      duration: EXPANSION_DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onFinished?.();
    });
  }, [reduceMotion, viewportHeight]);

  const handleFullContentLayout = React.useCallback((event: LayoutChangeEvent) => {
    if (!showFullContent) return;
    const measuredHeight = Math.max(collapsedHeight, event.nativeEvent.layout.height);
    const heightChanged = fullContentHeightRef.current === null
      || Math.abs(fullContentHeightRef.current - measuredHeight) >= 0.5;
    fullContentHeightRef.current = measuredHeight;
    if (expanded && heightChanged) animateViewportHeight(measuredHeight);
  }, [animateViewportHeight, collapsedHeight, expanded, showFullContent]);

  const handleToggleExpanded = React.useCallback(() => {
    const nextExpanded = !expanded;
    disclosureProgress.stopAnimation();
    if (reduceMotion) {
      disclosureProgress.setValue(nextExpanded ? 1 : 0);
    } else {
      Animated.timing(disclosureProgress, {
        toValue: nextExpanded ? 1 : 0,
        duration: EXPANSION_DURATION,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    if (nextExpanded) {
      setExpanded(true);
      setShowFullContent(true);
      const knownFullHeight = fullContentHeightRef.current;
      if (knownFullHeight !== null) animateViewportHeight(knownFullHeight);
    } else {
      setExpanded(false);
      animateViewportHeight(collapsedHeight, () => setShowFullContent(false));
    }
  }, [animateViewportHeight, collapsedHeight, disclosureProgress, expanded, reduceMotion]);

  const disclosureIconStyle = {
    transform: [{
      rotate: disclosureProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
      }),
    }],
  };

  const displayedWords = isCollapsible && !showFullContent
    ? words.slice(collapsedRange.startIndex, collapsedRange.endIndex)
    : words;
  const hasEarlierWords = isCollapsible && !showFullContent && collapsedRange.startIndex > 0;
  const hasLaterWords = isCollapsible && !showFullContent && collapsedRange.endIndex < words.length;
  const selectedIndex = words.findIndex(
    (word) => word.location.wordPosition === selectedPosition
  );
  const previousPosition = words[selectedIndex - 1]?.location.wordPosition;
  const nextPosition = words[selectedIndex + 1]?.location.wordPosition;

  return (
    <View style={styles.shell}>
      <Animated.View
        style={[
          styles.textViewport,
          isCollapsible ? { height: viewportHeight, overflow: 'hidden' } : null,
        ]}
      >
        <View>
          <Text
            accessibilityLabel="Ayah words"
            numberOfLines={isCollapsible && !showFullContent ? COLLAPSED_LINE_COUNT : undefined}
            style={[styles.ayahText, { color: palette.text }]}
          >
            {hasEarlierWords ? <Text style={{ color: palette.muted }}>… </Text> : null}
            {displayedWords.map((word, index) => {
            const position = word.location.wordPosition;
            const selected = position === selectedPosition;
            const accessibilityActions = selected
              ? [
                  ...(previousPosition ? [{ name: 'decrement' as const, label: 'Previous word' }] : []),
                  ...(nextPosition ? [{ name: 'increment' as const, label: 'Next word' }] : []),
                ]
              : undefined;
            return (
              <Text
                key={word.location.locationKey}
                accessibilityRole="button"
                accessibilityLabel={`Word ${position} of ${words.length}, ${word.surfaceUthmani}`}
                accessibilityHint={selected ? 'Selected for analysis' : 'Selects this word for analysis'}
                accessibilityState={{ selected }}
                accessibilityActions={accessibilityActions}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'decrement' && previousPosition) {
                    onSelect(previousPosition);
                  } else if (event.nativeEvent.actionName === 'increment' && nextPosition) {
                    onSelect(nextPosition);
                  }
                }}
                onPress={() => onSelect(position)}
                style={{ color: selected ? palette.accent : palette.text }}
              >
                {word.surfaceUthmani}
                {index < displayedWords.length - 1 ? ' ' : ''}
              </Text>
            );
            })}
            {hasLaterWords ? <Text style={{ color: palette.muted }}> …</Text> : null}
          </Text>
        </View>
      </Animated.View>

      {isCollapsible && showFullContent && fullContentHeightRef.current === null ? (
        <View
          collapsable={false}
          pointerEvents="none"
          onLayout={handleFullContentLayout}
          style={styles.fullContentMeasurement}
        >
          <Text style={styles.ayahText}>
            {words.map((word) => word.surfaceUthmani).join(' ')}
          </Text>
        </View>
      ) : null}

      {isCollapsible ? (
        <View style={styles.disclosureRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse ayah context' : 'Expand full ayah'}
            accessibilityState={{ expanded }}
            hitSlop={8}
            onPress={handleToggleExpanded}
            style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Animated.View style={disclosureIconStyle}>
              <ChevronDown color={palette.accent} size={28} strokeWidth={2.2} />
            </Animated.View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    paddingVertical: 2,
    overflow: 'hidden',
  },
  textViewport: {
    width: '100%',
    justifyContent: 'center',
  },
  ayahText: {
    width: '100%',
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: ARABIC_FONT_SIZE,
    lineHeight: ARABIC_LINE_HEIGHT,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  fullContentMeasurement: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  disclosureRow: {
    width: '100%',
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  disclosure: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
