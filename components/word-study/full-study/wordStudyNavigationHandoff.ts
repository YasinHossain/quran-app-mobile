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
  verseAnalyses?: readonly WordAnalysis[];
};

let pendingHandoff: WordStudyNavigationHandoff | null = null;

export function stageWordStudyNavigationHandoff(
  event: WordStudyPressEvent,
  selectedAnalysis?: WordAnalysis,
  verseAnalyses?: readonly WordAnalysis[]
): void {
  const previewWords =
    verseAnalyses && verseAnalyses.length > 0
      ? verseAnalyses.map((word) => ({
          wordPosition: word.location.wordPosition,
          surfaceText: word.surfaceUthmani,
        }))
      : event.verseWords ?? [];

  pendingHandoff = {
    locationKey: getWordStudyLocationKey(event),
    verseKey: event.verseKey,
    verseWords: previewWords,
    ...(verseAnalyses && verseAnalyses.length > 0 ? { verseAnalyses } : {}),
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
