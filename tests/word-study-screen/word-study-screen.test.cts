declare const process: { cwd(): string };
declare function require(id: string): any;

const assert = require('node:assert/strict') as {
  deepEqual(actual: unknown, expected: unknown): void;
  doesNotMatch(actual: string, expected: RegExp): void;
  equal(actual: unknown, expected: unknown): void;
  match(actual: string, expected: RegExp): void;
  ok(value: unknown): void;
};
const { readFileSync } = require('node:fs') as { readFileSync(path: string, encoding: string): string };
const { join } = require('node:path') as { join(...parts: string[]): string };
const test = require('node:test') as (name: string, callback: () => void | Promise<void>) => void;

import {
  WORD_STUDY_CONTRACT_OCCURRENCE_PAGE,
  WORD_STUDY_RICH_CONTRACT_FIXTURES,
  type Morpheme,
  type WordAnalysis,
} from '../../src/core/domain/word-study';
import {
  buildWordStudyShareMessage,
  getMorphologyDetails,
  getRootText,
  getStudySources,
  groupMorphologySegments,
} from '../../components/word-study/full-study/wordStudyScreenModel';
import { MORPHOLOGY_GUIDE_GROUPS } from '../../components/word-study/full-study/morphologyGuideModel';
import {
  getStoredWordTranslation,
  resolveContextualMeaning,
} from '../../components/word-study/full-study/contextualMeaningModel';
import {
  getCollapsedAyahCapacity,
  getSelectedAyahExcerpt,
  shouldCollapseAyah,
} from '../../components/word-study/full-study/ayahContextSelectorModel';
import {
  OCCURRENCE_PAGE_SIZE,
  buildOccurrenceQuery,
  buildOccurrenceReaderParams,
  buildRootFamilyLemmaQuery,
  getOccurrenceCounters,
  getOccurrenceFilters,
  getOccurrenceGloss,
  getOccurrencePageLabel,
  orderRootFamilyLemmas,
} from '../../components/word-study/full-study/occurrenceExplorerModel';
import { findSelectedWordGrammarPassages } from '../../components/word-study/full-study/grammarStudyModel';
import { GetDictionaryReferences } from '../../src/core/application/use-cases/word-study/GetDictionaryReferences';
import { GetVerbReference } from '../../src/core/application/use-cases/word-study/GetVerbReference';
import type { IDictionaryReferenceRepository } from '../../src/core/domain/repositories/IDictionaryReferenceRepository';
import type { IVerbReferenceRepository } from '../../src/core/domain/repositories/IVerbReferenceRepository';

const verb = WORD_STUDY_RICH_CONTRACT_FIXTURES[0] as WordAnalysis;
const particle = WORD_STUDY_RICH_CONTRACT_FIXTURES[1] as WordAnalysis;
const properNoun = WORD_STUDY_RICH_CONTRACT_FIXTURES[2] as WordAnalysis;

test('morphology rows contain only source-applicable labeled values', () => {
  assert.equal(verb.morphology.status, 'available');
  if (verb.morphology.status !== 'available') return;
  const rows = getMorphologyDetails(verb.morphology.value);
  assert.deepEqual(rows.map((row) => row.key), ['aspect', 'voice', 'person', 'gender', 'number', 'verbForm']);
  assert.equal(rows.find((row) => row.key === 'verbForm')?.value, 'Form IV');
  assert.ok(rows.every((row) => row.label.length > 0 && row.arabicTerm.length > 0 && row.value.length > 0));
  assert.ok(rows.every((row) => !('explanation' in row)));
  assert.equal(rows.some((row) => row.key === 'mood'), false);
  assert.equal(getMorphologyDetails({}).length, 0);
});

test('segment features render once for multi-segment and one-segment words', () => {
  assert.equal(verb.morphemes.status, 'available');
  assert.equal(properNoun.morphemes.status, 'available');
  if (verb.morphemes.status !== 'available' || properNoun.morphemes.status !== 'available') return;

  assert.deepEqual(
    verb.morphemes.value.map((segment) => ({
      role: segment.segmentType,
      keys: getMorphologyDetails(segment.features).map((row) => row.key),
    })),
    [
      { role: 'prefix', keys: [] },
      { role: 'stem', keys: ['aspect', 'voice', 'person', 'gender', 'number', 'verbForm'] },
    ]
  );
  assert.deepEqual(
    properNoun.morphemes.value.map((segment) => ({
      role: segment.segmentType,
      keys: getMorphologyDetails(segment.features).map((row) => row.key),
    })),
    [{ role: 'whole-word', keys: ['grammaticalCase'] }]
  );
  assert.deepEqual(
    getMorphologyDetails({ grammaticalCase: 'genitive', grammaticalState: 'definite' })
      .map((row) => row.key),
    ['grammaticalCase', 'grammaticalState']
  );
});

