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
  const candidates = new Set<string>();
  candidates.add(normalizeGrammarArabic(word.surfaceUthmani));
  if (word.morphemes.status === 'available') {
    for (const segment of word.morphemes.value) {
      candidates.add(normalizeGrammarArabic(segment.arabic));
    }
  }
  const meaningfulCandidates = [...candidates]
    .filter((candidate) => candidate.length > 1)
    .sort((left, right) => right.length - left.length);
  return analysis.passages.filter((passage) => {
    const heading = normalizeGrammarArabic(passage.headingArabic);
    return meaningfulCandidates.some(
      (candidate) => heading.includes(candidate) || candidate.includes(heading)
    );
  });
}
