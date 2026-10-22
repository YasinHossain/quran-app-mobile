import { toWordStudyLocation } from '../../src/core/domain/word-study';

export type WordStudyPressSource = 'translation' | 'mushaf' | 'tajweed';

export type WordStudyVersePreviewWord = {
  wordPosition: number;
  surfaceText: string;
};

export type WordStudyPressEvent = {
  verseKey: string;
  wordPosition: number;
  wordId?: number;
  surfaceText?: string;
  verseWords?: readonly WordStudyVersePreviewWord[];
  source: WordStudyPressSource;
};

export type RawWordStudyPressEvent = {
  verseKey?: string;
  wordPosition?: number;
  wordId?: number;
  surfaceText?: string;
  verseWords?: readonly WordStudyVersePreviewWord[];
  source?: string;
};

export function buildWordStudyVersePreview(
  words: readonly {
    position?: number;
    uthmani?: string;
    charTypeName?: string;
  }[]
): WordStudyVersePreviewWord[] {
  return words
    .filter((word) => word.charTypeName !== 'end')
    .map((word, index) => ({
      wordPosition:
        typeof word.position === 'number' && Number.isFinite(word.position) && word.position > 0
          ? Math.trunc(word.position)
          : index + 1,
      surfaceText: word.uthmani?.trim() ?? '',
    }))
    .filter((word) => word.surfaceText.length > 0);
}

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
    const verseWords = (event.verseWords ?? [])
      .map((word) => ({
        wordPosition:
          typeof word.wordPosition === 'number' && Number.isFinite(word.wordPosition)
            ? Math.trunc(word.wordPosition)
            : 0,
        surfaceText: word.surfaceText?.trim() ?? '',
      }))
      .filter((word) => word.wordPosition > 0 && word.surfaceText.length > 0);
    const source: WordStudyPressSource =
      event.source === 'mushaf' || event.source === 'tajweed' ? event.source : 'translation';

    return {
      verseKey: location.verseKey,
      wordPosition: location.wordPosition,
      ...(wordId ? { wordId } : {}),
      ...(surfaceText ? { surfaceText } : {}),
      ...(verseWords.length ? { verseWords } : {}),
      source,
    };
  } catch {
    return null;
  }
}

export function getWordStudyLocationKey(event: WordStudyPressEvent): string {
  return `${event.verseKey}:${event.wordPosition}`;
}