test('consecutive prefixes and suffixes share a group without merging their morphemes', () => {
  assert.equal(verb.morphemes.status, 'available');
  if (verb.morphemes.status !== 'available') return;
  const prefix = verb.morphemes.value[0] as Morpheme;
  const stem = verb.morphemes.value[1] as Morpheme;
  const segments: Morpheme[] = [
    prefix,
    { ...prefix, segmentIndex: 2, arabic: 'بِ' },
    { ...stem, segmentIndex: 3 },
    { ...prefix, segmentIndex: 4, arabic: 'تُ', segmentType: 'suffix', posCode: 'PRON' },
    { ...prefix, segmentIndex: 5, arabic: 'هَا', segmentType: 'suffix', posCode: 'PRON' },
  ];

  const groups = groupMorphologySegments(segments);
  assert.deepEqual(groups.map((group) => ({
    type: group.segmentType,
    arabic: group.segments.map((segment) => segment.arabic),
  })), [
    { type: 'prefix', arabic: ['وَ', 'بِ'] },
    { type: 'stem', arabic: ['أَنزَلَ'] },
    { type: 'suffix', arabic: ['تُ', 'هَا'] },
  ]);
});

test('morphology guide groups all segment and feature terms with Arabic labels', () => {
  assert.deepEqual(MORPHOLOGY_GUIDE_GROUPS.map((group) => group.title), ['Segments', 'Features']);
  assert.deepEqual(
    MORPHOLOGY_GUIDE_GROUPS[0]?.terms.map((term) => term.label),
    ['Prefix', 'Stem', 'Suffix', 'Infix', 'Whole word']
  );
  assert.deepEqual(
    MORPHOLOGY_GUIDE_GROUPS[1]?.terms.map((term) => term.label),
    ['Aspect', 'Mood', 'Voice', 'Person', 'Gender', 'Number', 'Case', 'State', 'Verb form', 'Derivation']
  );
  assert.ok(MORPHOLOGY_GUIDE_GROUPS.every((group) =>
    group.terms.every((term) => term.arabicTerm.length > 0 && term.definition.length > 20)
  ));
});

test('contextual meaning uses the selected installed language at the exact word position', () => {
  const wordsJson = JSON.stringify([
    { position: 8, charTypeName: 'word', translationText: 'previous' },
    { position: 9, charTypeName: 'word', translationText: 'এবং তিনি নাযিল করেছেন' },
    { position: 10, charTypeName: 'end', translationText: '(3)' },
  ]);
  assert.equal(getStoredWordTranslation(wordsJson, 9), 'এবং তিনি নাযিল করেছেন');
  assert.equal(getStoredWordTranslation(wordsJson, 10), null);

  const meaning = resolveContextualMeaning({
    analysis: verb,
    selectedLanguageCode: 'bn',
    selectedLanguageWordsJson: wordsJson,
  });
  assert.deepEqual(meaning, {
    text: 'এবং তিনি নাযিল করেছেন',
    languageCode: 'bn',
    languageName: 'Bangla',
    direction: 'ltr',
    sourceLabel: 'Bangla · Installed offline',
    isFallback: false,
  });
});

test('contextual meaning labels deterministic bundled-English fallback', () => {
  const fallback = resolveContextualMeaning({
    analysis: verb,
    selectedLanguageCode: 'ur',
    selectedLanguageWordsJson: null,
  });
  assert.equal(fallback.text, 'and He revealed');
  assert.equal(fallback.languageCode, 'en');
  assert.equal(fallback.direction, 'ltr');
  assert.equal(fallback.sourceLabel, 'English fallback · Bundled offline');
  assert.equal(fallback.isFallback, true);
  assert.match(fallback.fallbackMessage ?? '', /Urdu is not available offline/);

  const urdu = resolveContextualMeaning({
    analysis: verb,
    selectedLanguageCode: 'ur',
    selectedLanguageWordsJson: JSON.stringify([
      { position: 9, charTypeName: 'word', translationText: 'اور نازل کی' },
    ]),
  });
  assert.equal(urdu.direction, 'rtl');
  assert.equal(urdu.isFallback, false);
});

test('rootless particles explain the absence instead of rendering a blank field', () => {
  assert.equal(particle.root.status, 'unsupported');
  assert.equal(getRootText(particle), 'No root applies to this particle.');
});

