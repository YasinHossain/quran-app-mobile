import React from 'react';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { getWordLanguageName, normalizeWordLanguageCode } from '@/lib/i18n/wordLanguages';
import { useSettings } from '@/providers/SettingsContext';
import type { WordStudyLocation } from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';

import {
  resolveContextualMeaning,
  type ContextualMeaningPresentation,
} from './contextualMeaningModel';

export type ContextualMeaningsLoadState =
  | { status: 'loading'; languageName: string }
  | { status: 'ready'; presentationsByLocationKey: ReadonlyMap<string, ContextualMeaningPresentation> };

type ResolvedBatch = {
  key: string;
  selectedByVerseKey: ReadonlyMap<string, string>;
  englishByVerseKey: ReadonlyMap<string, string>;
  selectedLookupFailed: boolean;
  englishLookupFailed: boolean;
};

export function useContextualMeanings(
  locations: readonly WordStudyLocation[],
  enabled = true
): ContextualMeaningsLoadState {
  const { settings, isHydrated } = useSettings();
  const selectedLanguageCode = normalizeWordLanguageCode(settings.wordLang);
  const locationsKey = locations.map((location) => location.locationKey).join('|');
  const verseKeys = React.useMemo(
    () => [...new Set(locations.map((location) => location.verseKey))],
    // The location keys contain the complete verse coordinates used here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationsKey]
  );
  const { itemsByKey, isLoading: isDownloadIndexLoading } = useDownloadIndexItems({
    enabled: enabled && locations.length > 0 && isHydrated,
    pollIntervalMs: 0,
  });
  const selectedDownload = itemsByKey.get(`word-translation:${selectedLanguageCode}`);
  const englishDownload = itemsByKey.get('word-translation:en');
  const resourceRevision = [
    selectedDownload?.status ?? 'unknown',
    selectedDownload?.updatedAt ?? 0,
    englishDownload?.status ?? 'unknown',
    englishDownload?.updatedAt ?? 0,
  ].join(':');
  const requestKey = enabled && locationsKey
    ? `${locationsKey}:${selectedLanguageCode}:${resourceRevision}`
    : '';
  const [resolved, setResolved] = React.useState<ResolvedBatch | null>(null);

  React.useEffect(() => {
    if (!requestKey || !isHydrated || isDownloadIndexLoading) return;
    let cancelled = false;
    const store = container.getTranslationOfflineStore();
    const selectedPromise = selectedDownload?.status === 'installed'
      ? store.getWordTranslationWordsJsonByVerseKeys(verseKeys, selectedLanguageCode)
      : Promise.resolve(new Map<string, string>());
    const englishPromise = selectedLanguageCode !== 'en' && englishDownload?.status === 'installed'
      ? store.getWordTranslationWordsJsonByVerseKeys(verseKeys, 'en')
      : Promise.resolve(new Map<string, string>());

    void Promise.allSettled([selectedPromise, englishPromise]).then(
      ([selectedResult, englishResult]) => {
        if (cancelled) return;
        setResolved({
          key: requestKey,
          selectedByVerseKey:
            selectedResult.status === 'fulfilled' ? selectedResult.value : new Map(),
          englishByVerseKey:
            englishResult.status === 'fulfilled' ? englishResult.value : new Map(),
          selectedLookupFailed: selectedResult.status === 'rejected',
          englishLookupFailed: englishResult.status === 'rejected',
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    englishDownload?.status,
    isDownloadIndexLoading,
    isHydrated,
    requestKey,
    selectedDownload?.status,
    selectedLanguageCode,
    verseKeys,
  ]);

  const languageName = getWordLanguageName(selectedLanguageCode);
  if (!requestKey || !isHydrated || isDownloadIndexLoading || resolved?.key !== requestKey) {
    return { status: 'loading', languageName };
  }

  return {
    status: 'ready',
    presentationsByLocationKey: new Map(
      locations.map((location) => [
        location.locationKey,
        resolveContextualMeaning({
          location,
          selectedLanguageCode,
          selectedLanguageWordsJson: resolved.selectedByVerseKey.get(location.verseKey),
          englishWordsJson: resolved.englishByVerseKey.get(location.verseKey),
          selectedLookupFailed: resolved.selectedLookupFailed,
          englishLookupFailed: resolved.englishLookupFailed,
        }),
      ])
    ),
  };
}
