import type { WordStudySourceReference } from './WordStudy';

export type VerbPrincipalPartKey =
  | 'perfect'
  | 'imperfect'
  | 'imperative'
  | 'activeParticiple'
  | 'passiveParticiple'
  | 'verbalNoun';

export interface VerbPrincipalParts {
  readonly perfect: string | null;
  readonly imperfect: string | null;
  readonly imperative: string | null;
  readonly activeParticiple: string | null;
  readonly passiveParticiple: string | null;
  readonly verbalNoun: string | null;
}

export interface VerbReferenceQuery {
  readonly rootNormalized: string;
  readonly lemmaNormalized?: string;
  readonly verbForm: string;
}

export interface VerbReference {
  readonly rootArabic: string;
  readonly rootNormalized: string;
  readonly verbForm: string;
  readonly patternCode: string;
  readonly principalParts: VerbPrincipalParts;
  readonly source: WordStudySourceReference;
}

export type VerbReferenceUnavailableReason =
  | 'not-a-verb'
  | 'root-not-provided'
  | 'verb-form-not-provided'
  | 'verb-reference-pack-unavailable'
  | 'source-row-missing'
  | 'ambiguous-reference';

export interface VerbReferenceUnavailable {
  readonly status: 'missing' | 'unavailable';
  readonly reason: VerbReferenceUnavailableReason;
}

export type VerbReferenceLookupResult = VerbReference | VerbReferenceUnavailable;

export function isVerbReference(
  result: VerbReferenceLookupResult
): result is VerbReference {
  return 'principalParts' in result;
}
