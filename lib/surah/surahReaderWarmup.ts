import {
  preloadOfflineSurahNavigationPage,
  type SurahPageCacheSettings,
} from '@/lib/surah/offlineSurahPageCache';

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
  const timeoutMs = Math.max(0, params.timeoutMs ?? DEFAULT_SURAH_READER_WARMUP_TIMEOUT_MS);

  await Promise.race([
    preloadOfflineSurahNavigationPage({
      surahId: params.surahId,
      verseNumber: params.verseNumber,
      settings: params.settings,
    }),
    wait(timeoutMs),
  ]);
}
