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

export function findSelectedWordGrammarPassages(
  analysis: VerseGrammarAnalysis,
  word: WordAnalysis
): readonly GrammarPassage[] {
  const selectedSurface = normalizeGrammarArabic(word.surfaceUthmani);
  if (!selectedSurface) return [];

  return analysis.passages.filter((passage) =>
    passage.headingArabic
      .split(/[^\p{Script=Arabic}\p{M}\u0640]+/gu)
      .some((headingWord) => normalizeGrammarArabic(headingWord) === selectedSurface)
  );
}
