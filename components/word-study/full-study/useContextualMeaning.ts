import React from 'react';

import { getWordLanguageName, normalizeWordLanguageCode } from '@/lib/i18n/wordLanguages';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useSettings } from '@/providers/SettingsContext';
import type { WordAnalysis } from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';

import {
  resolveContextualMeaning,
  type ContextualMeaningPresentation,
} from './contextualMeaningModel';

export type ContextualMeaningLoadState =
  | { status: 'idle' }
  | { status: 'loading'; languageName: string }
  | { status: 'ready'; presentation: ContextualMeaningPresentation };

type ResolvedState = {
  key: string;
  selectedWordsJson?: string | null;
  englishWordsJson?: string | null;
  selectedLookupFailed?: boolean;
  englishLookupFailed?: boolean;
};

export function useContextualMeaning(
  analysis: WordAnalysis | undefined
): ContextualMeaningLoadState {
  const { settings, isHydrated } = useSettings();
  const selectedLanguageCode = normalizeWordLanguageCode(settings.wordLang);
  const verseKey = analysis?.location.verseKey;
  const { itemsByKey, isLoading: isDownloadIndexLoading } = useDownloadIndexItems({
    enabled: Boolean(verseKey) && isHydrated,
    pollIntervalMs: 0,
  });
  const download = itemsByKey.get(`word-translation:${selectedLanguageCode}`);
  const englishDownload = itemsByKey.get('word-translation:en');
  const resourceRevision = [
    download?.status ?? 'unknown',
    download?.updatedAt ?? 0,
    englishDownload?.status ?? 'unknown',
    englishDownload?.updatedAt ?? 0,
  ].join(':');
  const requestKey = verseKey
    ? `${verseKey}:${selectedLanguageCode}:${resourceRevision}`
    : '';
  const [resolved, setResolved] = React.useState<ResolvedState | null>(null);

  React.useEffect(() => {
    if (!verseKey || !isHydrated || isDownloadIndexLoading) return;
    let cancelled = false;
    const store = container.getTranslationOfflineStore();
    const selectedInstalled = download?.status === 'installed';
    const englishInstalled = englishDownload?.status === 'installed';
    const selectedPromise = selectedInstalled
      ? store.getWordTranslationWordsJson(verseKey, selectedLanguageCode)
      : Promise.resolve(null);
    const englishPromise = selectedLanguageCode !== 'en' && englishInstalled
      ? store.getWordTranslationWordsJson(verseKey, 'en')
      : Promise.resolve(null);

    void Promise.allSettled([selectedPromise, englishPromise]).then(
      ([selectedResult, englishResult]) => {
        if (cancelled) return;
        setResolved({
          key: requestKey,
          selectedWordsJson: selectedResult.status === 'fulfilled' ? selectedResult.value : null,
          englishWordsJson: englishResult.status === 'fulfilled' ? englishResult.value : null,
          selectedLookupFailed: selectedResult.status === 'rejected',
          englishLookupFailed: englishResult.status === 'rejected',
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    download?.status,
    englishDownload?.status,
    isDownloadIndexLoading,
    isHydrated,
    requestKey,
    selectedLanguageCode,
    verseKey,
  ]);

  if (!analysis) return { status: 'idle' };
  if (!isHydrated || isDownloadIndexLoading) {
    return { status: 'loading', languageName: getWordLanguageName(selectedLanguageCode) };
  }
  if (resolved?.key === requestKey) {
    return {
      status: 'ready',
      presentation: resolveContextualMeaning({
        location: analysis.location,
        selectedLanguageCode,
        selectedLanguageWordsJson: resolved.selectedWordsJson,
        englishWordsJson: resolved.englishWordsJson,
        selectedLookupFailed: resolved.selectedLookupFailed,
        englishLookupFailed: resolved.englishLookupFailed,
      }),
    };
  }
  return {
    status: 'loading',
    languageName: getWordLanguageName(selectedLanguageCode),
  };
}
