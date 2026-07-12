import React from 'react';
import { Platform } from 'react-native';

type UseNativeSurahReaderGateParams = {
  hasLoadedContent: boolean;
  isMushafView: boolean;
  showByWords: boolean;
  tajweed: boolean;
  verseCount: number;
};

export function useNativeSurahReaderGate({
  hasLoadedContent,
  isMushafView,
  showByWords,
  tajweed,
  verseCount,
}: UseNativeSurahReaderGateParams): boolean {
  return React.useMemo(
    () =>
      Boolean(
        Platform.OS === 'android' &&
          !isMushafView &&
          hasLoadedContent &&
          verseCount > 0 &&
          !showByWords &&
          !tajweed
      ),
    [hasLoadedContent, isMushafView, showByWords, tajweed, verseCount]
  );
}
