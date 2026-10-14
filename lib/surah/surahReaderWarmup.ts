import {
  getSelectedTranslationIds,
  preloadOfflineSurahNavigationPage,
  type SurahPageCacheSettings,
} from '@/lib/surah/offlineSurahPageCache';
import { getNetworkSurahTranslationCached } from '@/lib/surah/surahTranslationNetworkCache';
import { Platform } from 'react-native';

const DEFAULT_SURAH_READER_WARMUP_TIMEOUT_MS = 320;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function warmSurahReaderBeforeNavigation(params: {
  surahId: number;
  verseNumber?: number;
  settings: SurahPageCacheSettings;
  timeoutMs?: number;
}): Promise<void> {
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
