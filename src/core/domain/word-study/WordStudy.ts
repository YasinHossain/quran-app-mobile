import type { WordStudyLocation } from './WordStudyLocation';

export type WordStudySourceLayer =
  | 'surface'
  | 'segmentation'
  | 'morphology'
  | 'lemma'
  | 'root'
  | 'contextual-gloss'
  | 'occurrence-index'
  | 'audio'
  | 'grammar'
  | 'dictionary'
  | 'verb-reference';

export interface WordStudySourceReference {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly layer: WordStudySourceLayer;
}

export interface WordStudySourceAttribution extends WordStudySourceReference {
  readonly title: string;
  readonly license: string;
  readonly url: string;
  readonly checksum?: string;
}

export type WordStudyUnavailableReason =
  | 'particle-has-no-root'
  | 'proper-noun-root-absent'
  | 'lemma-not-provided'
  | 'root-not-provided'
  | 'segmentation-not-provided'
  | 'licensed-layer-unavailable'
  | 'source-row-missing'
  | 'not-yet-reviewed'
  | 'not-applicable';

export type WordStudyField<T> =
  | {
      readonly status: 'available';
      readonly value: T;
      readonly source: WordStudySourceReference;
    }
  | {
      readonly status: 'missing' | 'unsupported' | 'unavailable';
      readonly reason: WordStudyUnavailableReason;
      readonly source?: WordStudySourceReference;
    };

export type MorphemeSegmentType = 'prefix' | 'stem' | 'suffix' | 'infix' | 'whole-word';

export type GrammaticalPerson = 'first' | 'second' | 'third';
export type GrammaticalGender = 'masculine' | 'feminine' | 'common';
export type GrammaticalNumber = 'singular' | 'dual' | 'plural';
export type VerbAspect = 'perfect' | 'imperfect' | 'imperative';
export type VerbVoice = 'active' | 'passive';
export type VerbMood = 'indicative' | 'subjunctive' | 'jussive' | 'energetic';
export type GrammaticalCase = 'nominative' | 'accusative' | 'genitive';
export type GrammaticalState = 'definite' | 'indefinite' | 'construct';

export interface MorphologyFeatures {
  readonly aspect?: VerbAspect;
  readonly mood?: VerbMood;
  readonly voice?: VerbVoice;
  readonly person?: GrammaticalPerson;
  readonly gender?: GrammaticalGender;
  readonly number?: GrammaticalNumber;
  readonly grammaticalCase?: GrammaticalCase;
  readonly grammaticalState?: GrammaticalState;
  readonly verbForm?: string;
  readonly derivation?: string;
  readonly rawFeatures?: readonly string[];
}

export interface Morpheme {
  readonly locationKey: string;
  readonly segmentIndex: number;
  readonly arabic: string;
  readonly segmentType: MorphemeSegmentType;
  readonly posCode: string;
  readonly features: MorphologyFeatures;
  readonly source: WordStudySourceReference;
}

export interface Lemma {
  readonly id: string;
  readonly arabic: string;
  readonly normalized: string;
  readonly posCode?: string;
  readonly occurrenceCount: number;
  readonly source: WordStudySourceReference;
}

export interface Root {
  readonly id: string;
  readonly arabic: string;
  readonly normalized: string;
  readonly occurrenceCount: number;
  readonly lemmaCount: number;
  readonly source: WordStudySourceReference;
}

export interface WordGloss {
  readonly languageCode: string;
  readonly text: string;
  readonly source: WordStudySourceReference;
}

export interface WordAnalysis {
  readonly location: WordStudyLocation;
  readonly surfaceUthmani: string;
  readonly normalizedSurface: string;
  readonly primaryPos: WordStudyField<string>;
  readonly morphology: WordStudyField<MorphologyFeatures>;
  readonly morphemes: WordStudyField<readonly Morpheme[]>;
  readonly lemma: WordStudyField<Lemma>;
  readonly root: WordStudyField<Root>;
  readonly contextualGlosses: readonly WordGloss[];
  readonly sourceReferences: readonly WordStudySourceReference[];
}

export type WordOccurrenceScope = 'surface' | 'lemma' | 'root';

export interface WordOccurrence {
  readonly location: WordStudyLocation;
  readonly surfaceUthmani: string;
  readonly normalizedSurface: string;
  readonly contextualGlosses: readonly WordGloss[];
  readonly sourceReferences: readonly WordStudySourceReference[];
}

export interface WordOccurrenceQuery {
  readonly scope: WordOccurrenceScope;
  readonly locationKey?: string;
  readonly normalizedSurface?: string;
  readonly lemmaId?: string;
  readonly rootId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface WordOccurrencePageInfo {
  readonly limit: number;
  readonly nextCursor?: string;
  readonly hasNextPage: boolean;
  readonly totalCount?: number;
}

export interface PaginatedWordOccurrences {
  readonly query: WordOccurrenceQuery;
  readonly items: readonly WordOccurrence[];
  readonly pageInfo: WordOccurrencePageInfo;
}

export interface WordStudyUnavailable {
  readonly location: WordStudyLocation;
  readonly status: 'missing' | 'unavailable';
  readonly reason: WordStudyUnavailableReason;
  readonly sourceReferences: readonly WordStudySourceReference[];
}

export type WordStudyLookupResult = WordAnalysis | WordStudyUnavailable;

export function isWordAnalysis(result: WordStudyLookupResult): result is WordAnalysis {
  return 'surfaceUthmani' in result;
}
