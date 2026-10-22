import Feather from '@expo/vector-icons/Feather';
import { File, Paths } from 'expo-file-system';
import React from 'react';
import { Platform } from 'react-native';

import { findMushafOption } from '@/data/mushaf/options';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { prepareMushafVerseTarget } from '@/lib/mushaf/prepareMushafVerseTarget';
import { primeOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { loadLastReadFromStorage } from '@/providers/bookmarks/storage-utils';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import type { MushafPackId } from '@/types';

const MUSHAF_PACK_WARMUP_DELAY_MS = 1200;
// Read by MushafWebViewWarmup in android/.../MainApplication.kt; keep the names in sync.
const MUSHAF_WEBVIEW_WARMUP_MARKER = 'warm-mushaf-webview-on-launch';

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

  const mushafWarmupPackId =
    Platform.OS === 'android' &&
    isHydrated &&
    settings.readingMode === 'mushaf' &&
    findMushafOption(settings.mushafId)?.renderer === 'webview'
      ? settings.mushafId
      : undefined;

  // The first WebView in an Android process starts Chromium (~235 ms of UI-thread work on a budget
  // phone), and a Mushaf reader opened cold pays for it during its push. Chromium's startup also
  // initializes Vulkan in the app process, which on Adreno phones whose UI renders with OpenGL
  // corrupts a few frames of the whole window. MainApplication therefore starts that first WebView
  // natively while the launch splash still covers the window, whenever this marker exists.
  React.useEffect(() => {
    if (Platform.OS !== 'android' || !enabled || !isHydrated) return;

    try {
      const marker = new File(Paths.document, MUSHAF_WEBVIEW_WARMUP_MARKER);
      if (mushafWarmupPackId && !marker.exists) {
        marker.write('');
      } else if (!mushafWarmupPackId && marker.exists) {
        marker.delete();
      }
    } catch (error) {
      logger.warn('Failed to update the Mushaf WebView warmup marker', undefined, error as Error);
    }
  }, [enabled, isHydrated, mushafWarmupPackId]);

  const warmedMushafPackIdRef = React.useRef<MushafPackId | null>(null);

  React.useEffect(() => {
    if (!enabled || !mushafWarmupPackId) return;
    if (warmedMushafPackIdRef.current === mushafWarmupPackId) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const idleHandle = requestIdleCallback(() => {
      timeout = setTimeout(() => {
        warmedMushafPackIdRef.current = mushafWarmupPackId;
        warmMushafPackData(mushafWarmupPackId).catch(() => {
          // The reader reports pack errors when it opens.
        });
      }, MUSHAF_PACK_WARMUP_DELAY_MS);
    });
    return () => {
      cancelIdleCallback(idleHandle);
      if (timeout) clearTimeout(timeout);
    };
  }, [enabled, mushafWarmupPackId]);

  return null;
}
