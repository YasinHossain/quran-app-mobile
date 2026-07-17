import type { WordStudySourceReference } from './WordStudy';

export type GrammarReviewStatus = 'source-provided' | 'reviewed' | 'unreviewed';

export interface GrammarPassage {
  readonly sequence: number;
  readonly headingArabic: string;
  readonly bodyArabic: string;
  readonly startWordPosition?: number;
  readonly endWordPosition?: number;
}

export interface VerseGrammarAnalysis {
  readonly verseKey: string;
  readonly passages: readonly GrammarPassage[];
  readonly source: WordStudySourceReference;
  readonly reviewStatus: GrammarReviewStatus;
}

export interface GrammarStudyUnavailable {
  readonly verseKey: string;
  readonly status: 'missing' | 'unavailable';
  readonly reason: 'source-row-missing' | 'grammar-pack-unavailable';
}

export type GrammarStudyLookupResult = VerseGrammarAnalysis | GrammarStudyUnavailable;

export function isVerseGrammarAnalysis(
  result: GrammarStudyLookupResult
): result is VerseGrammarAnalysis {
  return 'passages' in result;
}