test('collapsed ayah excerpts are deterministic and keep the selected word visible', () => {
  const words = Array.from({ length: 20 }, (_, index) => ({
    wordPosition: index + 1,
    surfaceUthmani: index % 2 === 0 ? 'ٱلْكَلِمَةُ' : 'مِنْ',
  }));
  const capacity = getCollapsedAyahCapacity(390, 31, 3);

  assert.equal(shouldCollapseAyah(words.slice(0, 4), capacity), false);
  assert.equal(shouldCollapseAyah(words, capacity), true);
  for (const selectedPosition of [1, 10, 20]) {
    const range = getSelectedAyahExcerpt(words, selectedPosition, capacity);
    assert.ok(range.startIndex >= 0);
    assert.ok(range.endIndex <= words.length);
    assert.ok(words.slice(range.startIndex, range.endIndex)
      .some((word) => word.wordPosition === selectedPosition));
  }
});

test('source presentation and sharing retain source versions and attribution', () => {
  const analysis: WordAnalysis = {
    ...verb,
    sourceReferences: [
      { sourceId: 'qac-morphology-v0.4', sourceVersion: '0.4', layer: 'morphology' },
      { sourceId: 'qac-morphology-v0.4', sourceVersion: '0.4', layer: 'segmentation' },
      {
        sourceId: 'quran-app-offline-word-pack-en-2026-07-04',
        sourceVersion: '2026-07-04',
        layer: 'contextual-gloss',
      },
    ],
  };
  const sources = getStudySources(analysis.sourceReferences);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0]?.layers, ['morphology', 'segmentation']);
  const message = buildWordStudyShareMessage(analysis, 'Ali ‘Imran');
  assert.match(message, /Ali ‘Imran 3:3:9/);
  assert.match(message, /Quranic Arabic Corpus morphology 0\.4/);
  assert.match(message, /Root:/);
});

test('Arabic grammar matching returns the passage containing the complete selected word', () => {
  const passages = findSelectedWordGrammarPassages(
    {
      verseKey: '3:3',
      passages: [
        {
          sequence: 1,
          headingArabic: 'نَزَّلَ عَلَيْكَ الْكِتابَ',
          bodyArabic: 'نزّل: فعل ماض.',
        },
        {
          sequence: 2,
          headingArabic: 'وَأَنْزَلَ التَّوْراةَ وَالْإِنْجِيلَ',
          bodyArabic: 'معطوفة بالواو.',
        },
      ],
      source: { sourceId: 'fixture', sourceVersion: '1', layer: 'grammar' },
      reviewStatus: 'source-provided',
    },
    verb
  );
  assert.deepEqual(passages.map((passage) => passage.sequence), [2]);
});

test('Arabic grammar matching does not promote passages that only share a suffix', () => {
  const selectedWord: WordAnalysis = {
    ...verb,
    surfaceUthmani: 'مِنْهُمْ',
    normalizedSurface: 'منهم',
    morphemes: {
      status: 'available',
      value: [
        {
          locationKey: '4:6:1:1',
          segmentIndex: 1,
          arabic: 'مِنْ',
          segmentType: 'stem',
          posCode: 'P',
          features: {},
          source: { sourceId: 'fixture', sourceVersion: '1', layer: 'segmentation' },
        },
        {
          locationKey: '4:6:1:2',
          segmentIndex: 2,
          arabic: 'هُمْ',
          segmentType: 'suffix',
          posCode: 'PRON',
          features: {},
          source: { sourceId: 'fixture', sourceVersion: '1', layer: 'segmentation' },
        },
      ],
      source: { sourceId: 'fixture', sourceVersion: '1', layer: 'segmentation' },
    },
  };
  const passages = findSelectedWordGrammarPassages(
    {
      verseKey: '4:6',
      passages: [
        {
          sequence: 1,
          headingArabic: 'فَإِنْ آنَسْتُمْ مِنْهُمْ رُشْدًا',
          bodyArabic: 'تحليل العبارة الأولى.',
        },
        {
          sequence: 2,
          headingArabic: 'فَادْفَعُوا إِلَيْهِمْ أَمْوَالَهُمْ',
          bodyArabic: 'تحليل العبارة الثانية.',
        },
      ],
      source: { sourceId: 'fixture', sourceVersion: '1', layer: 'grammar' },
      reviewStatus: 'source-provided',
    },
    selectedWord
  );

  assert.deepEqual(passages.map((passage) => passage.sequence), [1]);
});

