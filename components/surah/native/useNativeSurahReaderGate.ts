import React from 'react';
import { Platform } from 'react-native';

type UseNativeSurahReaderGateParams = {
  isMushafView: boolean;
  verseCount: number;
};

export function useNativeSurahReaderGate({
  isMushafView,
  verseCount,
}: UseNativeSurahReaderGateParams): boolean {
  return React.useMemo(
    () =>
      Boolean(
          Platform.OS === 'android' &&
          !isMushafView &&
          verseCount > 0
      ),
    [isMushafView, verseCount]
  );
}
