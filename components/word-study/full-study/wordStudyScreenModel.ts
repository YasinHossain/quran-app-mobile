import type {
  MorphologyFeatures,
  WordAnalysis,
  WordStudySourceReference,
} from '../../../src/core/domain/word-study';

import { describeMissingReason, getPrimaryGloss } from '../wordQuickSheetModel';

export type MorphologyDetail = {
  key: keyof MorphologyFeatures;
  label: string;
  arabicTerm: string;
  value: string;
};

export type StudySourcePresentation = {
  key: string;
  title: string;
  version: string;
  layers: readonly string[];
  attribution: string;
  url?: string;
};

const TITLE_CASE = (value: string): string =>
  value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const FEATURE_PRESENTATION: Readonly<
  Record<
    Exclude<keyof MorphologyFeatures, 'rawFeatures'>,
    { label: string; arabicTerm: string; format?: (value: string) => string }
  >
> = {
  aspect: {
    label: 'Aspect',
    arabicTerm: 'الزمن والصيغة',
  },
  mood: {
    label: 'Mood',
    arabicTerm: 'الحالة الإعرابية للفعل',
  },
  voice: {
    label: 'Voice',
    arabicTerm: 'البناء',
  },
  person: {
    label: 'Person',
    arabicTerm: 'الشخص',
    format: (value) => `${TITLE_CASE(value)} person`,
  },
  gender: {
    label: 'Gender',
    arabicTerm: 'الجنس',
  },
  number: {
    label: 'Number',
    arabicTerm: 'العدد',
  },
  grammaticalCase: {
    label: 'Case',
    arabicTerm: 'الإعراب',
    format: (value) => `${TITLE_CASE(value)} case`,
  },
  grammaticalState: {
    label: 'State',
    arabicTerm: 'التعريف والإضافة',
  },
  verbForm: {
    label: 'Verb form',
    arabicTerm: 'وزن الفعل',
    format: (value) => `Form ${value}`,
  },
  derivation: {
    label: 'Derivation',
    arabicTerm: 'المشتق',
  },
};

export function getMorphologyDetails(features: MorphologyFeatures): readonly MorphologyDetail[] {
  return (Object.keys(FEATURE_PRESENTATION) as Array<keyof typeof FEATURE_PRESENTATION>)
    .flatMap((key) => {
      const value = features[key];
      if (!value) return [];
      const presentation = FEATURE_PRESENTATION[key];
      return [{
        key,
        label: presentation.label,
        arabicTerm: presentation.arabicTerm,
        value: presentation.format ? presentation.format(String(value)) : TITLE_CASE(String(value)),
      }];
    });
}

export function getLemmaText(analysis: WordAnalysis): string {
  return analysis.lemma.status === 'available'
    ? analysis.lemma.value.arabic
    : describeMissingReason(analysis.lemma.reason);
}

export function getRootText(analysis: WordAnalysis): string {
  return analysis.root.status === 'available'
    ? analysis.root.value.arabic
    : describeMissingReason(analysis.root.reason);
}

export function getStudySources(
  references: readonly WordStudySourceReference[]
): readonly StudySourcePresentation[] {
  const grouped = new Map<string, { reference: WordStudySourceReference; layers: Set<string> }>();
  for (const reference of references) {
    const key = `${reference.sourceId}:${reference.sourceVersion}`;
    const current = grouped.get(key) ?? { reference, layers: new Set<string>() };
    current.layers.add(reference.layer);
    grouped.set(key, current);
  }
  return [...grouped.entries()].map(([key, { reference, layers }]) => {
    if (reference.sourceId === 'qac-morphology-v0.4') {
      return {
        key,
        title: 'Quranic Arabic Corpus morphology',
        version: reference.sourceVersion,
        layers: [...layers],
        attribution: 'Quranic Arabic Corpus v0.4, Copyright © 2011 Kais Dukes.',
        url: 'https://corpus.quran.com/download/',
      };
    }
    if (reference.sourceId.startsWith('quran-app-offline-word-pack-')) {
      return {
        key,
        title: 'Quran App offline word pack',
        version: reference.sourceVersion,
        layers: [...layers],
        attribution: 'Canonical Uthmani surface and contextual word gloss from the installed offline pack.',
      };
    }
    return {
      key,
      title: reference.sourceId,
      version: reference.sourceVersion,
      layers: [...layers],
      attribution: 'Included in the installed Word Study pack.',
    };
  });
}

export function buildWordStudyShareMessage(analysis: WordAnalysis, surahName: string): string {
  const lemma = analysis.lemma.status === 'available' ? `Lemma: ${analysis.lemma.value.arabic}` : null;
  const root = analysis.root.status === 'available' ? `Root: ${analysis.root.value.arabic}` : null;
  const sources = getStudySources(analysis.sourceReferences)
    .map((source) => `${source.title} ${source.version}`)
    .join('; ');
  return [
    `${surahName} ${analysis.location.locationKey}`,
    analysis.surfaceUthmani,
    getPrimaryGloss(analysis),
    lemma,
    root,
    sources ? `Analysis sources: ${sources}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n');
}
