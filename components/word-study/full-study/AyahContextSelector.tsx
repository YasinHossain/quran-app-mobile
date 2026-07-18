import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import type { WordAnalysis } from '@/src/core/domain/word-study';

import {
  getCollapsedAyahWindow,
  type AyahWordLayout,
} from './ayahContextSelectorModel';

const COLLAPSED_LINE_COUNT = 3;
const ESTIMATED_COLLAPSED_HEIGHT = 166;
const WORD_COLOR_DURATION = 150;
const VIEWPORT_HEIGHT_DURATION = 240;
const RECENTER_MOTION_DURATION = 300;

type MeasuredWord = AyahWordLayout;

export function AyahContextSelector({
  words,
  selectedPosition,
  onSelect,
}: {
  words: readonly WordAnalysis[];
  selectedPosition: number;
  onSelect: (position: number) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const reduceMotion = Boolean(useReducedMotion());
  const [expanded, setExpanded] = React.useState(false);
  const [contentWidth, setContentWidth] = React.useState(0);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const layoutsRef = React.useRef(new Map<number, MeasuredWord>());
  const measurementFrameRef = React.useRef<number | null>(null);
  const viewportHeight = React.useRef(new Animated.Value(0)).current;
  const contentTranslateY = React.useRef(new Animated.Value(0)).current;
  const viewportAnimationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const viewportInitializedRef = React.useRef(false);
  const viewportHeightTargetRef = React.useRef<number | null>(null);
  const verseKey = words[0]?.location.verseKey ?? '';
  const previousVerseKeyRef = React.useRef(verseKey);
  const scheduleLayoutUpdate = React.useCallback(() => {
    if (measurementFrameRef.current !== null) return;
    measurementFrameRef.current = requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      setLayoutVersion((value) => value + 1);
    });
  }, []);

  React.useEffect(() => {
    if (previousVerseKeyRef.current === verseKey) return;
    previousVerseKeyRef.current = verseKey;
    setExpanded(false);
    layoutsRef.current.clear();
    viewportAnimationRef.current?.stop();
    viewportInitializedRef.current = false;
    viewportHeightTargetRef.current = null;
    scheduleLayoutUpdate();
  }, [scheduleLayoutUpdate, verseKey]);

  React.useEffect(() => {
    return () => {
      if (measurementFrameRef.current !== null) {
        cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }
      viewportAnimationRef.current?.stop();
    };
  }, []);

  const layouts = React.useMemo(
    () => [...layoutsRef.current.values()],
    [layoutVersion]
  );
  const allWordsMeasured = words.length > 0 && layouts.length === words.length;
  const collapsedWindow = allWordsMeasured
    ? getCollapsedAyahWindow(layouts, selectedPosition, COLLAPSED_LINE_COUNT)
    : null;
  const measurementPending = !allWordsMeasured;
  const isCollapsible = collapsedWindow !== null;
  const isCollapsed = isCollapsible && !expanded;
  const fullContentHeight = layouts.reduce(
    (maximum, layout) => Math.max(maximum, layout.y + layout.height),
    0
  );

  React.useLayoutEffect(() => {
    viewportAnimationRef.current?.stop();
    if (!collapsedWindow || fullContentHeight <= 0) {
      viewportInitializedRef.current = false;
      viewportHeightTargetRef.current = null;
      return;
    }

    const targetHeight = expanded ? fullContentHeight : collapsedWindow.height;
    const targetTranslateY = expanded ? 0 : -collapsedWindow.startY;
    const heightChanged = viewportHeightTargetRef.current === null
      || Math.abs(viewportHeightTargetRef.current - targetHeight) >= 0.5;
    viewportHeightTargetRef.current = targetHeight;
    if (reduceMotion || !viewportInitializedRef.current) {
      viewportHeight.setValue(targetHeight);
      contentTranslateY.setValue(targetTranslateY);
      viewportInitializedRef.current = true;
      return;
    }

    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(contentTranslateY, {
        toValue: targetTranslateY,
        duration: RECENTER_MOTION_DURATION,
        easing: Easing.inOut(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    ];
    if (heightChanged) {
      animations.push(Animated.timing(viewportHeight, {
        toValue: targetHeight,
        duration: VIEWPORT_HEIGHT_DURATION,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: false,
      }));
    }
    const animation = Animated.parallel(animations);
    viewportAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (finished && viewportAnimationRef.current === animation) {
        viewportAnimationRef.current = null;
      }
    });
  }, [
    collapsedWindow?.height,
    collapsedWindow?.startY,
    contentTranslateY,
    expanded,
    fullContentHeight,
    reduceMotion,
    viewportHeight,
  ]);

  const handleContainerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (Math.abs(nextWidth - contentWidth) < 1) return;
    setContentWidth(nextWidth);
    if (contentWidth === 0) return;
    layoutsRef.current.clear();
    viewportAnimationRef.current?.stop();
    viewportInitializedRef.current = false;
    viewportHeightTargetRef.current = null;
    scheduleLayoutUpdate();
  }, [contentWidth, scheduleLayoutUpdate]);

  const handleWordLayout = React.useCallback((position: number, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    const previous = layoutsRef.current.get(position);
    if (
      previous
      && Math.abs(previous.x - x) < 0.5
      && Math.abs(previous.y - y) < 0.5
      && Math.abs(previous.width - width) < 0.5
      && Math.abs(previous.height - height) < 0.5
    ) {
      return;
    }
    layoutsRef.current.set(position, { position, x, y, width, height });
    scheduleLayoutUpdate();
  }, [scheduleLayoutUpdate]);

  const selectedIndex = words.findIndex(
    (word) => word.location.wordPosition === selectedPosition
  );
  const previousPosition = words[selectedIndex - 1]?.location.wordPosition;
  const nextPosition = words[selectedIndex + 1]?.location.wordPosition;

  return (
    <View style={styles.shell}>
      <Animated.View
        onLayout={handleContainerLayout}
        style={[
          styles.viewport,
          isCollapsible
            ? { height: viewportHeight }
            : measurementPending
              ? { height: ESTIMATED_COLLAPSED_HEIGHT }
              : null,
        ]}
      >
        <Animated.View
          accessibilityLabel="Ayah words"
          accessibilityElementsHidden={measurementPending}
          importantForAccessibility={measurementPending ? 'no-hide-descendants' : 'auto'}
          style={[
            styles.words,
            isCollapsible ? { transform: [{ translateY: contentTranslateY }] } : null,
            measurementPending ? styles.wordsMeasuring : null,
          ]}
        >
          {words.map((word) => {
            const position = word.location.wordPosition;
            const selected = position === selectedPosition;
            const layout = layoutsRef.current.get(position);
            const hiddenByCollapse = Boolean(
              isCollapsed
              && collapsedWindow
              && layout
              && (
                layout.y + layout.height <= collapsedWindow.startY
                || layout.y >= collapsedWindow.startY + collapsedWindow.height
              )
            );
            return (
              <AyahWord
                key={word.location.locationKey}
                word={word}
                total={words.length}
                selected={selected}
                hiddenByCollapse={hiddenByCollapse}
                previousPosition={previousPosition}
                nextPosition={nextPosition}
                palette={palette}
                reduceMotion={reduceMotion}
                onLayout={(event) => handleWordLayout(position, event)}
                onSelect={onSelect}
              />
            );
          })}
        </Animated.View>
      </Animated.View>
      {isCollapsible ? (
        <View style={styles.disclosureRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse ayah context' : 'Expand full ayah'}
            accessibilityState={{ expanded }}
            hitSlop={8}
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.55 : 1 }]}
          >
            {expanded ? (
              <ChevronUp color={palette.accent} size={28} strokeWidth={2.2} />
            ) : (
              <ChevronDown color={palette.accent} size={28} strokeWidth={2.2} />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function AyahWord({
  word,
  total,
  selected,
  hiddenByCollapse,
  previousPosition,
  nextPosition,
  palette,
  reduceMotion,
  onLayout,
  onSelect,
}: {
  word: WordAnalysis;
  total: number;
  selected: boolean;
  hiddenByCollapse: boolean;
  previousPosition?: number;
  nextPosition?: number;
  palette: (typeof Colors)['light'];
  reduceMotion: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onSelect: (position: number) => void;
}): React.JSX.Element {
  const position = word.location.wordPosition;
  const selectionProgress = React.useRef(new Animated.Value(selected ? 1 : 0)).current;

  React.useEffect(() => {
    selectionProgress.stopAnimation();
    if (reduceMotion) {
      selectionProgress.setValue(selected ? 1 : 0);
      return;
    }
    Animated.timing(selectionProgress, {
      toValue: selected ? 1 : 0,
      duration: WORD_COLOR_DURATION,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: false,
    }).start();
  }, [reduceMotion, selected, selectionProgress]);

  const accessibilityActions = selected
    ? [
        ...(previousPosition ? [{ name: 'decrement' as const, label: 'Previous word' }] : []),
        ...(nextPosition ? [{ name: 'increment' as const, label: 'Next word' }] : []),
      ]
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Word ${position} of ${total}, ${word.surfaceUthmani}`}
      accessibilityHint={selected ? 'Selected for analysis' : 'Selects this word for analysis'}
      accessibilityState={{ selected }}
      accessibilityActions={accessibilityActions}
      accessibilityElementsHidden={hiddenByCollapse}
      importantForAccessibility={hiddenByCollapse ? 'no-hide-descendants' : 'yes'}
      hitSlop={4}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'decrement' && previousPosition) {
          onSelect(previousPosition);
        } else if (event.nativeEvent.actionName === 'increment' && nextPosition) {
          onSelect(nextPosition);
        }
      }}
      onLayout={onLayout}
      onPress={() => onSelect(position)}
      style={({ pressed }) => [styles.wordTarget, { opacity: pressed ? 0.62 : 1 }]}
    >
      <Animated.Text
        style={[
          styles.arabic,
          {
            color: selectionProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [palette.text, palette.accent],
            }),
          },
        ]}
      >
        {word.surfaceUthmani}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    paddingVertical: 2,
    overflow: 'hidden',
  },
  viewport: { overflow: 'hidden' },
  words: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    columnGap: 7,
    rowGap: 2,
  },
  wordsMeasuring: { opacity: 0 },
  wordTarget: {
    minWidth: 36,
    minHeight: 54,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arabic: {
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: 31,
    lineHeight: 46,
    writingDirection: 'rtl',
    textAlign: 'center',
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
