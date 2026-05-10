import React from 'react';

import { IndexScrubber, type IndexScrubberHandle } from '@/components/reader/IndexScrubber';

export type VerseScrubberHandle = IndexScrubberHandle;

type VerseScrubberProps = {
  bottomInset: number;
  currentVerseNumber: number;
  onScrubStateChange?: (isScrubbing: boolean) => void;
  onScrubToVerse: (verseNumber: number, options?: { isFinal?: boolean }) => void;
  verseCount: number;
};

export const VerseScrubber = React.forwardRef<VerseScrubberHandle, VerseScrubberProps>(
  function VerseScrubber(
    {
      bottomInset,
      currentVerseNumber,
      onScrubStateChange,
      onScrubToVerse,
      verseCount,
    },
    ref
  ): React.JSX.Element | null {
    return (
      <IndexScrubber
        ref={ref}
        bottomInset={bottomInset}
        currentIndex={currentVerseNumber}
        itemCount={verseCount}
        onScrubStateChange={onScrubStateChange}
        onScrubToIndex={onScrubToVerse}
      />
    );
  }
);
