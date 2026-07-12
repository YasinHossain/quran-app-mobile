import React from 'react';
import { findNodeHandle, UIManager, type View } from 'react-native';

import type { NativeSurahReaderHandle } from './NativeSurahReader.types';

export function useNativeSurahReaderCommands(
  nativeRef: React.RefObject<View | null>
): NativeSurahReaderHandle {
  return React.useMemo(
    () => ({
      scrollToVerse(verseNumber: number, animated = false) {
        const nodeHandle = findNodeHandle(nativeRef.current);
        if (!nodeHandle) {
          return;
        }

        UIManager.dispatchViewManagerCommand(nodeHandle, 'scrollToVerse', [verseNumber, animated]);
      },
    }),
    [nativeRef]
  );
}
