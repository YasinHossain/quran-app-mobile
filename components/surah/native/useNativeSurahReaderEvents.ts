import React from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import type { SurahVerse } from '@/hooks/useSurahVerses';

import type {
  NativeSurahReaderActionPressEvent,
  NativeSurahReaderScrollEvent,
  NativeSurahReaderVisibleVerseChangeEvent,
  NativeSurahReaderWordPressEvent,
} from './NativeSurahReader.types';

type OpenVerseActionsParams = {
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
  translationTexts: string[];
};

type UseNativeSurahReaderEventsParams = {
  chapterNumber: number;
  getVerseByNumberRef: React.RefObject<(verseNumber: number) => SurahVerse | undefined>;
  isVerseScrubbingRef: React.RefObject<boolean>;
  lastReadReportedRef: React.RefObject<string | null>;
  openVerseActions: (params: OpenVerseActionsParams) => void;
  readerHeader: {
    handleScrollOffset: (offset: number) => void;
  };
  seekToWord: (params: { verseKey: string; wordPosition: number }) => void;
  setLastReadRef: React.RefObject<
    (
      surahId: string,
      ayahNumber: number,
      verseKey?: string,
      verseApiId?: number
    ) => void
  >;
  setVisibleVerseNumber: React.Dispatch<React.SetStateAction<number>>;
  suppressReaderFeedbackRef?: React.RefObject<boolean>;
  visibleVerseKeyRef: React.RefObject<string | null>;
  visibleVerseNumberRef: React.RefObject<number>;
};

export function useNativeSurahReaderEvents({
  chapterNumber,
  getVerseByNumberRef,
  isVerseScrubbingRef,
  lastReadReportedRef,
  openVerseActions,
  readerHeader,
  seekToWord,
  setLastReadRef,
  setVisibleVerseNumber,
  suppressReaderFeedbackRef,
  visibleVerseKeyRef,
  visibleVerseNumberRef,
}: UseNativeSurahReaderEventsParams): {
  handleNativeScroll: (event: NativeSyntheticEvent<NativeSurahReaderScrollEvent>) => void;
  handleNativeVerseActionPress: (
    event: NativeSyntheticEvent<NativeSurahReaderActionPressEvent>
  ) => void;
  handleNativeWordPress: (event: NativeSyntheticEvent<NativeSurahReaderWordPressEvent>) => void;
  handleNativeVisibleVerseChange: (
    event: NativeSyntheticEvent<NativeSurahReaderVisibleVerseChangeEvent>
  ) => void;
} {
  const lastReadWriteTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLastReadKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (lastReadWriteTimeoutRef.current) {
        clearTimeout(lastReadWriteTimeoutRef.current);
        lastReadWriteTimeoutRef.current = null;
      }
      pendingLastReadKeyRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (lastReadWriteTimeoutRef.current) {
      clearTimeout(lastReadWriteTimeoutRef.current);
      lastReadWriteTimeoutRef.current = null;
    }
    pendingLastReadKeyRef.current = null;
  }, [chapterNumber]);

  const handleNativeVisibleVerseChange = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderVisibleVerseChangeEvent>) => {
      const verseNumber = event.nativeEvent.verseNumber;
      if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;
      const normalizedVerseNumber = Math.trunc(verseNumber);
      const verseKey = event.nativeEvent.verseKey;
      visibleVerseKeyRef.current = verseKey;
      visibleVerseNumberRef.current = normalizedVerseNumber;
      if (!isVerseScrubbingRef.current) {
        setVisibleVerseNumber((currentVerseNumber) =>
          currentVerseNumber === normalizedVerseNumber ? currentVerseNumber : normalizedVerseNumber
        );
      }

      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
      if (suppressReaderFeedbackRef?.current) return;
      const key = `${Math.trunc(chapterNumber)}:${normalizedVerseNumber}`;
      if (lastReadReportedRef.current === key) return;
      if (pendingLastReadKeyRef.current === key) return;

      if (lastReadWriteTimeoutRef.current) {
        clearTimeout(lastReadWriteTimeoutRef.current);
      }
      pendingLastReadKeyRef.current = key;
      const normalizedChapterNumber = Math.trunc(chapterNumber);
      const verseApiId = event.nativeEvent.verseApiId;
      lastReadWriteTimeoutRef.current = setTimeout(() => {
        lastReadWriteTimeoutRef.current = null;
        pendingLastReadKeyRef.current = null;
        lastReadReportedRef.current = key;
        setLastReadRef.current(
          String(normalizedChapterNumber),
          normalizedVerseNumber,
          verseKey,
          verseApiId
        );
      }, 700);
    },
    [
      chapterNumber,
      isVerseScrubbingRef,
      lastReadReportedRef,
      setLastReadRef,
      setVisibleVerseNumber,
      suppressReaderFeedbackRef,
      visibleVerseKeyRef,
      visibleVerseNumberRef,
    ]
  );

  const handleNativeScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderScrollEvent>) => {
      if (suppressReaderFeedbackRef?.current) return;
      readerHeader.handleScrollOffset(event.nativeEvent.contentOffsetY);
    },
    [readerHeader, suppressReaderFeedbackRef]
  );

  const handleNativeVerseActionPress = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderActionPressEvent>) => {
      const verseNumber = event.nativeEvent.verseNumber;
      const loadedVerse =
        Number.isFinite(verseNumber) && verseNumber > 0
          ? getVerseByNumberRef.current(Math.trunc(verseNumber))
          : undefined;
      const translationTexts =
        loadedVerse?.translationTexts ?? event.nativeEvent.translationTexts ?? [];
      openVerseActions({
        verseKey: event.nativeEvent.verseKey,
        verseApiId: event.nativeEvent.verseApiId ?? loadedVerse?.id,
        arabicText: loadedVerse?.text_uthmani ?? event.nativeEvent.arabicText ?? '',
        translationTexts,
      });
    },
    [getVerseByNumberRef, openVerseActions]
  );

  const handleNativeWordPress = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderWordPressEvent>) => {
      const verseKey = event.nativeEvent.verseKey?.trim();
      const wordPosition = event.nativeEvent.wordPosition;
      if (!verseKey) return;
      if (typeof wordPosition !== 'number' || !Number.isFinite(wordPosition) || wordPosition <= 0) {
        return;
      }

      seekToWord({ verseKey, wordPosition: Math.trunc(wordPosition) });
    },
    [seekToWord]
  );

  return {
    handleNativeScroll,
    handleNativeVerseActionPress,
    handleNativeWordPress,
    handleNativeVisibleVerseChange,
  };
}
