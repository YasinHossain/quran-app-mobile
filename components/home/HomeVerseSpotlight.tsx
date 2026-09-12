import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import {
  AppState,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import {
  buildHomeSpotlightPreviewText,
  CANONICAL_VERSE_KEYS,
  CanonicalVerse,
  getBundledFallbackVerse,
  getCanonicalVerse,
  getHomeSpotlightSwipeNavigation,
  getVerseReaderTarget,
  HomeVerseSpotlightController,
  resolveSpotlightVerse,
  SpotlightVerseContent,
  VerseKey,
} from '@/lib/verse-spotlight';
import { hydrateHomeSpotlightState, persistHomeSpotlightState } from '@/lib/verse-spotlight/homeStateStorage';
import { useAppTheme } from '@/providers/ThemeContext';
import { useSettings } from '@/providers/SettingsContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { container } from '@/src/core/infrastructure/di/container';

const SPOTLIGHT_HEIGHT = 210;
const spotlightContentCache = new Map<string, SpotlightVerseContent>();

// Expo Router may remount the home list's intro row (for example when a
// clipped FlatList cell is brought back on screen). Keep the controller alive
// so the already-resolved verse can be painted immediately instead of showing
// the loading skeleton on every return to Home.
let sharedHomeController: HomeVerseSpotlightController | null = null;

function getSharedHomeController(
  requestedTranslationId: number
): HomeVerseSpotlightController {
  if (sharedHomeController) return sharedHomeController;

  sharedHomeController = new HomeVerseSpotlightController(requestedTranslationId, {
    hydrate: hydrateHomeSpotlightState,
    persist: persistHomeSpotlightState,
    resolve: ({ requestedTranslationId: translationId, verseKey }) =>
      resolveSpotlightVerse({
        requestedTranslationId: translationId,
        verseKey,
        downloadIndex: container.getDownloadIndexRepository(),
        offlineTranslations: container.getTranslationOfflineStore(),
      }),
  });

  return sharedHomeController;
}

function HomeVerseSpotlightSkeleton(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];

  return (
    <View
      accessibilityLabel={t('loading_verse_spotlight', { fallback: 'Loading verse spotlight' })}
      accessibilityRole="progressbar"
      style={styles.skeleton}
    >
      <View style={[styles.skeletonLine, { backgroundColor: palette.interactive, width: '42%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: palette.interactive, width: '92%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: palette.interactive, width: '76%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: palette.interactive, width: '30%' }]} />
    </View>
  );
}

function VerseSlideContent({
  verse,
  surahName,
  previewText,
  palette,
  settings,
  localizeDigits,
}: {
  verse: CanonicalVerse;
  surahName: string;
  previewText: string;
  palette: (typeof Colors)[keyof typeof Colors];
  settings: { translationFontSize: number };
  localizeDigits: (value: string) => string;
}): React.JSX.Element {
  const translationFontSize = Math.max(17, settings.translationFontSize);
  const translationLineHeight = Math.max(
    translationFontSize + 7,
    Math.round(translationFontSize * 1.55)
  );
  const reference = `[${surahName} ${localizeDigits(
    `${verse.surahId}:${verse.ayahNumber}`
  )}]`;

  return (
    <View style={styles.content}>
      <Text
        selectable
        style={[
          styles.translation,
          {
            color: palette.text,
            fontSize: translationFontSize,
            lineHeight: translationLineHeight,
          },
        ]}
      >
        {previewText}
      </Text>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.referenceRow}
      >
        <View style={[styles.referenceRule, { backgroundColor: palette.border }]} />
        <View style={[styles.referenceDiamond, { backgroundColor: palette.tint }]} />
        <Text style={[styles.reference, { color: palette.tint }]}>{reference}</Text>
        <View style={[styles.referenceDiamond, { backgroundColor: palette.tint }]} />
        <View style={[styles.referenceRule, { backgroundColor: palette.border }]} />
      </View>
    </View>
  );
}

export function HomeVerseSpotlight(
  { isVisible = true }: { isVisible?: boolean } = {}
): React.JSX.Element {
  const router = useRouter();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings, isHydrated: areSettingsHydrated } = useSettings();
  const { localizeDigits, t } = useUiTranslation();
  const reduceMotion = Boolean(useReducedMotion());
  const requestedTranslationId = settings.translationIds?.[0] ?? settings.translationId ?? 20;
  const requestedTranslationIdRef = React.useRef(requestedTranslationId);
  requestedTranslationIdRef.current = requestedTranslationId;

  const windowDimensions = useWindowDimensions();
  const [containerWidth, setContainerWidth] = React.useState(
    Math.max(100, windowDimensions.width - 24)
  );

  const flatListRef = React.useRef<FlatList<VerseKey>>(null);
  const currentIndexRef = React.useRef(-1);
  const isMomentumScrollingRef = React.useRef(false);

  const [isScreenFocused, setIsScreenFocused] = React.useState(false);
  const [isAppActive, setIsAppActive] = React.useState(AppState.currentState === 'active');

  const controller = React.useMemo(
    () => getSharedHomeController(requestedTranslationIdRef.current),
    []
  );
  const snapshot = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  React.useEffect(() => {
    if (!areSettingsHydrated) return;
    // A shared controller already has the current state/content after a
    // remount. Hydrate only on the first mount (or before any state exists).
    if (controller.getSnapshot().state) return;
    void controller.hydrate();
  }, [areSettingsHydrated, controller]);

  React.useEffect(() => () => controller.setActive(false), [controller]);

  React.useEffect(() => {
    if (!areSettingsHydrated) return;
    controller.setRequestedTranslationId(requestedTranslationId);
  }, [areSettingsHydrated, controller, requestedTranslationId]);

  useFocusEffect(
    React.useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsAppActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    controller.setActive(isScreenFocused && isAppActive && isVisible);
  }, [controller, isAppActive, isScreenFocused, isVisible]);

  // Keep cache synced with loaded snapshot content
  React.useEffect(() => {
    if (snapshot.content) {
      spotlightContentCache.set(
        `${snapshot.content.requestedTranslationId}:${snapshot.content.verseKey}`,
        snapshot.content
      );
    }
  }, [snapshot.content]);

  // PanResponder retained for gesture compatibility contract & testing
  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          getHomeSpotlightSwipeNavigation(gesture.dx, gesture.dy) !== null,
        onPanResponderRelease: (_event, gesture) => {
          const direction = getHomeSpotlightSwipeNavigation(gesture.dx, gesture.dy);
          if (!direction) return;
          controller.navigate(direction);
        },
      }),
    [controller]
  );

  const handleOpenVerse = React.useCallback(() => {
    if (isMomentumScrollingRef.current) return;
    const verseKey = controller.getSnapshot().state?.verseKey;
    const target = verseKey ? getVerseReaderTarget(verseKey) : null;
    if (target) router.push(target);
  }, [controller, router]);

  const currentVerse = snapshot.state ? getCanonicalVerse(snapshot.state.verseKey) : null;

  // Sync FlatList scroll position whenever external state changes (e.g. rotation timer or shuffle)
  React.useEffect(() => {
    if (!currentVerse) return;
    const targetIdx = currentVerse.canonicalIndex;
    if (currentIndexRef.current !== targetIdx) {
      currentIndexRef.current = targetIdx;
      flatListRef.current?.scrollToIndex({ index: targetIdx, animated: false });
    }
  }, [currentVerse]);

  const handleAccessibleNavigate = React.useCallback(
    (direction: 'next' | 'previous') => {
      const currentIdx = currentVerse?.canonicalIndex ?? 0;
      const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
      if (targetIdx < 0 || targetIdx >= CANONICAL_VERSE_KEYS.length) return;

      currentIndexRef.current = targetIdx;
      flatListRef.current?.scrollToIndex({
        index: targetIdx,
        animated: !reduceMotion,
      });
      controller.navigate(direction);
    },
    [controller, currentVerse?.canonicalIndex, reduceMotion]
  );

  const handleMomentumScrollBegin = React.useCallback(() => {
    isMomentumScrollingRef.current = true;
  }, []);

  const handleMomentumScrollEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isMomentumScrollingRef.current = false;
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / containerWidth);
      if (index < 0 || index >= CANONICAL_VERSE_KEYS.length) return;

      if (index !== currentIndexRef.current) {
        currentIndexRef.current = index;
        const currentCanonicalIdx = currentVerse?.canonicalIndex ?? index;
        if (index > currentCanonicalIdx) {
          controller.navigate('next');
        } else if (index < currentCanonicalIdx) {
          controller.navigate('previous');
        }
      }
    },
    [containerWidth, controller, currentVerse?.canonicalIndex]
  );

  const getItemLayout = React.useCallback(
    (_data: ArrayLike<VerseKey> | null | undefined, index: number) => ({
      length: containerWidth,
      offset: containerWidth * index,
      index,
    }),
    [containerWidth]
  );

  const handleScrollToIndexFailed = React.useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
      }, 50);
    },
    []
  );

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const measuredWidth = event.nativeEvent.layout.width;
      if (measuredWidth > 0 && Math.abs(measuredWidth - containerWidth) > 1) {
        setContainerWidth(measuredWidth);
        const currentIdx = currentIndexRef.current;
        if (currentIdx >= 0) {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: currentIdx, animated: false });
          }, 0);
        }
      }
    },
    [containerWidth]
  );

  const renderItem = React.useCallback(
    ({ item: verseKey }: { item: VerseKey }) => {
      const verse = getCanonicalVerse(verseKey);
      if (!verse) {
        return <View style={{ height: SPOTLIGHT_HEIGHT, width: containerWidth }} />;
      }

      const isCurrent = verseKey === snapshot.state?.verseKey;
      const text =
        (isCurrent && snapshot.content ? snapshot.content.translationText : null) ??
        spotlightContentCache.get(`${requestedTranslationId}:${verseKey}`)?.translationText ??
        getBundledFallbackVerse(verseKey)?.text ??
        '';

      const localizedSurahName = t(`surah_names.${verse.surahId}`, {
        fallback: verse.surahName,
      });
      const previewText = buildHomeSpotlightPreviewText(text);
      const reference = `[${localizedSurahName} ${localizeDigits(
        `${verse.surahId}:${verse.ayahNumber}`
      )}]`;

      return (
        <View style={[styles.slide, { width: containerWidth }]}>
          <Pressable
            accessibilityActions={[
              { name: 'activate' },
              { name: 'decrement', label: t('previous') },
              { name: 'increment', label: t('next') },
            ]}
            accessibilityHint={t('verse_spotlight_open_hint', {
              fallback: 'Opens this exact verse in the Translation reader.',
            })}
            accessibilityLabel={`${reference}. ${t('verse_spotlight_open', {
              fallback: 'Open verse',
            })}`}
            accessibilityRole="button"
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') {
                handleAccessibleNavigate('next');
              } else if (event.nativeEvent.actionName === 'decrement') {
                handleAccessibleNavigate('previous');
              } else if (event.nativeEvent.actionName === 'activate') {
                handleOpenVerse();
              }
            }}
            onPress={handleOpenVerse}
            style={({ pressed }) => (!reduceMotion && pressed ? styles.pressed : null)}
          >
            <VerseSlideContent
              localizeDigits={localizeDigits}
              palette={palette}
              previewText={previewText}
              settings={settings}
              surahName={localizedSurahName}
              verse={verse}
            />
          </Pressable>
        </View>
      );
    },
    [
      containerWidth,
      handleAccessibleNavigate,
      handleOpenVerse,
      localizeDigits,
      palette,
      reduceMotion,
      requestedTranslationId,
      settings,
      snapshot.content,
      snapshot.state?.verseKey,
      t,
    ]
  );

  if (snapshot.status === 'error' && !snapshot.state) {
    return (
      <Pressable
        accessibilityLabel={t('retry')}
        accessibilityRole="button"
        onPress={() => controller.refresh()}
        style={styles.error}
      >
        <Text style={[styles.errorText, { color: palette.muted }]}>
          {t('verse_spotlight_unavailable', { fallback: 'Verse unavailable offline.' })}
        </Text>
      </Pressable>
    );
  }

  if (!areSettingsHydrated || !snapshot.state || !currentVerse) {
    return <HomeVerseSpotlightSkeleton />;
  }

  const initialIndex = currentVerse.canonicalIndex;

  return (
    <View onLayout={handleLayout} style={styles.body}>
      <FlatList
        ref={flatListRef}
        bounces={false}
        data={CANONICAL_VERSE_KEYS}
        decelerationRate="fast"
        directionalLockEnabled
        disableIntervalMomentum
        getItemLayout={getItemLayout}
        horizontal
        initialNumToRender={1}
        initialScrollIndex={initialIndex >= 0 ? initialIndex : undefined}
        keyExtractor={(key) => key}
        maxToRenderPerBatch={2}
        nestedScrollEnabled
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        overScrollMode="never"
        pagingEnabled
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        snapToAlignment="center"
        snapToInterval={containerWidth}
        style={styles.flatList}
        windowSize={3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    height: SPOTLIGHT_HEIGHT,
    justifyContent: 'center',
    paddingBottom: 8,
    paddingTop: 16,
    width: '100%',
  },
  flatList: {
    height: SPOTLIGHT_HEIGHT,
    width: '100%',
  },
  slide: {
    height: SPOTLIGHT_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
  translation: {
    maxWidth: 620,
    textAlign: 'center',
    writingDirection: 'auto',
  },
  referenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 20,
    maxWidth: 360,
    width: '72%',
  },
  reference: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.55,
    textAlign: 'center',
  },
  referenceRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    maxWidth: 44,
  },
  referenceDiamond: {
    height: 5,
    transform: [{ rotate: '45deg' }],
    width: 5,
  },
  skeleton: {
    alignItems: 'center',
    height: SPOTLIGHT_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  skeletonLine: {
    alignSelf: 'center',
    borderRadius: 8,
    height: 18,
    marginTop: 14,
  },
  error: {
    alignItems: 'center',
    height: SPOTLIGHT_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
