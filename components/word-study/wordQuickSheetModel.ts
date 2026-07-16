import {
  isWordAnalysis,
  type Morpheme,
  type MorphologyFeatures,
  type WordAnalysis,
  type WordStudyLookupResult,
  type WordStudyUnavailableReason,
} from '../../src/core/domain/word-study';

export type WordQuickSheetLoadState =
  | { status: 'loading' }
  | { status: 'ready'; analysis: WordAnalysis }
  | { status: 'missing'; result: Exclude<WordStudyLookupResult, WordAnalysis> }
  | { status: 'error'; message: string };

const POS_LABELS: Readonly<Record<string, string>> = {
  V: 'Verb',
  N: 'Noun',
  PN: 'Proper noun',
  ADJ: 'Adjective',
  PRON: 'Pronoun',
  DET: 'Determiner',
  P: 'Preposition',
  CONJ: 'Conjunction',
  SUB: 'Subordinating particle',
  NEG: 'Negative particle',
  EMPH: 'Emphatic particle',
  INTG: 'Interrogative particle',
  REL: 'Relative pronoun',
  DEM: 'Demonstrative pronoun',
  ADV: 'Adverb',
  LOC: 'Location adverb',
  T: 'Time adverb',
  ACC: 'Accusative particle',
  AMD: 'Amendment particle',
  ANS: 'Answer particle',
  AVR: 'Aversion particle',
  CAUS: 'Causal particle',
  CIRC: 'Circumstantial particle',
  COM: 'Comitative particle',
  COND: 'Conditional particle',
  CERT: 'Certainty particle',
  EQ: 'Equalization particle',
  EXH: 'Exhortation particle',
  EXL: 'Exceptive particle',
  EXP: 'Explanation particle',
  FUT: 'Future particle',
  IMPN: 'Imperative verbal noun',
  IMPV: 'Imperative particle',
  INC: 'Inceptive particle',
  INT: 'Interpretation particle',
  VOC: 'Vocative particle',
  INL: 'Quranic initials',
  PREV: 'Preventive particle',
  PRO: 'Prohibition particle',
  PRP: 'Purpose particle',
  REM: 'Resumption particle',
  RES: 'Restriction particle',
  RET: 'Retraction particle',
  RSLT: 'Result particle',
  SUP: 'Supplemental particle',
  SUR: 'Surprise particle',
};

export function getPosLabel(posCode: string): string {
  const normalized = posCode.trim().toUpperCase();
  return POS_LABELS[normalized] ?? (normalized || 'Not available');
}

export function getPosColorGroup(posCode: string): 'verb' | 'noun' | 'pronoun' | 'particle' {
  const normalized = posCode.trim().toUpperCase();
  if (normalized === 'V') return 'verb';
  if (normalized === 'N' || normalized === 'PN' || normalized === 'ADJ') return 'noun';
  if (normalized === 'PRON' || normalized === 'REL' || normalized === 'DEM') return 'pronoun';
  return 'particle';
}

function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function describeMorphology(features: MorphologyFeatures): string {
  const parts = [
    features.aspect ? titleCase(features.aspect) : null,
    features.voice ? titleCase(features.voice) : null,
    features.mood ? titleCase(features.mood) : null,
    features.person ? `${titleCase(features.person)} person` : null,
    features.gender ? titleCase(features.gender) : null,
    features.number ? titleCase(features.number) : null,
    features.grammaticalCase ? `${titleCase(features.grammaticalCase)} case` : null,
    features.grammaticalState ? titleCase(features.grammaticalState) : null,
    features.verbForm ? `Form ${features.verbForm}` : null,
    features.derivation ? titleCase(features.derivation) : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(' · ') : 'No additional inflection is recorded for this word.';
}

export function describeMissingReason(reason: WordStudyUnavailableReason): string {
  switch (reason) {
    case 'particle-has-no-root':
      return 'No root applies to this particle.';
    case 'proper-noun-root-absent':
      return 'A root is not provided for this proper noun.';
    case 'lemma-not-provided':
      return 'A lemma is not provided by the current analysis source.';
    case 'root-not-provided':
      return 'A root is not provided by the current analysis source.';
    case 'segmentation-not-provided':
      return 'Segment analysis is not available for this word.';
    case 'source-row-missing':
      return 'This word is not present in the installed study pack.';
    case 'not-yet-reviewed':
      return 'This analysis is awaiting linguistic review.';
    case 'licensed-layer-unavailable':
      return 'This analysis layer is not included in the installed licensed pack.';
    case 'not-applicable':
      return 'This field does not apply to this word.';
  }
}

export function describeField<T>(
  field: WordAnalysis['lemma'] | WordAnalysis['root'],
  getValue: (value: T) => string
): string {
  return field.status === 'available'
    ? getValue(field.value as T)
    : describeMissingReason(field.reason);
}

export function getAnalysisSegments(analysis: WordAnalysis): readonly Morpheme[] {
  if (analysis.morphemes.status === 'available' && analysis.morphemes.value.length) {
    return analysis.morphemes.value;
  }
  return [];
}

export function getPrimaryGloss(analysis: WordAnalysis): string {
  const english = analysis.contextualGlosses.find((gloss) => gloss.languageCode === 'en');
  return english?.text ?? analysis.contextualGlosses[0]?.text ?? 'No contextual gloss is available.';
}

export function getSourceLabel(analysis: WordAnalysis): string {
  const hasQac = analysis.sourceReferences.some((source) => source.sourceId === 'qac-morphology-v0.4');
  const hasOfflineGloss = analysis.sourceReferences.some((source) =>
    source.sourceId.startsWith('quran-app-offline-word-pack-')
  );
  const labels = [
    hasQac ? 'Quranic Arabic Corpus v0.4' : null,
    hasOfflineGloss ? 'Quran App offline word pack' : null,
  ].filter((label): label is string => Boolean(label));

  if (labels.length) return labels.join(' · ');
  const first = analysis.sourceReferences[0];
  return first ? `${first.sourceId} ${first.sourceVersion}` : 'Installed Word Study pack';
}

export function toWordQuickSheetLoadState(result: WordStudyLookupResult): WordQuickSheetLoadState {
  return isWordAnalysis(result)
    ? { status: 'ready', analysis: result }
    : { status: 'missing', result };
}
