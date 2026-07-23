import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import {
  AppState,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import {
  buildHomeSpotlightPreviewText,
  getCanonicalVerse,
  getHomeSpotlightSwipeNavigation,
  getVerseReaderTarget,
  HomeVerseSpotlightController,
  resolveSpotlightVerse,
} from '@/lib/verse-spotlight';
import { hydrateHomeSpotlightState, persistHomeSpotlightState } from '@/lib/verse-spotlight/homeStateStorage';
import { useAppTheme } from '@/providers/ThemeContext';
import { useSettings } from '@/providers/SettingsContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { container } from '@/src/core/infrastructure/di/container';

const SWIPE_TAP_SUPPRESSION_MS = 300;

function HomeVerseSpotlightSkeleton(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View
      accessibilityLabel="Loading verse spotlight"
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

export function HomeVerseSpotlight(): React.JSX.Element {
  const router = useRouter();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings, isHydrated: areSettingsHydrated } = useSettings();
  const { localizeDigits, t } = useUiTranslation();
  const reduceMotion = Boolean(useReducedMotion());
  const requestedTranslationId = settings.translationIds?.[0] ?? settings.translationId ?? 20;
  const requestedTranslationIdRef = React.useRef(requestedTranslationId);
  requestedTranslationIdRef.current = requestedTranslationId;
  const suppressedTapUntilRef = React.useRef(0);
  const [isScreenFocused, setIsScreenFocused] = React.useState(false);
  const [isAppActive, setIsAppActive] = React.useState(AppState.currentState === 'active');

  const controller = React.useMemo(
    () =>
      new HomeVerseSpotlightController(requestedTranslationIdRef.current, {
        hydrate: hydrateHomeSpotlightState,
        persist: persistHomeSpotlightState,
        resolve: ({ requestedTranslationId: translationId, verseKey }) =>
          resolveSpotlightVerse({
            requestedTranslationId: translationId,
            verseKey,
            downloadIndex: container.getDownloadIndexRepository(),
            offlineTranslations: container.getTranslationOfflineStore(),
          }),
      }),
    []
  );
  const snapshot = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  React.useEffect(() => {
    if (!areSettingsHydrated) return;
    void controller.hydrate();
    return () => controller.dispose();
  }, [areSettingsHydrated, controller]);

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
    controller.setActive(isScreenFocused && isAppActive);
  }, [controller, isAppActive, isScreenFocused]);

  const handleOpenVerse = React.useCallback(() => {
    if (Date.now() < suppressedTapUntilRef.current) return;
    const verseKey = controller.getSnapshot().state?.verseKey;
    const target = verseKey ? getVerseReaderTarget(verseKey) : null;
    if (target) router.push(target);
  }, [controller, router]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          getHomeSpotlightSwipeNavigation(gesture.dx, gesture.dy) !== null,
        onPanResponderRelease: (_event, gesture) => {
          const direction = getHomeSpotlightSwipeNavigation(gesture.dx, gesture.dy);
          if (!direction) return;
          suppressedTapUntilRef.current = Date.now() + SWIPE_TAP_SUPPRESSION_MS;
          controller.navigate(direction);
        },
        onPanResponderTerminate: () => {
          suppressedTapUntilRef.current = Date.now() + SWIPE_TAP_SUPPRESSION_MS;
        },
      }),
    [controller]
  );

  if (snapshot.status === 'error') {
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

  if (!areSettingsHydrated || snapshot.status === 'loading' || !snapshot.content || !snapshot.state) {
    return <HomeVerseSpotlightSkeleton />;
  }

  const { content, state } = snapshot;
  const verse = getCanonicalVerse(state.verseKey);
  if (!verse) return <HomeVerseSpotlightSkeleton />;

  const previewText = buildHomeSpotlightPreviewText(content.translationText);
  const translationFontSize = Math.max(17, settings.translationFontSize);
  const translationLineHeight = Math.max(
    translationFontSize + 7,
    Math.round(translationFontSize * 1.55)
  );
  const reference = `[${verse.surahName} ${localizeDigits(
    `${verse.surahId}:${verse.ayahNumber}`
  )}]`;

  return (
    <View {...panResponder.panHandlers} style={styles.body}>
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
            controller.navigate('next');
          } else if (event.nativeEvent.actionName === 'decrement') {
            controller.navigate('previous');
          } else if (event.nativeEvent.actionName === 'activate') {
            handleOpenVerse();
          }
        }}
        onPress={handleOpenVerse}
        style={({ pressed }) => (!reduceMotion && pressed ? styles.pressed : null)}
      >
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
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    justifyContent: 'center',
    minHeight: 210,
    paddingHorizontal: 24,
    paddingBottom: 8,
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
    justifyContent: 'center',
    minHeight: 210,
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
    justifyContent: 'center',
    minHeight: 210,
    paddingHorizontal: 22,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
