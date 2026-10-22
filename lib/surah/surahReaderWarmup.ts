import {
  getSelectedTranslationIds,
  preloadOfflineSurahNavigationPage,
  type SurahPageCacheSettings,
} from '@/lib/surah/offlineSurahPageCache';
import { getNetworkSurahTranslationCached } from '@/lib/surah/surahTranslationNetworkCache';
import { Platform } from 'react-native';

import { findMushafOption } from '@/data/mushaf/options';
import { prepareMushafVerseTarget } from '@/lib/mushaf/prepareMushafVerseTarget';
import type { MushafPackId } from '@/types';

const DEFAULT_SURAH_READER_WARMUP_TIMEOUT_MS = 320;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Long enough for a page read once the pack index is warm (tens of ms), short enough that a cold
// pack never visibly delays the tap.
const MUSHAF_PAGE_WARMUP_TIMEOUT_MS = 150;

/**
 * Loads the opening Mushaf page into memory so the reader can embed it in its WebView document
 * and draw it while the screen is still sliding in.
 */
async function warmMushafReaderPage(params: {
  surahId: number;
  verseNumber?: number;
  settings: MushafWarmupSettings;
}): Promise<void> {
  const packId = params.settings.mushafId;
  const mushafOption = packId ? findMushafOption(packId) : undefined;
  if (!packId || mushafOption?.renderer !== 'webview') return;

  await prepareMushafVerseTarget({
    chapterId: params.surahId,
    fallbackVersion: mushafOption.version,
    packId,
    verseKey: `${params.surahId}:${params.verseNumber ?? 1}`,
  }).catch(() => null);
}

type MushafWarmupSettings = {
  readingMode?: 'translations' | 'mushaf';
  mushafId?: MushafPackId;
};

export async function warmSurahReaderBeforeNavigation(params: {
  surahId: number;
  verseNumber?: number;
  settings: SurahPageCacheSettings & MushafWarmupSettings;
  timeoutMs?: number;
}): Promise<void> {
  if (params.settings.readingMode === 'mushaf') {
    await Promise.race([warmMushafReaderPage(params), wait(MUSHAF_PAGE_WARMUP_TIMEOUT_MS)]);
  }

  // Android's translation reader owns this query. Preloading here would recreate the full
  // Surah and word model in JS immediately before Kotlin reads the same SQLite rows.
  if (Platform.OS === 'android') return;

  const timeoutMs = Math.max(0, params.timeoutMs ?? DEFAULT_SURAH_READER_WARMUP_TIMEOUT_MS);
  const shouldWarmLightNetworkSurah = !params.settings.tajweed && !params.settings.showByWords;
  const startedAt = Date.now();
  const offlineWarmup = preloadOfflineSurahNavigationPage({
    surahId: params.surahId,
    verseNumber: params.verseNumber,
    settings: params.settings,
  });

  const offlineResult = await Promise.race([
    offlineWarmup,
    wait(timeoutMs).then(() => null),
  ]);

  if (offlineResult !== false || !shouldWarmLightNetworkSurah) {
    return;
  }

  const remainingTimeoutMs = Math.max(0, timeoutMs - (Date.now() - startedAt));
  const networkWarmup = getNetworkSurahTranslationCached({
    surahId: params.surahId,
    translationIds: getSelectedTranslationIds(params.settings),
    wordLang: params.settings.wordLang ?? undefined,
  }).catch(() => undefined);

  await Promise.race([
    networkWarmup,
    wait(remainingTimeoutMs),
  ]);
}