test('occurrence counters use brief surface, lemma, root, and root-family labels', () => {
  assert.deepEqual(
    getOccurrenceCounters(verb, 7).map((counter) => [counter.label, counter.value]),
    [
      ['Surface', 7],
      ['Lemma', 183],
      ['Root', 293],
      ['Root forms', 12],
    ]
  );
  assert.deepEqual(
    getOccurrenceFilters(particle).map((filter) => [filter.label, filter.enabled]),
    [
      ['Surface', true],
      ['Lemma', false],
      ['Root', false],
    ]
  );
});

test('occurrence queries remain fixed-size and reader navigation retains the exact word location', () => {
  assert.equal(OCCURRENCE_PAGE_SIZE, 30);
  assert.deepEqual(buildOccurrenceQuery(verb, 'surface'), {
    scope: 'surface',
    normalizedSurface: verb.normalizedSurface,
    locationKey: verb.location.locationKey,
    limit: 30,
  });
  assert.equal(buildOccurrenceQuery(verb, 'lemma', '30').cursor, '30');
  assert.equal(buildOccurrenceQuery(verb, 'root').rootId, 'root-nzl');

  const occurrence = WORD_STUDY_CONTRACT_OCCURRENCE_PAGE.items[0]!;
  assert.equal(getOccurrenceGloss(occurrence), 'and He revealed');
  assert.equal(getOccurrencePageLabel('30', 30, 93), '31–60 of 93');
  assert.deepEqual(buildOccurrenceReaderParams(occurrence), {
    pathname: '/surah/[surahId]',
    params: { surahId: '3', startVerse: '3', view: 'translation', studyWordPosition: '9' },
  });
});

test('root-family forms pin the selected lemma and drill into its occurrence query', () => {
  assert.equal(verb.lemma.status, 'available');
  if (verb.lemma.status !== 'available') return;
  const selectedLemma = verb.lemma.value;
  const lessFrequentLemma = {
    ...selectedLemma,
    id: 'lemma-nzl-form-i',
    arabic: 'نَزَلَ',
    occurrenceCount: 75,
  };
  const ordered = orderRootFamilyLemmas([lessFrequentLemma, selectedLemma], selectedLemma.id);
  assert.deepEqual(ordered.map((lemma) => lemma.id), [selectedLemma.id, lessFrequentLemma.id]);
  assert.deepEqual(buildRootFamilyLemmaQuery(lessFrequentLemma, '30'), {
    scope: 'lemma',
    lemmaId: 'lemma-nzl-form-i',
    limit: 30,
    cursor: '30',
  });
});

