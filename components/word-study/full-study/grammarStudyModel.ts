import type {
  GrammarPassage,
  VerseGrammarAnalysis,
  WordAnalysis,
} from '../../../src/core/domain/word-study';

export function normalizeGrammarArabic(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\s]/gu, '')
    .replace(/[ٱأإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/[^\p{Script=Arabic}]/gu, '');
}

type GrammarVerseWord = {
  readonly location: { readonly wordPosition: number };
  readonly surfaceUthmani: string;
};

type WordPositionRange = {
  readonly start: number;
  readonly end: number;
};

function normalizeGrammarArabicForAlignment(value: string): string {
  // The Uthmani surface can represent a conventional alif with a Quranic mark
  // that normalizeGrammarArabic removes. Ignoring alif and standalone hamza is
  // therefore a safe fallback only after exact verse-phrase alignment fails.
  return normalizeGrammarArabic(value).replace(/[اء]/gu, '');
}

export function areGrammarArabicWordsEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeGrammarArabic(left);
  const normalizedRight = normalizeGrammarArabic(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const alignedLeft = normalizeGrammarArabicForAlignment(left);
  const alignedRight = normalizeGrammarArabicForAlignment(right);
  return alignedLeft.length >= 2 && alignedLeft === alignedRight;
}

function findPhraseRanges(
  headingArabic: string,
  verseWords: readonly GrammarVerseWord[],
  normalize: (value: string) => string
): readonly WordPositionRange[] {
  const target = normalize(headingArabic);
  if (!target) return [];

  const ranges: WordPositionRange[] = [];
  for (let startIndex = 0; startIndex < verseWords.length; startIndex += 1) {
    let candidate = '';
    for (let endIndex = startIndex; endIndex < verseWords.length; endIndex += 1) {
      candidate += normalize(verseWords[endIndex].surfaceUthmani);
      if (candidate === target) {
        ranges.push({
          start: verseWords[startIndex].location.wordPosition,
          end: verseWords[endIndex].location.wordPosition,
        });
      }
      if (candidate.length >= target.length) break;
    }
  }
  return ranges;
}

function rangeContains(ranges: readonly WordPositionRange[], wordPosition: number): boolean {
  return ranges.some((range) => wordPosition >= range.start && wordPosition <= range.end);
}

function passageCoversSelectedWord(
  passage: GrammarPassage,
  selectedWord: WordAnalysis,
  verseWords: readonly GrammarVerseWord[]
): boolean {
  const selectedPosition = selectedWord.location.wordPosition;
  if (passage.startWordPosition !== undefined && passage.endWordPosition !== undefined) {
    return selectedPosition >= passage.startWordPosition
      && selectedPosition <= passage.endWordPosition;
  }

  const exactRanges = findPhraseRanges(
    passage.headingArabic,
    verseWords,
    normalizeGrammarArabic
  );
  if (exactRanges.length) return rangeContains(exactRanges, selectedPosition);

  const orthographicRanges = findPhraseRanges(
    passage.headingArabic,
    verseWords,
    normalizeGrammarArabicForAlignment
  );
  if (orthographicRanges.length) return rangeContains(orthographicRanges, selectedPosition);

  return passage.headingArabic
    .split(/[^\p{Script=Arabic}\p{M}\u0640]+/gu)
    .some((headingWord) => areGrammarArabicWordsEquivalent(
      headingWord,
      selectedWord.surfaceUthmani
    ));
}

export function findSelectedWordGrammarPassages(
  analysis: VerseGrammarAnalysis,
  word: WordAnalysis,
  verseWords: readonly GrammarVerseWord[] = [word]
): readonly GrammarPassage[] {
  return analysis.passages.filter((passage) =>
    passageCoversSelectedWord(passage, word, verseWords)
  );
}
