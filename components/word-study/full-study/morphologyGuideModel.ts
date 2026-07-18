export type MorphologyGuideTerm = {
  key: string;
  label: string;
  arabicTerm: string;
  definition: string;
  example?: string;
};

export type MorphologyGuideGroup = {
  key: 'segments' | 'features';
  title: string;
  terms: readonly MorphologyGuideTerm[];
};

export const MORPHOLOGY_GUIDE_GROUPS: readonly MorphologyGuideGroup[] = [
  {
    key: 'segments',
    title: 'Segments',
    terms: [
      {
        key: 'prefix',
        label: 'Prefix',
        arabicTerm: 'سابقة',
        definition: 'An attached segment before the stem.',
        example: 'Example: وَ in وَأَنزَلَ adds “and.”',
      },
      {
        key: 'stem',
        label: 'Stem',
        arabicTerm: 'جذع الكلمة',
        definition: 'The central lexical part of this occurrence.',
      },
      {
        key: 'suffix',
        label: 'Suffix',
        arabicTerm: 'لاحقة',
        definition: 'An attached ending, often encoding a pronoun or inflection.',
        example: 'Example: كُمْ can identify an attached second-person plural pronoun.',
      },
      {
        key: 'infix',
        label: 'Infix',
        arabicTerm: 'مقطع داخلي',
        definition: 'A sourced segment occurring inside the word form.',
      },
      {
        key: 'whole-word',
        label: 'Whole word',
        arabicTerm: 'الكلمة كاملة',
        definition: 'The analysis applies to the word as one segment.',
      },
    ],
  },
  {
    key: 'features',
    title: 'Features',
    terms: [
      {
        key: 'aspect',
        label: 'Aspect',
        arabicTerm: 'الزمن والصيغة',
        definition: 'Shows whether a verb is perfect, imperfect, or imperative.',
        example: 'Perfect commonly presents an action as completed.',
      },
      {
        key: 'mood',
        label: 'Mood',
        arabicTerm: 'الحالة الإعرابية للفعل',
        definition: 'Shows how an imperfect verb is grammatically governed here.',
      },
      {
        key: 'voice',
        label: 'Voice',
        arabicTerm: 'البناء',
        definition: 'Shows whether the subject acts or receives the action.',
      },
      {
        key: 'person',
        label: 'Person',
        arabicTerm: 'الشخص',
        definition: 'Identifies whether the form refers to the speaker, addressee, or someone else.',
      },
      {
        key: 'gender',
        label: 'Gender',
        arabicTerm: 'الجنس',
        definition: 'Records masculine, feminine, or common grammatical agreement.',
      },
      {
        key: 'number',
        label: 'Number',
        arabicTerm: 'العدد',
        definition: 'Records singular, dual, or plural grammatical agreement.',
      },
      {
        key: 'grammatical-case',
        label: 'Case',
        arabicTerm: 'الإعراب',
        definition: 'Shows the noun or adjective case recorded for this occurrence.',
        example: 'The source may record nominative, accusative, or genitive case.',
      },
      {
        key: 'grammatical-state',
        label: 'State',
        arabicTerm: 'التعريف والإضافة',
        definition: 'Shows whether the form is definite, indefinite, or in a construct phrase.',
      },
      {
        key: 'verb-form',
        label: 'Verb form',
        arabicTerm: 'وزن الفعل',
        definition: 'Identifies the numbered Arabic derived verb pattern.',
        example: 'Example: Form IV is displayed as “Form IV.”',
      },
      {
        key: 'derivation',
        label: 'Derivation',
        arabicTerm: 'المشتق',
        definition: 'Identifies a sourced derived form such as a participle or verbal noun.',
      },
    ],
  },
];
