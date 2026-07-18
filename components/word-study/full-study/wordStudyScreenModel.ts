import type {
  MorphologyFeatures,
  WordAnalysis,
  WordStudySourceReference,
} from '../../../src/core/domain/word-study';

import { describeMissingReason, getPosLabel, getPrimaryGloss } from '../wordQuickSheetModel';

export type MorphologyDetail = {
  key: keyof MorphologyFeatures;
  label: string;
  arabicTerm: string;
  value: string;
  explanation: string;
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
    { label: string; arabicTerm: string; explanation: string; format?: (value: string) => string }
  >
> = {
  aspect: {
    label: 'Aspect',
    arabicTerm: 'الزمن والصيغة',
    explanation: 'Shows whether a verb is perfect, imperfect, or imperative.',
  },
  mood: {
    label: 'Mood',
    arabicTerm: 'الحالة الإعرابية للفعل',
    explanation: 'Shows how an imperfect verb is grammatically governed here.',
  },
  voice: {
    label: 'Voice',
    arabicTerm: 'البناء',
    explanation: 'Shows whether the subject acts or receives the action.',
  },
  person: {
    label: 'Person',
    arabicTerm: 'الشخص',
    explanation: 'Identifies whether the form refers to the speaker, addressee, or someone else.',
    format: (value) => `${TITLE_CASE(value)} person`,
  },
  gender: {
    label: 'Gender',
    arabicTerm: 'الجنس',
    explanation: 'Records masculine, feminine, or common grammatical agreement.',
  },
  number: {
    label: 'Number',
    arabicTerm: 'العدد',
    explanation: 'Records singular, dual, or plural grammatical agreement.',
  },
  grammaticalCase: {
    label: 'Case',
    arabicTerm: 'الإعراب',
    explanation: 'Shows the noun or adjective case recorded for this occurrence.',
    format: (value) => `${TITLE_CASE(value)} case`,
  },
  grammaticalState: {
    label: 'State',
    arabicTerm: 'التعريف والإضافة',
    explanation: 'Shows whether the form is definite, indefinite, or in a construct phrase.',
  },
  verbForm: {
    label: 'Verb form',
    arabicTerm: 'وزن الفعل',
    explanation: 'Identifies the numbered Arabic derived verb pattern.',
    format: (value) => `Form ${value}`,
  },
  derivation: {
    label: 'Derivation',
    arabicTerm: 'المشتق',
    explanation: 'Identifies a sourced derived form such as a participle or verbal noun.',
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
        explanation: presentation.explanation,
      }];
    });
}

export function getPrimaryPosText(analysis: WordAnalysis): string {
  return analysis.primaryPos.status === 'available'
    ? getPosLabel(analysis.primaryPos.value)
    : describeMissingReason(analysis.primaryPos.reason);
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
