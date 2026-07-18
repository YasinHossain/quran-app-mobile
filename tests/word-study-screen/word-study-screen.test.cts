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
  type WordAnalysis,
} from '../../src/core/domain/word-study';
import {
  buildWordStudyShareMessage,
  getMorphologyDetails,
  getRootText,
  getStudySources,
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
  getOccurrenceCounters,
  getOccurrenceFilters,
  getOccurrenceGloss,
  getOccurrencePageLabel,
} from '../../components/word-study/full-study/occurrenceExplorerModel';
import { findSelectedWordGrammarPassages } from '../../components/word-study/full-study/grammarStudyModel';
import { GetDictionaryReferences } from '../../src/core/application/use-cases/word-study/GetDictionaryReferences';
import type { IDictionaryReferenceRepository } from '../../src/core/domain/repositories/IDictionaryReferenceRepository';

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

test('Arabic grammar matching prefers the passage containing the selected word or stem', () => {
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

test('occurrence counters and filters name surface, lemma, root, and root family explicitly', () => {
  assert.deepEqual(
    getOccurrenceCounters(verb, 7).map((counter) => [counter.label, counter.value]),
    [
      ['Normalized surface occurrences', 7],
      ['Lemma occurrences', 183],
      ['Root occurrences', 293],
      ['Distinct lemmas in this root family', 12],
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
  assert.match(source, /label="Morphology"/);
  assert.match(source, /label="Grammar"/);
  assert.match(source, /label="Occurrences"/);
  assert.match(source, /label="Dictionary"/);
  assert.ok(source.indexOf('label="Morphology"') < source.indexOf('label="Grammar"'));
  assert.ok(source.indexOf('label="Grammar"') < source.indexOf('label="Occurrences"'));
  assert.ok(source.indexOf('label="Occurrences"') < source.indexOf('label="Dictionary"'));
  assert.match(source, /useState<StudyTab>\('morphology'\)/);
  assert.match(source, /Meaning in this ayah/);
  assert.match(source, /useContextualMeaning\(selected\)/);
  assert.match(source, /English fallback · Bundled offline|fallbackMessage/);
  assert.match(source, /writingDirection: state\.presentation\.direction/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /label="Lemma"/);
  assert.match(source, /label="Root"/);
  assert.match(source, /How this word is built/);
  assert.ok(source.indexOf('<ContextualMeaningBlock') < source.indexOf('How this word is built'));
  assert.ok(source.indexOf('label="Lemma"') < source.indexOf('How this word is built'));
  assert.ok(source.indexOf('label="Root"') < source.indexOf('How this word is built'));
  assert.match(source, /horizontal/);
  assert.match(source, /useFocusEffect/);
  assert.match(source, /scrollOffsetRef/);
  assert.match(source, /accessibilityLabel="Understanding morphology terms"/);
  assert.match(source, /<MorphologyGuideSheet/);
  assert.match(source, /Share\.share/);
  assert.match(source, /Complete ayah grammar/);
  assert.match(source, /إِعْرَابٌ مُخْتَصَرٌ/);
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
  assert.ok(screen.indexOf('styles.header') < screen.indexOf('<AyahContextSelector'));
  assert.ok(screen.indexOf('<AyahContextSelector') < screen.indexOf('accessibilityRole="tablist"'));
  assert.ok(screen.indexOf('accessibilityRole="tablist"') < screen.indexOf('Understanding morphology terms'));
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

test('dictionary UI keeps downloads, source switching, lazy entries, and attribution in one tab', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/DictionarySection.tsx'),
    'utf8'
  );
  assert.match(source, /Choose an optional dictionary/);
  assert.match(source, /Lane/);
  assert.match(source, /Hans Wehr/);
  assert.match(source, /Matching headword/);
  assert.match(source, /Complete root family/);
  assert.match(source, /getEntry\(/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /source\.attribution/);
});

test('occurrence explorer cancels stale queries, keeps page size bounded, and avoids ambiguous count copy', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/full-study/OccurrenceExplorer.tsx'),
    'utf8'
  );
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /requestId !== requestIdRef\.current/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /Distinct lemmas in this root family|counter\.label/);
  assert.match(source, /ayahContextUthmani/);
  assert.match(source, /Open in reader/);
  assert.doesNotMatch(source, /this word occurs/i);
});
