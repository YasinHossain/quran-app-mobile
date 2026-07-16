import { toWordStudyLocation } from '../../src/core/domain/word-study';

export type WordStudyPressSource = 'translation' | 'mushaf' | 'tajweed';

export type WordStudyPressEvent = {
  verseKey: string;
  wordPosition: number;
  wordId?: number;
  surfaceText?: string;
  source: WordStudyPressSource;
};

export type RawWordStudyPressEvent = {
  verseKey?: string;
  wordPosition?: number;
  wordId?: number;
  surfaceText?: string;
  source?: string;
};

export function normalizeWordStudyPressEvent(
  event: RawWordStudyPressEvent
): WordStudyPressEvent | null {
  const verseKey = event.verseKey?.trim() ?? '';
  const wordPosition =
    typeof event.wordPosition === 'number' && Number.isFinite(event.wordPosition)
      ? Math.trunc(event.wordPosition)
      : 0;
  if (!verseKey || wordPosition <= 0) return null;

  try {
    const location = toWordStudyLocation(`${verseKey}:${wordPosition}`);
    const wordId =
      typeof event.wordId === 'number' && Number.isFinite(event.wordId) && event.wordId > 0
        ? Math.trunc(event.wordId)
        : undefined;
    const surfaceText = event.surfaceText?.trim() || undefined;
    const source: WordStudyPressSource =
      event.source === 'mushaf' || event.source === 'tajweed' ? event.source : 'translation';

    return {
      verseKey: location.verseKey,
      wordPosition: location.wordPosition,
      ...(wordId ? { wordId } : {}),
      ...(surfaceText ? { surfaceText } : {}),
      source,
    };
  } catch {
    return null;
  }
}

export function getWordStudyLocationKey(event: WordStudyPressEvent): string {
  return `${event.verseKey}:${event.wordPosition}`;
}
