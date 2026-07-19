import type {
  Lemma,
  WordAnalysis,
  WordOccurrence,
  WordOccurrenceQuery,
  WordOccurrenceScope,
} from '../../../src/core/domain/word-study';

export const OCCURRENCE_PAGE_SIZE = 30;

export type OccurrenceCounter = {
  key: 'surface' | 'lemma' | 'root' | 'root-lemma-family';
  label: string;
  value?: number;
};

export type OccurrenceFilter = {
  scope: WordOccurrenceScope;
  label: 'Surface' | 'Lemma' | 'Root';
  enabled: boolean;
  unavailableExplanation?: string;
};

export function getOccurrenceCounters(
  analysis: WordAnalysis,
  surfaceCount?: number
): readonly OccurrenceCounter[] {
  return [
    { key: 'surface', label: 'Surface', value: surfaceCount },
    ...(analysis.lemma.status === 'available'
      ? [{ key: 'lemma' as const, label: 'Lemma', value: analysis.lemma.value.occurrenceCount }]
      : []),
    ...(analysis.root.status === 'available'
      ? [
          { key: 'root' as const, label: 'Root', value: analysis.root.value.occurrenceCount },
          {
            key: 'root-lemma-family' as const,
            label: 'Root forms',
            value: analysis.root.value.lemmaCount,
          },
        ]
      : []),
  ];
}

export function getOccurrenceFilters(analysis: WordAnalysis): readonly OccurrenceFilter[] {
  return [
    { scope: 'surface', label: 'Surface', enabled: true },
    {
      scope: 'lemma',
      label: 'Lemma',
      enabled: analysis.lemma.status === 'available',
      ...(analysis.lemma.status === 'available'
        ? {}
        : { unavailableExplanation: 'A lemma is not available for this word.' }),
    },
    {
      scope: 'root',
      label: 'Root',
      enabled: analysis.root.status === 'available',
      ...(analysis.root.status === 'available'
        ? {}
        : { unavailableExplanation: 'A root does not apply or is not available for this word.' }),
    },
  ];
}

export function buildOccurrenceQuery(
  analysis: WordAnalysis,
  scope: WordOccurrenceScope,
  cursor?: string
): WordOccurrenceQuery {
  if (scope === 'lemma') {
    if (analysis.lemma.status !== 'available') throw new Error('Lemma occurrences are unavailable');
    return {
      scope,
      lemmaId: analysis.lemma.value.id,
      limit: OCCURRENCE_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    };
  }
  if (scope === 'root') {
    if (analysis.root.status !== 'available') throw new Error('Root occurrences are unavailable');
    return {
      scope,
      rootId: analysis.root.value.id,
      limit: OCCURRENCE_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    };
  }
  return {
    scope,
    normalizedSurface: analysis.normalizedSurface,
    locationKey: analysis.location.locationKey,
    limit: OCCURRENCE_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  };
}

export function buildRootFamilyLemmaQuery(
  lemma: Lemma,
  cursor?: string
): WordOccurrenceQuery {
  return {
    scope: 'lemma',
    lemmaId: lemma.id,
    limit: OCCURRENCE_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  };
}

export function orderRootFamilyLemmas(
  lemmas: readonly Lemma[],
  selectedLemmaId?: string
): readonly Lemma[] {
  return [...lemmas].sort((left, right) => {
    if (left.id === selectedLemmaId && right.id !== selectedLemmaId) return -1;
    if (right.id === selectedLemmaId && left.id !== selectedLemmaId) return 1;
    const countDifference = right.occurrenceCount - left.occurrenceCount;
    if (countDifference !== 0) return countDifference;
    return left.arabic.localeCompare(right.arabic, 'ar');
  });
}

export function getOccurrenceGloss(occurrence: WordOccurrence): string {
  return (
    occurrence.contextualGlosses.find((gloss) => gloss.languageCode === 'en')?.text ??
    occurrence.contextualGlosses[0]?.text ??
    'Contextual gloss unavailable.'
  );
}

export function getOccurrencePageLabel(
  cursor: string | undefined,
  itemCount: number,
  totalCount?: number
): string {
  const offset = cursor ? Number(cursor) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  if (!itemCount || !totalCount) return totalCount === 0 ? 'No results' : 'Results unavailable';
  return `${safeOffset + 1}–${safeOffset + itemCount} of ${totalCount}`;
}

export function buildOccurrenceReaderParams(occurrence: WordOccurrence): {
  pathname: '/surah/[surahId]';
  params: { surahId: string; startVerse: string; view: 'translation'; studyWordPosition: string };
} {
  return {
    pathname: '/surah/[surahId]',
    params: {
      surahId: String(occurrence.location.surah),
      startVerse: String(occurrence.location.ayah),
      view: 'translation',
      studyWordPosition: String(occurrence.location.wordPosition),
    },
  };
}
