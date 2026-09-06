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
  wordsJson?: string | null;
  lookupFailed?: boolean;
};

export function useContextualMeaning(
  analysis: WordAnalysis | undefined
): ContextualMeaningLoadState {
  const { settings, isHydrated } = useSettings();
  const selectedLanguageCode = normalizeWordLanguageCode(settings.wordLang);
  const verseKey = analysis?.location.verseKey;
  const { itemsByKey } = useDownloadIndexItems({
    enabled: Boolean(verseKey) && isHydrated && selectedLanguageCode !== 'en',
  });
  const download = itemsByKey.get(`word-translation:${selectedLanguageCode}`);
  const resourceRevision = `${download?.status ?? 'unknown'}:${download?.updatedAt ?? 0}`;
  const requestKey = verseKey
    ? `${verseKey}:${selectedLanguageCode}:${resourceRevision}`
    : '';
  const [resolved, setResolved] = React.useState<ResolvedState | null>(null);

  React.useEffect(() => {
    if (!verseKey || !isHydrated || selectedLanguageCode === 'en') return;
    let cancelled = false;
    void container
      .getTranslationOfflineStore()
      .getWordTranslationWordsJson(verseKey, selectedLanguageCode)
      .then((wordsJson) => {
        if (cancelled) return;
        setResolved({ key: requestKey, wordsJson });
      })
      .catch(() => {
        if (cancelled) return;
        setResolved({ key: requestKey, lookupFailed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [verseKey, isHydrated, requestKey, selectedLanguageCode]);

  if (!analysis) return { status: 'idle' };
  if (!isHydrated) return { status: 'loading', languageName: 'selected language' };
  if (selectedLanguageCode === 'en') {
    return {
      status: 'ready',
      presentation: resolveContextualMeaning({ analysis, selectedLanguageCode }),
    };
  }
  if (resolved?.key === requestKey) {
    return {
      status: 'ready',
      presentation: resolveContextualMeaning({
        analysis,
        selectedLanguageCode,
        selectedLanguageWordsJson: resolved.wordsJson,
        lookupFailed: resolved.lookupFailed,
      }),
    };
  }
  return {
    status: 'loading',
    languageName: getWordLanguageName(selectedLanguageCode),
  };
}
