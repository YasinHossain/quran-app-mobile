import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { InteractionManager, Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { findMushafOption } from '@/data/mushaf/options';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { prepareMushafVerseTarget } from '@/lib/mushaf/prepareMushafVerseTarget';
import { primeOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { loadLastReadFromStorage } from '@/providers/bookmarks/storage-utils';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import type { MushafPackId } from '@/types';

const MUSHAF_WEBVIEW_WARMUP_DELAY_MS = 1200;
const MUSHAF_WEBVIEW_WARMUP_TIMEOUT_MS = 4000;
const MUSHAF_WEBVIEW_WARMUP_SOURCE = { html: '<!doctype html><html><body></body></html>' };

/** Loads the pack index and the most recently read page so the first Mushaf open skips cold reads. */
async function warmMushafPackData(packId: MushafPackId): Promise<void> {
  const mushafOption = findMushafOption(packId);
  if (mushafOption?.renderer !== 'webview') return;

  const lastRead = await loadLastReadFromStorage();
  const [surahId, entry] =
    Object.entries(lastRead ?? {}).sort(
      (left, right) => (right[1]?.updatedAt ?? 0) - (left[1]?.updatedAt ?? 0)
    )[0] ?? [];
  const chapterId = Math.trunc(Number(surahId ?? 1)) || 1;
  const verseNumber = Math.trunc(Number(entry?.verseNumber ?? 1)) || 1;

  await prepareMushafVerseTarget({
    chapterId,
    fallbackVersion: mushafOption.version,
    packId,
    verseKey: `${chapterId}:${verseNumber}`,
  });
}

export function StartupResourcePrefetch(): React.JSX.Element | null {
  const { settings, isHydrated } = useSettings();
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    const timeout = setTimeout(() => setEnabled(true), 350);
    return () => clearTimeout(timeout);
  }, []);

  useTranslationResources({ enabled, language: settings.contentLanguage });

  // Resource-list rows draw their icons from this font. Until it loads, each icon renders
  // empty and then pops in, so load it off the startup path, long before a list opens.
  React.useEffect(() => {
    if (!enabled) return;
    Feather.loadFont().catch((error: unknown) => {
      logger.warn('Failed to preload icon font', undefined, error as Error);
    });
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled || !settings.tajweed) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      void loadLastReadFromStorage()
        .then((lastRead) => {
          if (cancelled) return;

          const recentEntries = Object.entries(lastRead ?? {})
            .sort((left, right) => (right[1]?.updatedAt ?? 0) - (left[1]?.updatedAt ?? 0))
            .slice(0, 3);

          if (recentEntries.length === 0) {
            primeOfflineSurahNavigationPage({ surahId: 1, settings });
            return;
          }

          for (const [surahId, entry] of recentEntries) {
            const parsedSurahId = Number(surahId);
            if (!Number.isFinite(parsedSurahId) || parsedSurahId <= 0) continue;
            primeOfflineSurahNavigationPage({
              surahId: Math.trunc(parsedSurahId),
              verseNumber: entry?.verseNumber,
              settings,
            });
          }
        })
        .catch(() => {});
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [enabled, settings]);

  // The first WebView in an Android process starts Chromium on the UI thread (~235 ms on a budget
  // phone) and boots its renderer process. Without this, a Mushaf reader opened from Home pays
  // both during its push: the slide starts late and the page stays blank after it lands. Mount a
  // throwaway WebView once Home is idle; later WebViews then start warm.
  const shouldWarmMushafWebView =
    Platform.OS === 'android' &&
    enabled &&
    isHydrated &&
    settings.readingMode === 'mushaf' &&
    Boolean(settings.mushafId);
  const [mushafWebViewWarmup, setMushafWebViewWarmup] = React.useState<
    'idle' | 'mounted' | 'done'
  >('idle');
  const finishMushafWebViewWarmup = React.useCallback(() => setMushafWebViewWarmup('done'), []);

  React.useEffect(() => {
    if (!shouldWarmMushafWebView || mushafWebViewWarmup !== 'idle') return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const mushafId = settings.mushafId;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => {
        setMushafWebViewWarmup('mounted');
        if (mushafId) {
          warmMushafPackData(mushafId).catch(() => {
            // The reader reports pack errors when it opens.
          });
        }
      }, MUSHAF_WEBVIEW_WARMUP_DELAY_MS);
    });
    return () => {
      interactionTask.cancel();
      if (timeout) clearTimeout(timeout);
    };
  }, [mushafWebViewWarmup, settings.mushafId, shouldWarmMushafWebView]);

  React.useEffect(() => {
    if (mushafWebViewWarmup !== 'mounted') return;
    const timeout = setTimeout(finishMushafWebViewWarmup, MUSHAF_WEBVIEW_WARMUP_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [finishMushafWebViewWarmup, mushafWebViewWarmup]);

  if (mushafWebViewWarmup !== 'mounted') return null;

  return (
    <WebView
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      javaScriptEnabled={false}
      onError={finishMushafWebViewWarmup}
      onLoadEnd={finishMushafWebViewWarmup}
      pointerEvents="none"
      source={MUSHAF_WEBVIEW_WARMUP_SOURCE}
      style={styles.mushafWebViewWarmup}
    />
  );
}

const styles = StyleSheet.create({
  mushafWebViewWarmup: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
