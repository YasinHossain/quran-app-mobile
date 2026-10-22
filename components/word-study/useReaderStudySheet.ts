import React from 'react';

import { useTranslationResources } from '@/hooks/useTranslationResources';
import { getCachedItem, setItem } from '@/lib/storage/appStorage';
import {
  getVerseDetailsCached,
  getVerseDetailsSnapshot,
  type CachedVerseTranslation,
} from '@/lib/verse/verseDetailsCache';

import {
  READER_STUDY_SHEET_TAB_STORAGE_KEY,
  buildVerseTranslationItems,
  parseReaderStudySheetTab,
  type ReaderStudySheetTab,
  type VerseTranslationItem,
} from './readerStudySheetModel';
import type { WordStudyPressEvent } from './WordStudyPressEvent';
import type { WordQuickSheetController } from './useWordQuickSheetController';

export type ReaderStudySheetVerse = {
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
};

export type VerseTranslationLoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: VerseTranslationItem[] }
  | { status: 'error'; message: string };

export type ReaderStudySheetController = {
  isOpen: boolean;
  tab: ReaderStudySheetTab;
  verse: ReaderStudySheetVerse | null;
  /** The studied word, or null when the ayah number opened a translation-only sheet. */
  selectedWordPosition: number | null;
  translation: VerseTranslationLoadState;
  hasSelectedTranslations: boolean;
  wordController: WordQuickSheetController;
  openWord: (event: WordStudyPressEvent, verse: ReaderStudySheetVerse) => void;
  openVerse: (verse: ReaderStudySheetVerse) => void;
  setTab: (tab: ReaderStudySheetTab) => void;
  retryTranslation: () => void;
  close: () => void;
};

type RawTranslationState =
  | { status: 'loading' }
  | { status: 'ready'; translations: readonly CachedVerseTranslation[] }
  | { status: 'error' };

const TRANSLATION_ERROR_MESSAGE =
  'Check your connection, or download this translation in reader settings to read it offline.';

/**
 * Owns the Mushaf study sheet: a word tap opens Word and Translation tabs on the tab the reader
 * last chose; an ayah-number tap opens only the translation and leaves that choice unchanged.
 */
export function useReaderStudySheet({
  wordController,
  translationIds,
  contentLanguage,
  onTranslationsResolved,
}: {
  wordController: WordQuickSheetController;
  translationIds: readonly number[];
  contentLanguage?: string;
  /** Lets the screen's verse actions (copy, share, plan) include the loaded translations. */
  onTranslationsResolved?: (verseKey: string, items: VerseTranslationItem[]) => void;
}): ReaderStudySheetController {
  const [isOpen, setIsOpen] = React.useState(false);
  const [verse, setVerse] = React.useState<ReaderStudySheetVerse | null>(null);
  const [selectedWordPosition, setSelectedWordPosition] = React.useState<number | null>(null);
  const rememberedTabRef = React.useRef<ReaderStudySheetTab>(
    parseReaderStudySheetTab(getCachedItem(READER_STUDY_SHEET_TAB_STORAGE_KEY))
  );
  const [tab, setTabState] = React.useState<ReaderStudySheetTab>(rememberedTabRef.current);
  const [rawTranslation, setRawTranslation] = React.useState<RawTranslationState>({
    status: 'loading',
  });
  const [translationRetryToken, setTranslationRetryToken] = React.useState(0);
  const translationIdsKey = translationIds.join(',');
  const { translationsById } = useTranslationResources({
    enabled: isOpen,
    language: contentLanguage,
  });

  const { select: selectWordAnalysis, close: closeWordController } = wordController;
  const verseKey = verse?.verseKey ?? '';

  React.useEffect(() => {
    if (!isOpen || !verseKey) return;
    const ids = translationIdsKey ? translationIdsKey.split(',').map(Number) : [];
    if (ids.length === 0) {
      setRawTranslation({ status: 'ready', translations: [] });
      return;
    }

    const snapshot = getVerseDetailsSnapshot(verseKey, ids);
    if (snapshot) {
      setRawTranslation({ status: 'ready', translations: snapshot.translations ?? [] });
      return;
    }

    let cancelled = false;
    setRawTranslation({ status: 'loading' });
    getVerseDetailsCached(verseKey, ids)
      .then((details) => {
        if (!cancelled) {
          setRawTranslation({ status: 'ready', translations: details.translations ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) setRawTranslation({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, translationIdsKey, translationRetryToken, verseKey]);

  const translation = React.useMemo<VerseTranslationLoadState>(() => {
    if (rawTranslation.status === 'ready') {
      return {
        status: 'ready',
        items: buildVerseTranslationItems(
          rawTranslation.translations,
          translationIdsKey ? translationIdsKey.split(',').map(Number) : [],
          translationsById
        ),
      };
    }
    if (rawTranslation.status === 'error') {
      return { status: 'error', message: TRANSLATION_ERROR_MESSAGE };
    }
    return rawTranslation;
  }, [rawTranslation, translationIdsKey, translationsById]);

  const onTranslationsResolvedRef = React.useRef(onTranslationsResolved);
  onTranslationsResolvedRef.current = onTranslationsResolved;
  React.useEffect(() => {
    if (!verseKey || translation.status !== 'ready' || translation.items.length === 0) return;
    onTranslationsResolvedRef.current?.(verseKey, translation.items);
  }, [translation, verseKey]);

  const openWord = React.useCallback(
    (event: WordStudyPressEvent, nextVerse: ReaderStudySheetVerse) => {
      setVerse(nextVerse);
      setSelectedWordPosition(event.wordPosition);
      setTabState(rememberedTabRef.current);
      setIsOpen(true);
      // Load the word even on the Translation tab, so switching tabs shows it at once.
      selectWordAnalysis(event);
    },
    [selectWordAnalysis]
  );

  const openVerse = React.useCallback((nextVerse: ReaderStudySheetVerse) => {
    setVerse(nextVerse);
    setSelectedWordPosition(null);
    setTabState('translation');
    setIsOpen(true);
  }, []);

  const wordEvent = wordController.event;
  const wordLoadStatus = wordController.loadState.status;
  const setTab = React.useCallback(
    (nextTab: ReaderStudySheetTab) => {
      setTabState(nextTab);
      rememberedTabRef.current = nextTab;
      void setItem(READER_STUDY_SHEET_TAB_STORAGE_KEY, nextTab);

      // Starting audio from the Translation tab cancels an in-flight word lookup; resume it.
      if (
        nextTab === 'word' &&
        selectedWordPosition !== null &&
        wordEvent &&
        wordEvent.verseKey === verseKey &&
        wordEvent.wordPosition === selectedWordPosition &&
        wordLoadStatus === 'loading'
      ) {
        selectWordAnalysis(wordEvent);
      }
    },
    [selectWordAnalysis, selectedWordPosition, verseKey, wordEvent, wordLoadStatus]
  );

  const retryTranslation = React.useCallback(() => {
    setTranslationRetryToken((token) => token + 1);
  }, []);

  const close = React.useCallback(() => {
    setIsOpen(false);
    closeWordController();
  }, [closeWordController]);

  return {
    isOpen,
    tab,
    verse,
    selectedWordPosition,
    translation,
    hasSelectedTranslations: translationIds.length > 0,
    wordController,
    openWord,
    openVerse,
    setTab,
    retryTranslation,
    close,
  };
}
