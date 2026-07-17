import type {
  Lemma,
  MorphologyFeatures,
  PaginatedWordOccurrences,
  Root,
  WordAnalysis,
  WordGloss,
  WordOccurrence,
  WordStudyField,
  WordStudySourceReference,
} from './WordStudy';
import { parseWordStudyLocation } from './WordStudyLocation';

export interface WordStudyGoldenLocationFixture {
  readonly index: number;
  readonly locationKey: string;
  readonly surfaceText: string;
  readonly gloss: string;
  readonly stratum: string;
}

const contractSource = {
  sourceId: 'phase-1-contract-fixture',
  sourceVersion: '2026-07-16',
} as const;

export const WORD_STUDY_CONTRACT_SOURCE: WordStudySourceReference = {
  ...contractSource,
  layer: 'morphology',
};

const surfaceSource: WordStudySourceReference = {
  ...contractSource,
  layer: 'surface',
};

const glossSource: WordStudySourceReference = {
  ...contractSource,
  layer: 'contextual-gloss',
};

const occurrenceSource: WordStudySourceReference = {
  ...contractSource,
  layer: 'occurrence-index',
};

function available<T>(value: T, source: WordStudySourceReference): WordStudyField<T> {
  return { status: 'available', value, source };
}

function gloss(text: string): WordGloss {
  return {
    languageCode: 'en',
    text,
    source: glossSource,
  };
}

const nazalaRoot: Root = {
  id: 'root-nzl',
  arabic: 'نزل',
  normalized: 'nzl',
  occurrenceCount: 293,
  lemmaCount: 12,
  source: WORD_STUDY_CONTRACT_SOURCE,
};

const anzalaLemma: Lemma = {
  id: 'lemma-anzala',
  arabic: 'أَنزَلَ',
  normalized: 'anzala',
  posCode: 'V',
  occurrenceCount: 183,
  source: WORD_STUDY_CONTRACT_SOURCE,
};

const verbFeatures: MorphologyFeatures = {
  aspect: 'perfect',
  voice: 'active',
  person: 'third',
  gender: 'masculine',
  number: 'singular',
  verbForm: 'IV',
  rawFeatures: ['PERF', 'ACT', '3MS', 'IV'],
};