test('full screen uses Morphology-first information architecture without repeated analysis', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/study/word/[surah]/[ayah]/[position].tsx'),
    'utf8'
  );
  assert.match(source, /<AyahContextSelector/);
  assert.match(source, /readWordStudyNavigationHandoff/);
  assert.match(source, /contextWords\.length === 0/);
  assert.match(source, /words\.length[\s\S]*?immediateContextWords/);
  assert.match(source, /router\.setParams\(\{ position:/);
  assert.match(source, /label: 'Morphology'/);
  assert.match(source, /label: 'Grammar'/);
  assert.match(source, /label: 'Occurrences'/);
  assert.match(source, /label: 'Dictionary'/);
  assert.ok(source.indexOf("label: 'Morphology'") < source.indexOf("label: 'Grammar'"));
  assert.ok(source.indexOf("label: 'Grammar'") < source.indexOf("label: 'Occurrences'"));
  assert.ok(source.indexOf("label: 'Occurrences'") < source.indexOf("label: 'Dictionary'"));
  assert.match(source, /useState<StudyTab>\('morphology'\)/);
  assert.match(source, /Meaning in this ayah/);
  assert.match(source, /useContextualMeaning\(selected\)/);
  assert.match(source, /accessibilityLabel=\{\[/);
  assert.match(source, /state\.presentation\.sourceLabel/);
  assert.match(source, /state\.presentation\.fallbackMessage/);
  assert.doesNotMatch(source, /meaningSourceBadge|meaningSourceText|fallbackRow|fallbackText/);
  assert.match(source, /writingDirection: state\.presentation\.direction/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /label="Lemma"/);
  assert.match(source, /label="Root"/);
  assert.match(source, /<VerbReferenceSection analysis=\{analysis\} palette=\{palette\}/);
  assert.match(source, /onRequestScrollToFilters=\{handleScrollToOccurrenceFilters\}/);
  assert.match(source, /occurrenceSectionYRef\.current \+ offsetY/);
  assert.match(source, /How this word is built/);
  assert.ok(source.indexOf('<ContextualMeaningBlock') < source.indexOf('How this word is built'));
  assert.ok(source.indexOf('label="Lemma"') < source.indexOf('How this word is built'));
  assert.ok(source.indexOf('label="Root"') < source.indexOf('How this word is built'));
  assert.match(source, /<SlidingSegmentedControl/);
  assert.match(source, /items=\{WORD_STUDY_TABS\}/);
  assert.match(source, /InteractionManager\.runAfterInteractions/);
  assert.match(source, /function PersistentTabPanel/);
  assert.match(source, /mountedTabs\.has\('grammar'\)/);
  assert.match(source, /mountedTabs\.has\('occurrences'\)/);
  assert.match(source, /mountedTabs\.has\('dictionary'\)/);
  assert.match(source, /hiddenTab: \{ display: 'none' \}/);
  assert.match(source, /isActive=\{tab === 'dictionary'\}/);
  assert.doesNotMatch(source, /<ScrollView\s+horizontal\s+accessibilityRole="tablist"/);
  assert.match(source, /useFocusEffect/);
  assert.match(source, /scrollOffsetRef/);
  assert.match(source, /accessibilityLabel="Understanding morphology terms"/);
  assert.match(source, /<SegmentedWord analysis=\{analysis\} compact alignment="end"/);
  assert.match(source, /<WordSegmentsLegend analysis=\{analysis\} layout="wrapped"/);
  assert.match(source, /summaryTopRow: \{ direction: 'ltr', flexDirection: 'row'/);
  assert.match(source, /morphologyFact: \{ flexBasis: '47%'/);
  assert.match(source, /groupMorphologySegments\(segments\)/);
  assert.match(source, /function SegmentGroupCard/);
  assert.match(source, /segmentGroupDivider: \{[^\n]+marginHorizontal: 12/);
  assert.match(source, /backgroundColor: palette\.border/);
  assert.match(source, /segmentCard: \{ borderRadius: 20/);
  assert.doesNotMatch(source, /segmentCard: \{[^\n]+borderWidth/);
  assert.match(source, /styles\.segmentCard, \{ backgroundColor: palette\.surface \}/);
  assert.doesNotMatch(source, /cleanSurfaceShadow/);
  assert.match(source, /factLabel: \{[^\n]+textAlign: 'center'/);
  assert.match(source, /factValueArabic: \{[^\n]+fontSize: 30, lineHeight: 44/);
  assert.match(source, /available \? value : '—'/);
  assert.match(source, /accessibilityLabel=\{`\$\{label\}: \$\{value\}`\}/);
  assert.match(source, /factValueUnavailable/);
  assert.match(source, /backgroundColor: palette\.interactive/);
  assert.match(source, /guideRowContent/);
  assert.match(source, /<MorphologyGuideSheet/);
  assert.match(source, /Share\.share/);
  assert.match(source, /Complete verse grammar/);
  assert.doesNotMatch(source, /Complete ayah grammar/);
  assert.doesNotMatch(source, /Arabic analysis sections/);
  assert.match(source, /showFullAyah \? \([\s\S]*?<ChevronDown[\s\S]*?: \([\s\S]*?<ChevronRight/);
  assert.match(source, /grammarDisclosureRow: \{ direction: 'ltr'[\s\S]*?flexDirection: 'row'/);
  assert.doesNotMatch(source, /grammarDisclosureIcon|rotate: showFullAyah/);
  assert.match(source, /<GrammarGuideSheet/);
  assert.match(source, /No separate grammar note for this word/);
  assert.doesNotMatch(source, /Grammar passage containing this word/);
  assert.doesNotMatch(source, /إِعْرَابٌ مُخْتَصَرٌ/);
  assert.doesNotMatch(source, /grammarCard: \{[^\n]+borderWidth/);
  const grammarGuideSource = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/GrammarGuideSheet.tsx'),
    'utf8'
  );
  assert.match(grammarGuideSource, /Arabic i‘rab \(إعراب\)/);
  assert.match(grammarGuideSource, /BUNDLED_WORD_GRAMMAR_PACK\.manifest\.source/);
  assert.doesNotMatch(grammarGuideSource, /View full source details/);
  assert.doesNotMatch(grammarGuideSource, /Close this information to continue reading the grammar/);
  assert.doesNotMatch(source, /label="Overview"|tab === 'overview'|'overview' \|/);
  assert.doesNotMatch(source, /Surface form|Part of speech|Features at this location/);
  assert.doesNotMatch(source, /Morphology describes how this word is formed/);
  assert.doesNotMatch(source, /An attached segment before the stem|The central lexical part/);
  assert.doesNotMatch(source, /detail\.explanation/);
  assert.doesNotMatch(source, /getMorphologyDetails\(analysis\.morphology\.value\)/);
  assert.doesNotMatch(source, /About this analysis|function AboutAnalysis|getStudySources/);
  assert.doesNotMatch(source, /Dictionary definition/);
  assert.doesNotMatch(source, /function WordRibbon/);
  assert.doesNotMatch(source, /function AdjacentNavigation/);
  assert.doesNotMatch(source, /positionCounter/);
});

test('verb reference UI presents six form-specific principal parts', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/VerbReferenceSection.tsx'),
    'utf8'
  );
  assert.match(source, /Verb Form \$\{form\}/);
  assert.match(source, /exact derived form—not every form in the root family/);
  assert.match(source, /Perfect/);
  assert.match(source, /Imperfect/);
  assert.match(source, /Imperative/);
  assert.match(source, /Active participle/);
  assert.match(source, /Passive participle/);
  assert.match(source, /Verbal noun/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /accessibilityLabel=\{`\$\{part\.label\}: \$\{value \?\? 'not recorded'\}`\}/);
});

test('segmented-word presentation supports a non-scrolling two-column wrapped legend', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/WordSegmentsCard.tsx'),
    'utf8'
  );
  assert.match(source, /export function SegmentedWord/);
  assert.match(source, /export function WordSegmentsLegend/);
  assert.match(source, /layout\?: 'stacked' \| 'horizontal' \| 'wrapped'/);
  assert.match(source, /legendWrapped/);
  assert.match(source, /flexWrap: 'wrap'/);
  assert.match(source, /legendItemWrapped: \{ flexBasis: '47%', flexGrow: 1, maxWidth: '48%' \}/);
  assert.match(source, /width < 340 \|\| fontScale > 1\.35/);
  assert.match(source, /accessibilityLabel=\{`\$\{segment\.arabic\}, \$\{getPosLabel\(segment\.posCode\)\}`\}/);
});

test('morphology guide is a scrollable, dismissible, explicitly height-constrained sheet', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/MorphologyGuideSheet.tsx'),
    'utf8'
  );
  assert.match(source, /useWindowDimensions\(\)/);
  assert.match(source, /height: sheetHeight/);
  assert.match(source, /minHeight: sheetHeight/);
  assert.match(source, /maxHeight: maxSheetHeight/);
  assert.match(source, /<Modal/);
  assert.match(source, /onRequestClose=\{onClose\}/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /accessibilityViewIsModal/);
  assert.match(source, /accessibilityLabel="Understanding morphology terms"/);
  assert.match(source, /MORPHOLOGY_GUIDE_GROUPS\.map/);
});

test('Word Study Sources is manifest-backed and reachable from settings', () => {
  const screen = readFileSync(join(process.cwd(), 'app/word-study-sources.tsx'), 'utf8');
  const settings = readFileSync(
    join(process.cwd(), 'components/reader/settings/SettingsSidebarContent.tsx'),
    'utf8'
  );
  const layout = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');

  assert.match(screen, /corePack\.manifest\.sources\.map/);
  assert.match(screen, /BUNDLED_WORD_GRAMMAR_PACK\.manifest/);
  assert.match(screen, /BUNDLED_VERB_REFERENCE_PACK\.manifest/);
  assert.match(screen, /listInstalledAsync\(\)/);
  assert.match(screen, /Methodology boundaries/);
  assert.match(screen, /source\.license/);
  assert.match(screen, /source\.attribution/);
  assert.match(screen, /source\.checksumSha256/);
  assert.match(screen, /ExternalLink/);
  assert.match(settings, /Word Study Sources/);
  assert.match(settings, /router\.push\('\/word-study-sources'\)/);
  assert.match(layout, /name="word-study-sources"/);
  assert.doesNotMatch(screen, /qac-morphology-v0\.4|quran-app-offline-word-pack-en/);
});

test('ayah selector uses one stable inline Arabic layout without a measurement phase', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/AyahContextSelector.tsx'),
    'utf8'
  );
  assert.match(source, /getSelectedAyahExcerpt/);
  assert.match(source, /shouldCollapseAyah/);
  assert.match(source, /numberOfLines=/);
  assert.match(source, /writingDirection: 'rtl'/);
  assert.match(source, /textAlign: 'right'/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /accessibilityActions/);
  assert.match(source, /palette\.accent/);
  assert.match(source, /ARABIC_FONT_SIZE = 31/);
  assert.match(source, /ARABIC_LINE_HEIGHT = 54/);
  assert.match(source, /COLLAPSED_EXCERPT_FILL_FACTOR = 1\.25/);
  assert.match(source, /fontScale/);
  assert.match(source, /effectiveFontScale = Math\.max\(1, fontScale\)/);
  assert.match(source, /collapsedHeight = COLLAPSED_LINE_COUNT \* ARABIC_LINE_HEIGHT \* effectiveFontScale/);
  assert.match(source, /previousLayoutIdentityRef\.current === layoutIdentity/);
  assert.match(source, /EXPANSION_DURATION = 260/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /Animated\.timing\(disclosureProgress/);
  assert.match(source, /Animated\.timing\(viewportHeight/);
  assert.match(source, /useNativeDriver: false/);
  assert.match(source, /onLayout=\{handleFullContentLayout\}/);
  assert.match(source, /fullContentMeasurement/);
  assert.match(source, /<ChevronDown[^>]+size=\{28\}/);
  assert.match(source, /direction: 'ltr'/);
  assert.match(source, /justifyContent: 'flex-end'/);
  assert.doesNotMatch(source, /useLayoutEffect|\bmeasure\b|translateY|LayoutAnimation/);
  assert.doesNotMatch(source, /flexWrap|row-reverse/);
  assert.doesNotMatch(source, /AYAH CONTEXT/);
  assert.doesNotMatch(source, /ChevronsDown|ChevronsUp/);
  assert.doesNotMatch(source, /underline/i);
  assert.doesNotMatch(source, /borderWidth/);
});

test('selected-language lookup reads only the exact offline language row', () => {
  const store = readFileSync(
    join(process.cwd(), 'src/core/infrastructure/offline/TranslationOfflineStore.ts'),
    'utf8'
  );
  const hook = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/useContextualMeaning.ts'),
    'utf8'
  );
  assert.match(store, /getWordTranslationWordsJson/);
  assert.match(store, /FROM offline_word_translations/);
  assert.match(store, /WHERE language_code = \? AND verse_key = \?/);
  const exactLookup = store.slice(
    store.indexOf('async getWordTranslationWordsJson'),
    store.indexOf('async upsertVersesAndTranslations')
  );
  assert.doesNotMatch(exactLookup, /COALESCE|fetch\(/);
  assert.match(hook, /settings\.wordLang/);
  assert.match(hook, /getWordTranslationWordsJson/);
  assert.match(hook, /lookupFailed: true/);
});

test('full-screen focus order and selection semantics do not depend on color', () => {
  const screen = readFileSync(
    join(process.cwd(), 'app/study/word/[surah]/[ayah]/[position].tsx'),
    'utf8'
  );
  const selector = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/AyahContextSelector.tsx'),
    'utf8'
  );
  const segmentedControl = readFileSync(
    join(process.cwd(), 'components/ui/SlidingSegmentedControl.tsx'),
    'utf8'
  );
  const homeToggle = readFileSync(
    join(process.cwd(), 'components/home/HomeTabToggle.tsx'),
    'utf8'
  );
  assert.ok(screen.indexOf('styles.header') < screen.indexOf('<AyahContextSelector'));
  assert.ok(screen.indexOf('<AyahContextSelector') < screen.indexOf('<SlidingSegmentedControl'));
  assert.ok(screen.indexOf('<SlidingSegmentedControl') < screen.indexOf('Understanding morphology terms'));
  assert.match(segmentedControl, /accessibilityRole="tablist"/);
  assert.match(segmentedControl, /accessibilityState=\{\{ selected \}\}/);
  assert.match(segmentedControl, /withSpring/);
  assert.match(segmentedControl, /palette\.surfaceNavigation/);
  assert.match(homeToggle, /<SlidingSegmentedControl/);
  assert.match(selector, /accessibilityLabel=\{`Word \$\{position\} of \$\{words\.length\}/);
  assert.match(selector, /accessibilityState=\{\{ selected \}\}/);
  assert.match(selector, /accessibilityHint=\{selected \? 'Selected for analysis'/);
  assert.match(selector, /writingDirection: 'rtl'/);
  assert.match(selector, /textAlign: 'right'/);
});

test('dictionary use case forwards normalized lemma and root without using surface text as a sense', async () => {
  let captured: unknown;
  const repository: IDictionaryReferenceRepository = {
    async listInstalledSources() { return []; },
    async findReferences(query) {
      captured = query;
      return {
        source: { packId: 'lane-en', sourceId: 'lane', title: 'Lane', languageCode: 'en', version: '1', attribution: 'fixture', url: 'https://example.test' },
        query,
        exactLemmaEntries: [],
        rootEntries: [],
        rootFamilyEntries: [],
      };
    },
    async getEntry() { return null; },
    async closePack() {},
  };
  await new GetDictionaryReferences(repository).execute(verb, 'lane-en');
  assert.deepEqual(captured, {
    packId: 'lane-en',
    lemmaNormalized: verb.lemma.status === 'available' ? verb.lemma.value.normalized : undefined,
    rootNormalized: verb.root.status === 'available' ? verb.root.value.normalized : undefined,
  });
});

test('verb reference use case forwards the exact encountered form', async () => {
  let captured: unknown;
  const repository: IVerbReferenceRepository = {
    async findByVerb(query) {
      captured = query;
      return { status: 'missing', reason: 'source-row-missing' };
    },
  };
  await new GetVerbReference(repository).execute(verb);
  assert.deepEqual(captured, {
    rootNormalized: verb.root.status === 'available' ? verb.root.value.normalized : undefined,
    lemmaNormalized: verb.lemma.status === 'available' ? verb.lemma.value.normalized : undefined,
    verbForm: 'IV',
  });
});

test('dictionary UI prioritizes the best match and moves guidance into an information sheet', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/DictionarySection.tsx'),
    'utf8'
  );
  const guide = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/DictionaryGuideSheet.tsx'),
    'utf8'
  );
  assert.match(source, /Choose an optional dictionary/);
  assert.match(source, /Lane/);
  assert.match(source, /Hans Wehr/);
  assert.match(source, /Best match for this word/);
  assert.match(source, /Root meaning/);
  assert.match(source, /Related dictionary headwords/);
  assert.doesNotMatch(source, /See Quran occurrences|OccurrenceLink|onExploreRootOccurrences/);
  assert.match(source, /DictionaryGuideSheet/);
  assert.match(source, /SlidingSegmentedControl/);
  assert.match(source, /const primaryEntry = result\.exactLemmaEntries\[0\] \?\? result\.rootEntries\[0\]/);
  assert.doesNotMatch(source, /Contextual meaning remains in Overview|Complete root family|Matching headword/);
  assert.doesNotMatch(source, /result\.source\.(?:title|version|attribution|url)/);
  assert.match(source, /entryCard: \{ borderRadius: 18/);
  assert.doesNotMatch(source, /entryCard: \{[^\n]+borderWidth|familyToggle: \{[^\n]+borderWidth/);
  assert.match(source, /getEntry\(/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(guide, /Selected Quran word/);
  assert.match(guide, /Lemma/);
  assert.match(guide, /Root dictionary entry/);
  assert.match(guide, /Lane is a detailed classical Arabic reference/);
  assert.match(guide, /source\.attribution/);
  assert.match(guide, /height: sheetHeight/);
});

test('occurrence explorer cancels stale queries, keeps page size bounded, and avoids ambiguous count copy', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/OccurrenceExplorer.tsx'),
    'utf8'
  );
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /requestId !== requestIdRef\.current/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /counter\.label/);
  assert.doesNotMatch(source, />Forms in this root</);
  assert.match(source, /OccurrenceGuideSheet/);
  assert.match(source, /counterVerticalDivider/);
  assert.match(source, /counterHorizontalDivider/);
  assert.match(source, /findLemmasByRoot/);
  assert.match(source, /selected word lemma/);
  assert.match(source, /buildRootFamilyLemmaQuery/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /new Animated\.Value\(0\)/);
  assert.match(source, /Animated\.timing\(bodyHeight/);
  assert.match(source, /useNativeDriver: false/);
  assert.match(source, /onLayout=\{handleBodyLayout\}/);
  assert.match(source, /familyBodyViewport: \{ overflow: 'hidden' \}/);
  assert.match(source, /accessibilityElementsHidden=\{!expanded\}/);
  assert.doesNotMatch(source, /setRootFamilyExpanded\(false\)/);
  assert.match(source, /MAX_EXPANDED_FAMILY_RESULTS_HEIGHT_FLOOR/);
  assert.match(source, /minHeight: resultsHeightFloor/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /onRequestScrollToFilters\?\./);
  assert.match(source, /const selectScope[\s\S]*?setCursorHistory\(\[\]\);\s*\}, \[\]\);/);
  assert.match(source, /const selectCounter[\s\S]*?selectScope\(counterKey\);\s*scrollToFilters\(\);/);
  assert.match(source, /rootFamilyOffsetYRef[\s\S]*?setRootFamilyExpanded\(true\)/);
  assert.match(source, /const selectRootFamilyLemma[\s\S]*?scrollToFilters\(\);/);
  assert.match(source, /current\.status === 'ready'[\s\S]*?refreshing: true/);
  assert.match(source, /accessibilityState=\{\{ busy: isPageRefreshing \}\}/);
  assert.match(source, /ayahContextUthmani/);
  assert.match(source, /Open in reader/);
  assert.doesNotMatch(source, />Reset</);
  assert.doesNotMatch(source, /this word occurs/i);
});
