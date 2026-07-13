import React from 'react';
import { Platform } from 'react-native';

type UseNativeSurahReaderGateParams = {
  hasLoadedContent: boolean;
  isMushafView: boolean;
  verseCount: number;
};

export function useNativeSurahReaderGate({
  hasLoadedContent,
  isMushafView,
  verseCount,
}: UseNativeSurahReaderGateParams): boolean {
  return React.useMemo(
    () =>
      Boolean(
        Platform.OS === 'android' &&
          !isMushafView &&
          hasLoadedContent &&
          verseCount > 0
      ),
    [hasLoadedContent, isMushafView, verseCount]
  );
}