export const WORD_STUDY_RICH_CONTRACT_FIXTURES: readonly WordAnalysis[] = [
  {
    location: parseWordStudyLocation('3:3:9'),
    surfaceUthmani: 'وَأَنزَلَ',
    normalizedSurface: 'وانزل',
    primaryPos: available('V', WORD_STUDY_CONTRACT_SOURCE),
    morphology: available(verbFeatures, WORD_STUDY_CONTRACT_SOURCE),
    morphemes: available(
      [
        {
          locationKey: '3:3:9',
          segmentIndex: 1,
          arabic: 'وَ',
          segmentType: 'prefix',
          posCode: 'CONJ',
          features: {},
          source: WORD_STUDY_CONTRACT_SOURCE,
        },
        {
          locationKey: '3:3:9',
          segmentIndex: 2,
          arabic: 'أَنزَلَ',
          segmentType: 'stem',
          posCode: 'V',
          features: verbFeatures,
          source: WORD_STUDY_CONTRACT_SOURCE,
        },
      ],
      WORD_STUDY_CONTRACT_SOURCE
    ),
    lemma: available(anzalaLemma, WORD_STUDY_CONTRACT_SOURCE),
    root: available(nazalaRoot, WORD_STUDY_CONTRACT_SOURCE),
    contextualGlosses: [gloss('and He revealed')],
    sourceReferences: [surfaceSource, WORD_STUDY_CONTRACT_SOURCE, glossSource],
  },
  {
    location: parseWordStudyLocation('2:141:11'),
    surfaceUthmani: 'وَلَا',
    normalizedSurface: 'ولا',
    primaryPos: available('PART', WORD_STUDY_CONTRACT_SOURCE),
    morphology: available({ rawFeatures: ['NEG'] }, WORD_STUDY_CONTRACT_SOURCE),
    morphemes: available(
      [
        {
          locationKey: '2:141:11',
          segmentIndex: 1,
          arabic: 'وَ',
          segmentType: 'prefix',
          posCode: 'CONJ',
          features: {},
          source: WORD_STUDY_CONTRACT_SOURCE,
        },
        {
          locationKey: '2:141:11',
          segmentIndex: 2,
          arabic: 'لَا',
          segmentType: 'stem',
          posCode: 'NEG',
          features: { rawFeatures: ['NEG'] },
          source: WORD_STUDY_CONTRACT_SOURCE,
        },
      ],
      WORD_STUDY_CONTRACT_SOURCE
    ),
    lemma: {
      status: 'unsupported',
      reason: 'lemma-not-provided',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    root: {
      status: 'unsupported',
      reason: 'particle-has-no-root',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    contextualGlosses: [gloss('and not')],
    sourceReferences: [surfaceSource, WORD_STUDY_CONTRACT_SOURCE, glossSource],
  },
  {
    location: parseWordStudyLocation('3:99:16'),
    surfaceUthmani: 'ٱللَّهُ',
    normalizedSurface: 'الله',
    primaryPos: available('PN', WORD_STUDY_CONTRACT_SOURCE),
    morphology: available(
      { grammaticalCase: 'nominative', rawFeatures: ['NOM'] },
      WORD_STUDY_CONTRACT_SOURCE
    ),
    morphemes: available(
      [
        {
          locationKey: '3:99:16',
          segmentIndex: 1,
          arabic: 'ٱللَّهُ',
          segmentType: 'whole-word',
          posCode: 'PN',
          features: { grammaticalCase: 'nominative', rawFeatures: ['NOM'] },
          source: WORD_STUDY_CONTRACT_SOURCE,
        },
      ],
      WORD_STUDY_CONTRACT_SOURCE
    ),
    lemma: available(
      {
        id: 'lemma-allah',
        arabic: 'ٱللَّه',
        normalized: 'الله',
        posCode: 'PN',
        occurrenceCount: 2699,
        source: WORD_STUDY_CONTRACT_SOURCE,
      },
      WORD_STUDY_CONTRACT_SOURCE
    ),
    root: {
      status: 'unsupported',
      reason: 'proper-noun-root-absent',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    contextualGlosses: [gloss('Allah')],
    sourceReferences: [surfaceSource, WORD_STUDY_CONTRACT_SOURCE, glossSource],
  },
  {
    location: parseWordStudyLocation('57:22:17'),
    surfaceUthmani: 'إِنَّ',
    normalizedSurface: 'ان',
    primaryPos: available('ACC', WORD_STUDY_CONTRACT_SOURCE),
    morphology: {
      status: 'unavailable',
      reason: 'not-yet-reviewed',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    morphemes: {
      status: 'missing',
      reason: 'segmentation-not-provided',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    lemma: {
      status: 'missing',
      reason: 'lemma-not-provided',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    root: {
      status: 'unsupported',
      reason: 'particle-has-no-root',
      source: WORD_STUDY_CONTRACT_SOURCE,
    },
    contextualGlosses: [gloss('indeed')],
    sourceReferences: [surfaceSource, WORD_STUDY_CONTRACT_SOURCE, glossSource],
  },
];

const verbOccurrences: readonly WordOccurrence[] = [
  {
    location: parseWordStudyLocation('3:3:9'),
    surfaceUthmani: 'وَأَنزَلَ',
    normalizedSurface: 'وانزل',
    ayahContextUthmani: 'نَزَّلَ عَلَيْكَ ٱلْكِتَٰبَ بِٱلْحَقِّ مُصَدِّقًا لِّمَا بَيْنَ يَدَيْهِ وَأَنزَلَ ٱلتَّوْرَىٰةَ وَٱلْإِنجِيلَ',
    contextualGlosses: [gloss('and He revealed')],
    sourceReferences: [surfaceSource, occurrenceSource, glossSource],
  },
  {
    location: parseWordStudyLocation('17:2:1'),
    surfaceUthmani: 'وَءَاتَيْنَا',
    normalizedSurface: 'واتينا',
    ayahContextUthmani: 'وَءَاتَيْنَا مُوسَى ٱلْكِتَٰبَ وَجَعَلْنَٰهُ هُدًى لِّبَنِىٓ إِسْرَٰٓءِيلَ',
    contextualGlosses: [gloss('and We gave')],
    sourceReferences: [surfaceSource, occurrenceSource, glossSource],
  },
];

export const WORD_STUDY_CONTRACT_OCCURRENCE_PAGE: PaginatedWordOccurrences = {
  query: {
    scope: 'root',
    rootId: 'root-nzl',
    limit: 1,
  },
  items: [verbOccurrences[0] as WordOccurrence],
  pageInfo: {
    limit: 1,
    nextCursor: 'fixture-cursor-1',
    hasNextPage: true,
    totalCount: verbOccurrences.length,
  },
};

export const WORD_STUDY_CONTRACT_OCCURRENCE_FINAL_PAGE: PaginatedWordOccurrences = {
  query: {
    scope: 'root',
    rootId: 'root-nzl',
    cursor: 'fixture-cursor-1',
    limit: 1,
  },
  items: [verbOccurrences[1] as WordOccurrence],
  pageInfo: {
    limit: 1,
    hasNextPage: false,
    totalCount: verbOccurrences.length,
  },
};

export const PHASE_0_GOLDEN_LOCATION_FIXTURES: readonly WordStudyGoldenLocationFixture[] = [
  { index: 1, locationKey: '2:141:11', surfaceText: 'وَلَا', gloss: 'And not', stratum: 'particles-prepositions' },
  { index: 2, locationKey: '3:84:19', surfaceText: 'وَٱلنَّبِيُّونَ', gloss: 'and the Prophets', stratum: 'particles-prepositions' },
  { index: 3, locationKey: '4:144:12', surfaceText: 'أَن', gloss: 'that', stratum: 'particles-prepositions' },
  { index: 4, locationKey: '6:99:16', surfaceText: 'مِنْهُ', gloss: 'from it', stratum: 'particles-prepositions' },
  { index: 5, locationKey: '8:38:13', surfaceText: 'فَقَدْ', gloss: 'then verily', stratum: 'particles-prepositions' },
  { index: 6, locationKey: '11:7:14', surfaceText: 'أَيُّكُمْ', gloss: 'which of you', stratum: 'particles-prepositions' },
  { index: 7, locationKey: '14:40:5', surfaceText: 'وَمِن', gloss: 'and from', stratum: 'particles-prepositions' },
  { index: 8, locationKey: '18:53:9', surfaceText: 'عَنْهَا', gloss: 'from it', stratum: 'particles-prepositions' },
  { index: 9, locationKey: '22:65:17', surfaceText: 'أَن', gloss: 'lest', stratum: 'particles-prepositions' },
  { index: 10, locationKey: '27:23:5', surfaceText: 'وَأُوتِيَتْ', gloss: 'and she has been given', stratum: 'particles-prepositions' },
  { index: 11, locationKey: '33:7:15', surfaceText: 'مِنْهُم', gloss: 'from them', stratum: 'particles-prepositions' },
  { index: 12, locationKey: '38:82:2', surfaceText: 'فَبِعِزَّتِكَ', gloss: 'Then by Your might', stratum: 'particles-prepositions' },
  { index: 13, locationKey: '44:58:1', surfaceText: 'فَإِنَّمَا', gloss: 'Indeed', stratum: 'particles-prepositions' },
  { index: 14, locationKey: '57:11:1', surfaceText: 'مَّن', gloss: 'Who (is)', stratum: 'particles-prepositions' },
  { index: 15, locationKey: '76:11:1', surfaceText: 'فَوَقَىٰهُمُ', gloss: 'But will protect them', stratum: 'particles-prepositions' },
  { index: 16, locationKey: '2:189:19', surfaceText: 'ٱتَّقَىٰ ۗ', gloss: 'fears (Allah)', stratum: 'divine-proper-names' },
  { index: 17, locationKey: '3:99:16', surfaceText: 'ٱللَّهُ', gloss: 'Allah', stratum: 'divine-proper-names' },
  { index: 18, locationKey: '4:119:10', surfaceText: 'ٱللَّهِ ۚ', gloss: '(of) Allah', stratum: 'divine-proper-names' },
  { index: 19, locationKey: '6:31:6', surfaceText: 'ٱللَّهِ ۖ', gloss: '(with) Allah', stratum: 'divine-proper-names' },
  { index: 20, locationKey: '9:9:3', surfaceText: 'ٱللَّهِ', gloss: '[with] the Verses of Allah', stratum: 'divine-proper-names' },
  { index: 21, locationKey: '10:81:10', surfaceText: 'ٱللَّهَ', gloss: 'Allah', stratum: 'divine-proper-names' },
  { index: 22, locationKey: '16:72:1', surfaceText: 'وَٱللَّهُ', gloss: 'And Allah', stratum: 'divine-proper-names' },
  { index: 23, locationKey: '24:21:17', surfaceText: 'فَضْلُ', gloss: '(for the) Grace of Allah', stratum: 'divine-proper-names' },
  { index: 24, locationKey: '31:11:3', surfaceText: 'ٱللَّهِ', gloss: '(of) Allah', stratum: 'divine-proper-names' },
  { index: 25, locationKey: '39:32:6', surfaceText: 'ٱللَّهِ', gloss: 'Allah', stratum: 'divine-proper-names' },
  { index: 26, locationKey: '48:6:14', surfaceText: 'ٱللَّهُ', gloss: "and Allah's wrath (is)", stratum: 'divine-proper-names' },
  { index: 27, locationKey: '62:11:19', surfaceText: 'وَٱللَّهُ', gloss: 'And Allah', stratum: 'divine-proper-names' },
  { index: 28, locationKey: '2:99:7', surfaceText: 'يَكْفُرُ', gloss: 'disbelieves', stratum: 'verbs-actions' },
  { index: 29, locationKey: '3:10:3', surfaceText: 'كَفَرُوا۟', gloss: 'disbelieve[d]', stratum: 'verbs-actions' },
  { index: 30, locationKey: '4:51:12', surfaceText: 'وَيَقُولُونَ', gloss: 'and they say', stratum: 'verbs-actions' },
  { index: 31, locationKey: '5:72:4', surfaceText: 'قَالُوٓا۟', gloss: 'say', stratum: 'verbs-actions' },
  { index: 32, locationKey: '6:158:34', surfaceText: 'قُلِ', gloss: 'Say', stratum: 'verbs-actions' },
  { index: 33, locationKey: '8:45:3', surfaceText: 'ءَامَنُوٓا۟', gloss: 'believe', stratum: 'verbs-actions' },
  { index: 34, locationKey: '10:50:1', surfaceText: 'قُلْ', gloss: 'Say', stratum: 'verbs-actions' },
  { index: 35, locationKey: '12:84:1', surfaceText: 'وَتَوَلَّىٰ', gloss: 'And he turned away', stratum: 'verbs-actions' },
  { index: 36, locationKey: '17:2:1', surfaceText: 'وَءَاتَيْنَا', gloss: 'And We gave', stratum: 'verbs-actions' },
  { index: 37, locationKey: '20:51:1', surfaceText: 'قَالَ', gloss: 'He said', stratum: 'verbs-actions' },
  { index: 38, locationKey: '23:110:4', surfaceText: 'أَنسَوْكُمْ', gloss: 'they made you forget', stratum: 'verbs-actions' },
  { index: 39, locationKey: '27:47:6', surfaceText: 'قَالَ', gloss: 'He said', stratum: 'verbs-actions' },
  { index: 40, locationKey: '31:28:2', surfaceText: 'خَلْقُكُمْ', gloss: '(is) your creation', stratum: 'verbs-actions' },
  { index: 41, locationKey: '37:29:5', surfaceText: 'مُؤْمِنِينَ', gloss: 'believers', stratum: 'verbs-actions' },
  { index: 42, locationKey: '41:30:12', surfaceText: 'تَخَافُوا۟', gloss: 'fear', stratum: 'verbs-actions' },
  { index: 43, locationKey: '48:14:5', surfaceText: 'يَغْفِرُ', gloss: 'He forgives', stratum: 'verbs-actions' },
  { index: 44, locationKey: '59:16:4', surfaceText: 'قَالَ', gloss: 'he says', stratum: 'verbs-actions' },
  { index: 45, locationKey: '77:43:2', surfaceText: 'وَٱشْرَبُوا۟', gloss: 'and drink', stratum: 'verbs-actions' },
  { index: 46, locationKey: '2:226:3', surfaceText: 'مِن', gloss: 'from', stratum: 'rootless-short-function' },
  { index: 47, locationKey: '4:104:6', surfaceText: 'إِن', gloss: 'If', stratum: 'rootless-short-function' },
  { index: 48, locationKey: '7:12:13', surfaceText: 'مِن', gloss: 'from', stratum: 'rootless-short-function' },
  { index: 49, locationKey: '10:61:23', surfaceText: 'عَن', gloss: 'from', stratum: 'rootless-short-function' },
  { index: 50, locationKey: '16:61:19', surfaceText: 'لَا', gloss: 'not', stratum: 'rootless-short-function' },
  { index: 51, locationKey: '22:5:19', surfaceText: 'ثُمَّ', gloss: 'then', stratum: 'rootless-short-function' },
  { index: 52, locationKey: '28:27:25', surfaceText: 'إِن', gloss: 'if', stratum: 'rootless-short-function' },
  { index: 53, locationKey: '37:35:3', surfaceText: 'إِذَا', gloss: 'when', stratum: 'rootless-short-function' },
  { index: 54, locationKey: '47:14:2', surfaceText: 'كَانَ', gloss: 'is', stratum: 'rootless-short-function' },
  { index: 55, locationKey: '70:30:4', surfaceText: 'أَوْ', gloss: 'or', stratum: 'rootless-short-function' },
  { index: 56, locationKey: '2:176:9', surfaceText: 'ٱخْتَلَفُوا۟', gloss: 'who differed', stratum: 'long-attached-forms' },
  { index: 57, locationKey: '3:190:6', surfaceText: 'وَٱخْتِلَـٰفِ', gloss: 'and (in the) alternation', stratum: 'long-attached-forms' },
  { index: 58, locationKey: '5:89:36', surfaceText: 'حَلَفْتُمْ ۚ', gloss: 'you have sworn', stratum: 'long-attached-forms' },
  { index: 59, locationKey: '7:160:1', surfaceText: 'وَقَطَّعْنَـٰهُمُ', gloss: 'And We divided them', stratum: 'long-attached-forms' },
  { index: 60, locationKey: '10:73:7', surfaceText: 'وَجَعَلْنَـٰهُمْ', gloss: 'and We made them', stratum: 'long-attached-forms' },
  { index: 61, locationKey: '16:36:11', surfaceText: 'ٱلطَّـٰغُوتَ ۖ', gloss: 'the false deities', stratum: 'long-attached-forms' },
  { index: 62, locationKey: '21:38:1', surfaceText: 'وَيَقُولُونَ', gloss: 'And they say', stratum: 'long-attached-forms' },
  { index: 63, locationKey: '26:176:4', surfaceText: 'ٱلْمُرْسَلِينَ', gloss: 'the Messengers', stratum: 'long-attached-forms' },
  { index: 64, locationKey: '33:53:48', surfaceText: 'لِقُلُوبِكُمْ', gloss: 'for your hearts', stratum: 'long-attached-forms' },
  { index: 65, locationKey: '41:20:8', surfaceText: 'وَأَبْصَـٰرُهُمْ', gloss: 'and their sight', stratum: 'long-attached-forms' },
  { index: 66, locationKey: '53:45:3', surfaceText: 'ٱلزَّوْجَيْنِ', gloss: 'the pairs', stratum: 'long-attached-forms' },
  { index: 67, locationKey: '70:40:4', surfaceText: 'ٱلْمَشَـٰرِقِ', gloss: '(of) the risings', stratum: 'long-attached-forms' },
  { index: 68, locationKey: '3:19:1', surfaceText: 'إِنَّ', gloss: 'Indeed', stratum: 'first-word-of-verse' },
  { index: 69, locationKey: '6:145:1', surfaceText: 'قُل', gloss: 'Say', stratum: 'first-word-of-verse' },
  { index: 70, locationKey: '11:86:1', surfaceText: 'بَقِيَّتُ', gloss: '(What) remains', stratum: 'first-word-of-verse' },
  { index: 71, locationKey: '18:45:1', surfaceText: 'وَٱضْرِبْ', gloss: 'And present', stratum: 'first-word-of-verse' },
  { index: 72, locationKey: '24:18:1', surfaceText: 'وَيُبَيِّنُ', gloss: 'And Allah makes clear', stratum: 'first-word-of-verse' },
  { index: 73, locationKey: '30:23:1', surfaceText: 'وَمِنْ', gloss: 'And among', stratum: 'first-word-of-verse' },
  { index: 74, locationKey: '38:84:1', surfaceText: 'قَالَ', gloss: 'He said', stratum: 'first-word-of-verse' },
  { index: 75, locationKey: '51:3:1', surfaceText: 'فَٱلْجَـٰرِيَـٰتِ', gloss: 'And those sailing', stratum: 'first-word-of-verse' },
  { index: 76, locationKey: '68:31:1', surfaceText: 'قَالُوا۟', gloss: 'They said', stratum: 'first-word-of-verse' },
  { index: 77, locationKey: '85:16:1', surfaceText: 'فَعَّالٌۭ', gloss: 'Doer', stratum: 'first-word-of-verse' },
  { index: 78, locationKey: '2:158:13', surfaceText: 'جُنَاحَ', gloss: 'blame', stratum: 'middle-word-of-long-verse' },
  { index: 79, locationKey: '3:159:15', surfaceText: 'فَٱعْفُ', gloss: 'Then pardon', stratum: 'middle-word-of-long-verse' },
  { index: 80, locationKey: '5:36:13', surfaceText: 'لِيَفْتَدُوا۟', gloss: 'to ransom themselves', stratum: 'middle-word-of-long-verse' },
  { index: 81, locationKey: '7:57:15', surfaceText: 'لِبَلَدٍۢ', gloss: 'to a land', stratum: 'middle-word-of-long-verse' },
  { index: 82, locationKey: '9:108:11', surfaceText: 'يَوْمٍ', gloss: 'day', stratum: 'middle-word-of-long-verse' },
  { index: 83, locationKey: '13:5:14', surfaceText: 'كَفَرُوا۟', gloss: 'disbelieved', stratum: 'middle-word-of-long-verse' },
  { index: 84, locationKey: '20:72:10', surfaceText: 'فَطَرَنَا ۖ', gloss: 'created us', stratum: 'middle-word-of-long-verse' },
  { index: 85, locationKey: '29:25:15', surfaceText: 'ٱلْقِيَـٰمَةِ', gloss: '(of) the Resurrection', stratum: 'middle-word-of-long-verse' },
  { index: 86, locationKey: '40:5:11', surfaceText: 'بِرَسُولِهِمْ', gloss: 'against their Messenger', stratum: 'middle-word-of-long-verse' },
  { index: 87, locationKey: '57:29:10', surfaceText: 'فَضْلِ', gloss: '(the) Bounty', stratum: 'middle-word-of-long-verse' },
  { index: 88, locationKey: '3:97:25', surfaceText: 'ٱلْعَـٰلَمِينَ', gloss: 'the universe', stratum: 'last-word-of-verse' },
  { index: 89, locationKey: '8:9:11', surfaceText: 'مُرْدِفِينَ', gloss: 'one after another', stratum: 'last-word-of-verse' },
  { index: 90, locationKey: '16:48:17', surfaceText: 'دَٰخِرُونَ', gloss: '(are) humble', stratum: 'last-word-of-verse' },
  { index: 91, locationKey: '23:55:7', surfaceText: 'وَبَنِينَ', gloss: 'and children', stratum: 'last-word-of-verse' },
  { index: 92, locationKey: '32:5:17', surfaceText: 'تَعُدُّونَ', gloss: 'you count', stratum: 'last-word-of-verse' },
  { index: 93, locationKey: '42:16:18', surfaceText: 'شَدِيدٌ', gloss: 'severe', stratum: 'last-word-of-verse' },
  { index: 94, locationKey: '56:89:4', surfaceText: 'نَعِيمٍۢ', gloss: '(of) Pleasure', stratum: 'last-word-of-verse' },
  { index: 95, locationKey: '82:18:6', surfaceText: 'ٱلدِّينِ', gloss: '(of the) Judgment', stratum: 'last-word-of-verse' },
  { index: 96, locationKey: '3:93:21', surfaceText: 'فَٱتْلُوهَآ', gloss: 'and recite it', stratum: 'whole-quran-spread' },
  { index: 97, locationKey: '8:44:5', surfaceText: 'فِىٓ', gloss: 'in', stratum: 'whole-quran-spread' },
  { index: 98, locationKey: '18:77:22', surfaceText: 'لَتَّخَذْتَ', gloss: 'surely you (could) have taken', stratum: 'whole-quran-spread' },
  { index: 99, locationKey: '33:27:10', surfaceText: 'عَلَىٰ', gloss: 'on', stratum: 'whole-quran-spread' },
  { index: 100, locationKey: '57:22:17', surfaceText: 'إِنَّ', gloss: 'Indeed', stratum: 'whole-quran-spread' },
];
