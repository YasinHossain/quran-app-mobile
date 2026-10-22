import {
  buildWordStudyVersePreview,
  type WordStudyVersePreviewWord,
} from '../WordStudyPressEvent';

type StoredVerseWord = {
  readonly position?: number;
  readonly uthmani?: string;
  readonly charTypeName?: string;
};

const ARABIC_BASE_LETTER_PATTERN = /[\u0621-\u064a\u066e-\u06d3\u06fa-\u06fc]/u;

export function getOfflineVersePreview({
  wordsJson,
  arabicUthmani,
}: {
  wordsJson?: string;
  arabicUthmani: string;
}): readonly WordStudyVersePreviewWord[] {
  if (wordsJson) {
    try {
      const parsed = JSON.parse(wordsJson) as unknown;
      if (Array.isArray(parsed)) {
        const words = buildWordStudyVersePreview(parsed as StoredVerseWord[]);
        if (words.length) return words;
      }
    } catch {
      // Fall through to the canonical verse text below.
    }
  }

  return arabicUthmani
    .trim()
    .split(/\s+/u)
    .filter((surfaceText) => ARABIC_BASE_LETTER_PATTERN.test(surfaceText))
    .map((surfaceText, index) => ({
      wordPosition: index + 1,
      surfaceText,
    }));
}
