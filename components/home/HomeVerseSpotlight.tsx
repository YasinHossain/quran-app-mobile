import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import {
  AppState,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
  getVerseReaderTarget,
  HomeVerseSpotlightController,
  resolveSpotlightVerse,
  SpotlightVerseContent,
  VerseKey,
} from '@/lib/verse-spotlight';
import { getPreloadedHomeSpotlightSnapshot, hydrateHomeSpotlightState, persistHomeSpotlightContent, persistHomeSpotlightState } from '@/lib/verse-spotlight/homeStateStorage';
import { useAppTheme } from '@/providers/ThemeContext';
import { useSettings } from '@/providers/SettingsContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { container } from '@/src/core/infrastructure/di/container';

const SPOTLIGHT_HEIGHT = 210;
const SPOTLIGHT_CACHE_LIMIT = 8;
const spotlightContentCache = new Map<string, SpotlightVerseContent>();
const spotlightContentRequests = new Map<string, Promise<SpotlightVerseContent>>();

function getContentCacheKey(translationId: number, verseKey: VerseKey): string {
  return `${translationId}:${verseKey}`;
}

function cacheExactSpotlightContent(content: SpotlightVerseContent): void {
  if (content.effectiveTranslationId !== content.requestedTranslationId) return;

  const key = getContentCacheKey(content.requestedTranslationId, content.verseKey as VerseKey);
  spotlightContentCache.delete(key);
  spotlightContentCache.set(key, content);
  while (spotlightContentCache.size > SPOTLIGHT_CACHE_LIMIT) {
    const oldestKey = spotlightContentCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    spotlightContentCache.delete(oldestKey);
  }
}

function loadSpotlightContent(
  requestedTranslationId: number,
  verseKey: VerseKey
): Promise<SpotlightVerseContent> {
  const key = getContentCacheKey(requestedTranslationId, verseKey);
  const pending = spotlightContentRequests.get(key);
  if (pending) return pending;

  const request = resolveSpotlightVerse({
    requestedTranslationId,
    verseKey,
    downloadIndex: container.getDownloadIndexRepository(),
    offlineTranslations: container.getTranslationOfflineStore(),
  }).finally(() => {
    spotlightContentRequests.delete(key);
  });
  spotlightContentRequests.set(key, request);
  return request;
}

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
      loadSpotlightContent(translationId, verseKey as VerseKey),
  });

  const preloaded = getPreloadedHomeSpotlightSnapshot(requestedTranslationId);
  if (preloaded) {
    sharedHomeController.restore(preloaded.state, preloaded.content);
  }

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

