import type { WordAnalysis } from '@/src/core/domain/word-study';

import {
  getWordStudyLocationKey,
  type WordStudyPressEvent,
  type WordStudyVersePreviewWord,
} from '../WordStudyPressEvent';

export type WordStudyNavigationHandoff = {
  locationKey: string;
  verseKey: string;
  verseWords: readonly WordStudyVersePreviewWord[];
  selectedSurfaceText?: string;
  selectedAnalysis?: WordAnalysis;
};

let pendingHandoff: WordStudyNavigationHandoff | null = null;

export function stageWordStudyNavigationHandoff(
  event: WordStudyPressEvent,
  selectedAnalysis?: WordAnalysis
): void {
  pendingHandoff = {
    locationKey: getWordStudyLocationKey(event),
    verseKey: event.verseKey,
    verseWords: event.verseWords ?? [],
    ...(event.surfaceText ? { selectedSurfaceText: event.surfaceText } : {}),
    ...(selectedAnalysis ? { selectedAnalysis } : {}),
  };
}

export function readWordStudyNavigationHandoff(
  locationKey: string
): WordStudyNavigationHandoff | null {
  if (pendingHandoff?.locationKey !== locationKey) return null;
  return pendingHandoff;
}
