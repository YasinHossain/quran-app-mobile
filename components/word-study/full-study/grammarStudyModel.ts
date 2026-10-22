import type {
  GrammarPassage,
  VerseGrammarAnalysis,
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

export type GrammarSelectedWord = {
  readonly location: {
    readonly locationKey: string;
    readonly wordPosition: number;
  };
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

type PreparedVerse = {
  exactWords: readonly string[];
  alignedWords: readonly string[];
  passageRanges: WeakMap<GrammarPassage, readonly WordPositionRange[]>;
};

// Verse arrays and source passages are immutable. Weak keys let their prepared
// Arabic text disappear with the screen rather than retaining a Quran-wide cache.
const preparedVerses = new WeakMap<readonly GrammarVerseWord[], PreparedVerse>();

function prepareVerse(words: readonly GrammarVerseWord[]): PreparedVerse {
  let prepared = preparedVerses.get(words);
  if (!prepared) {
    const exactWords = words.map((word) => normalizeGrammarArabic(word.surfaceUthmani));
    prepared = {
      exactWords,
      alignedWords: exactWords.map((word) => word.replace(/[اء]/gu, '')),
      passageRanges: new WeakMap(),
    };
    preparedVerses.set(words, prepared);
  }
  return prepared;
}

function findPhraseRanges(
  target: string,
  verseWords: readonly GrammarVerseWord[],
  normalizedWords: readonly string[]
): readonly WordPositionRange[] {
  if (!target) return [];

  const ranges: WordPositionRange[] = [];
  for (let startIndex = 0; startIndex < verseWords.length; startIndex += 1) {
    let candidate = '';
    for (let endIndex = startIndex; endIndex < verseWords.length; endIndex += 1) {
      candidate += normalizedWords[endIndex];
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
  selectedWord: GrammarSelectedWord,
  verseWords: readonly GrammarVerseWord[]
): boolean {
  const selectedPosition = selectedWord.location.wordPosition;
  if (passage.startWordPosition !== undefined && passage.endWordPosition !== undefined) {
    return selectedPosition >= passage.startWordPosition
      && selectedPosition <= passage.endWordPosition;
  }

  const prepared = prepareVerse(verseWords);
  let ranges = prepared.passageRanges.get(passage);
  if (!ranges) {
    const target = normalizeGrammarArabic(passage.headingArabic);
    const exactRanges = findPhraseRanges(target, verseWords, prepared.exactWords);
    ranges = exactRanges.length
      ? exactRanges
      : findPhraseRanges(target.replace(/[اء]/gu, ''), verseWords, prepared.alignedWords);
    prepared.passageRanges.set(passage, ranges);
  }
  if (ranges.length) return rangeContains(ranges, selectedPosition);

  return passage.headingArabic
    .split(/[^\p{Script=Arabic}\p{M}\u0640]+/gu)
    .some((headingWord) => areGrammarArabicWordsEquivalent(
      headingWord,
      selectedWord.surfaceUthmani
    ));
}

export function findSelectedWordGrammarPassages(
  analysis: VerseGrammarAnalysis,
  word: GrammarSelectedWord,
  verseWords: readonly GrammarVerseWord[] = [word]
): readonly GrammarPassage[] {
  return analysis.passages.filter((passage) =>
    passageCoversSelectedWord(passage, word, verseWords)
  );
}
