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

/**
 * `ready` maps only the locations whose verse lookups have resolved. A location
 * missing from the map is still loading, so appended pages can load their own
 * meanings without returning already-resolved rows to a loading state.
 */
export type ContextualMeaningsLoadState =
  | { status: 'loading'; languageName: string }
  | { status: 'ready'; presentationsByLocationKey: ReadonlyMap<string, ContextualMeaningPresentation> };

type ResolvedVerses = {
  /** Language and resource revision the cached lookups belong to. */
  contextKey: string;
  verseKeys: ReadonlySet<string>;
  selectedByVerseKey: ReadonlyMap<string, string>;
  englishByVerseKey: ReadonlyMap<string, string>;
  selectedFailedVerseKeys: ReadonlySet<string>;
  englishFailedVerseKeys: ReadonlySet<string>;
};

function createEmptyResolvedVerses(contextKey: string): ResolvedVerses {
  return {
    contextKey,
    verseKeys: new Set(),
    selectedByVerseKey: new Map(),
    englishByVerseKey: new Map(),
    selectedFailedVerseKeys: new Set(),
    englishFailedVerseKeys: new Set(),
  };
}

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
  const contextKey = [
    selectedLanguageCode,
    selectedDownload?.status ?? 'unknown',
    selectedDownload?.updatedAt ?? 0,
    englishDownload?.status ?? 'unknown',
    englishDownload?.updatedAt ?? 0,
  ].join(':');
  const isContextReady = enabled && locations.length > 0 && isHydrated && !isDownloadIndexLoading;
  const [resolved, setResolved] = React.useState<ResolvedVerses | null>(null);
  const latestContextKeyRef = React.useRef(contextKey);
  latestContextKeyRef.current = contextKey;

  const resolvedForContext = resolved?.contextKey === contextKey ? resolved : null;
  const missingVerseKeys = React.useMemo(
    () => verseKeys.filter((verseKey) => !resolvedForContext?.verseKeys.has(verseKey)),
    [resolvedForContext, verseKeys]
  );
  const missingVerseKeysKey = missingVerseKeys.join('|');

  React.useEffect(() => {
    if (!isContextReady || missingVerseKeys.length === 0) return;
    const store = container.getTranslationOfflineStore();
    const selectedPromise = selectedDownload?.status === 'installed'
      ? store.getWordTranslationWordsJsonByVerseKeys(missingVerseKeys, selectedLanguageCode)
      : Promise.resolve(new Map<string, string>());
    const englishPromise = selectedLanguageCode !== 'en' && englishDownload?.status === 'installed'
      ? store.getWordTranslationWordsJsonByVerseKeys(missingVerseKeys, 'en')
      : Promise.resolve(new Map<string, string>());

    // Results stay valid while the language and resources are unchanged, so a
    // lookup that finishes after another page was appended is still merged.
    void Promise.allSettled([selectedPromise, englishPromise]).then(
      ([selectedResult, englishResult]) => {
        if (latestContextKeyRef.current !== contextKey) return;
        setResolved((previous) => {
          const base = previous?.contextKey === contextKey
            ? previous
            : createEmptyResolvedVerses(contextKey);
          const selectedByVerseKey = new Map(base.selectedByVerseKey);
          const englishByVerseKey = new Map(base.englishByVerseKey);
          const selectedFailedVerseKeys = new Set(base.selectedFailedVerseKeys);
          const englishFailedVerseKeys = new Set(base.englishFailedVerseKeys);
          for (const verseKey of missingVerseKeys) {
            if (selectedResult.status === 'fulfilled') {
              const wordsJson = selectedResult.value.get(verseKey);
              if (wordsJson !== undefined) selectedByVerseKey.set(verseKey, wordsJson);
              selectedFailedVerseKeys.delete(verseKey);
            } else {
              selectedFailedVerseKeys.add(verseKey);
            }
            if (englishResult.status === 'fulfilled') {
              const wordsJson = englishResult.value.get(verseKey);
              if (wordsJson !== undefined) englishByVerseKey.set(verseKey, wordsJson);
              englishFailedVerseKeys.delete(verseKey);
            } else {
              englishFailedVerseKeys.add(verseKey);
            }
          }
          return {
            contextKey,
            verseKeys: new Set([...base.verseKeys, ...missingVerseKeys]),
            selectedByVerseKey,
            englishByVerseKey,
            selectedFailedVerseKeys,
            englishFailedVerseKeys,
          };
        });
      }
    );
    // missingVerseKeysKey captures the contents of missingVerseKeys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contextKey,
    englishDownload?.status,
    isContextReady,
    missingVerseKeysKey,
    selectedDownload?.status,
    selectedLanguageCode,
  ]);

  const presentationsByLocationKey = React.useMemo(() => {
    const presentations = new Map<string, ContextualMeaningPresentation>();
    if (!resolvedForContext) return presentations;
    for (const location of locations) {
      if (!resolvedForContext.verseKeys.has(location.verseKey)) continue;
      presentations.set(
        location.locationKey,
        resolveContextualMeaning({
          location,
          selectedLanguageCode,
          selectedLanguageWordsJson: resolvedForContext.selectedByVerseKey.get(location.verseKey),
          englishWordsJson: resolvedForContext.englishByVerseKey.get(location.verseKey),
          selectedLookupFailed: resolvedForContext.selectedFailedVerseKeys.has(location.verseKey),
          englishLookupFailed: resolvedForContext.englishFailedVerseKeys.has(location.verseKey),
        })
      );
    }
    return presentations;
    // The location keys contain the complete location coordinates used here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsKey, resolvedForContext, selectedLanguageCode]);

  if (!isContextReady) {
    return { status: 'loading', languageName: getWordLanguageName(selectedLanguageCode) };
  }

  return { status: 'ready', presentationsByLocationKey };
}
