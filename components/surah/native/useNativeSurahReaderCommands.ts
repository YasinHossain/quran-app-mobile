import React from 'react';
import { findNodeHandle, UIManager, type ViewInstance } from 'react-native';

import type { NativeSurahReaderHandle } from './NativeSurahReader.types';

export function useNativeSurahReaderCommands(
  nativeRef: React.RefObject<ViewInstance | null>
): NativeSurahReaderHandle {
  return React.useMemo(
    () => ({
      scrollToVerse(verse: number | string, animated = false) {
        const nodeHandle = findNodeHandle(nativeRef.current);
        if (!nodeHandle) {
          return;
        }

        // The Android view manager receives commands by name; RN's types only list numeric IDs.
        UIManager.dispatchViewManagerCommand(nodeHandle, 'scrollToVerse' as unknown as number, [
          verse,
          animated,
        ]);
      },
    }),
    [nativeRef]
  );
}