const VerseSlideContent = React.memo(function VerseSlideContent({
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
});

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

  const [containerWidth, setContainerWidth] = React.useState(0);
  const [contentCacheVersion, setContentCacheVersion] = React.useState(0);

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

  // Keep only exact-language results in the slide cache. A fallback for a
  // selected non-English translation must never be painted and then replaced
  // in-place when the downloaded translation arrives.
  React.useEffect(() => {
    if (snapshot.content) {
      cacheExactSpotlightContent(snapshot.content);
      if (snapshot.status === 'ready') void persistHomeSpotlightContent(snapshot.content);
    }
  }, [snapshot.content, snapshot.status]);

  const handleOpenVerse = React.useCallback(() => {
    if (isMomentumScrollingRef.current) return;
    const verseKey = controller.getSnapshot().state?.verseKey;
    const target = verseKey ? getVerseReaderTarget(verseKey) : null;
    if (target) router.push(target);
  }, [controller, router]);

  const currentVerse = React.useMemo(
    () => (snapshot.state ? getCanonicalVerse(snapshot.state.verseKey) : null),
    [snapshot.state?.verseKey]
  );

  // Resolve the two slides a user can reach next while the current verse is
  // idle. Concurrent reads are shared with the controller, keeping swipes
  // immediate without doing duplicate SQLite work.
  React.useEffect(() => {
    if (!areSettingsHydrated || !isVisible || !currentVerse) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      const neighborKeys = [
        CANONICAL_VERSE_KEYS[currentVerse.canonicalIndex - 1],
        CANONICAL_VERSE_KEYS[currentVerse.canonicalIndex + 1],
      ].filter((key): key is VerseKey => Boolean(key));

      for (const verseKey of neighborKeys) {
        const cacheKey = getContentCacheKey(requestedTranslationId, verseKey);
        if (spotlightContentCache.has(cacheKey)) continue;
        void loadSpotlightContent(requestedTranslationId, verseKey).then((content) => {
          if (cancelled || content.effectiveTranslationId !== requestedTranslationId) return;
          cacheExactSpotlightContent(content);
          setContentCacheVersion((version) => version + 1);
        }).catch(() => {});
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [areSettingsHydrated, currentVerse, isVisible, requestedTranslationId]);

  // Sync FlatList scroll position whenever external state changes (e.g. rotation timer or shuffle)
  React.useEffect(() => {
    if (!currentVerse || containerWidth <= 0 || isMomentumScrollingRef.current) return;
    const targetIdx = currentVerse.canonicalIndex;
    if (currentIndexRef.current !== targetIdx) {
      currentIndexRef.current = targetIdx;
      flatListRef.current?.scrollToIndex({ index: targetIdx, animated: false });
    }
  }, [containerWidth, currentVerse]);

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

      currentIndexRef.current = index;
      const verseKey = CANONICAL_VERSE_KEYS[index];
      if (verseKey) controller.selectVerse(verseKey);
    },
    [containerWidth, controller]
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
      if (measuredWidth > 0 && Math.abs(measuredWidth - containerWidth) > 0.5) {
        currentIndexRef.current = currentVerse?.canonicalIndex ?? -1;
        setContainerWidth(measuredWidth);
      }
    },
    [containerWidth, currentVerse?.canonicalIndex]
  );

  const renderItem = React.useCallback(
    ({ item: verseKey }: { item: VerseKey }) => {
      const verse = getCanonicalVerse(verseKey);
      if (!verse) {
        return <View style={{ height: SPOTLIGHT_HEIGHT, width: containerWidth || '100%' }} />;
      }

      const isCurrent = verseKey === snapshot.state?.verseKey;
      const exactContent = spotlightContentCache.get(
        getContentCacheKey(requestedTranslationId, verseKey)
      );
      const canUseBundledFallback =
        requestedTranslationId === 20 ||
        (snapshot.status === 'ready' &&
          snapshot.content?.requestedTranslationId === requestedTranslationId &&
          snapshot.content.effectiveTranslationId !== requestedTranslationId);
      const text =
        (isCurrent && snapshot.content ? snapshot.content.translationText : null) ??
        exactContent?.translationText ??
        (canUseBundledFallback ? getBundledFallbackVerse(verseKey)?.text : null) ??
        '';

      const localizedSurahName = t(`surah_names.${verse.surahId}`, {
        fallback: verse.surahName,
      });
      const previewText = buildHomeSpotlightPreviewText(text);
      const reference = `[${localizedSurahName} ${localizeDigits(
        `${verse.surahId}:${verse.ayahNumber}`
      )}]`;

      return (
        <View style={[styles.slide, { width: containerWidth || '100%' }]}>
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
      contentCacheVersion,
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
      {containerWidth <= 0 ? (
        renderItem({ item: currentVerse.verseKey })
      ) : (
        <FlatList
          key={String(containerWidth)}
          ref={flatListRef}
          bounces={false}
          data={CANONICAL_VERSE_KEYS}
          decelerationRate="fast"
          directionalLockEnabled
          disableIntervalMomentum
          extraData={contentCacheVersion}
          getItemLayout={getItemLayout}
          horizontal
          initialNumToRender={3}
          initialScrollIndex={initialIndex >= 0 ? initialIndex : undefined}
          keyExtractor={(key) => key}
          maxToRenderPerBatch={3}
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
          snapToAlignment="start"
          snapToInterval={containerWidth}
          style={styles.flatList}
          windowSize={5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    height: SPOTLIGHT_HEIGHT,
    justifyContent: 'center',
    width: '100%',
  },
  flatList: {
    height: SPOTLIGHT_HEIGHT,
    width: '100%',
  },
  slide: {
    height: SPOTLIGHT_HEIGHT,
    justifyContent: 'center',
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 16,
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
