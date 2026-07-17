declare const process: { cwd(): string };
declare function require(id: string): any;

const assert = require('node:assert/strict') as {
  deepEqual(actual: unknown, expected: unknown): void;
  equal(actual: unknown, expected: unknown): void;
  match(actual: string, expected: RegExp): void;
  ok(value: unknown): void;
};
const { readFileSync } = require('node:fs') as { readFileSync(path: string, encoding: string): string };
const { join } = require('node:path') as { join(...parts: string[]): string };
const test = require('node:test') as (name: string, callback: () => void | Promise<void>) => void;

import {
  getWordStudyLocationKey,
  normalizeWordStudyPressEvent,
} from '../../components/word-study/WordStudyPressEvent';
import {
  describeMissingReason,
  describeMorphology,
  getAnalysisSegments,
  getPosLabel,
  getPrimaryGloss,
  getSourceLabel,
  toWordQuickSheetLoadState,
} from '../../components/word-study/wordQuickSheetModel';
import {
  WORD_STUDY_RICH_CONTRACT_FIXTURES,
  parseWordStudyLocation,
} from '../../src/core/domain/word-study';

test('normalizes the native word press into the canonical study event', () => {
  const event = normalizeWordStudyPressEvent({
    verseKey: ' 3:3 ',
    wordPosition: 9.8,
    wordId: 12345,
    surfaceText: ' وَأَنزَلَ ',
    source: 'translation',
  });
  assert.deepEqual(event, {
    verseKey: '3:3',
    wordPosition: 9,
    wordId: 12345,
    surfaceText: 'وَأَنزَلَ',
    source: 'translation',
  });
  assert.equal(event && getWordStudyLocationKey(event), '3:3:9');
  assert.equal(normalizeWordStudyPressEvent({ verseKey: '3:3:9', wordPosition: 12345 }), null);
  assert.equal(normalizeWordStudyPressEvent({ verseKey: '115:1', wordPosition: 1 }), null);
});

test('all Android reader payloads resolve the same canonical analysis location', () => {
  const payloads = [
    { verseKey: '3:3', wordPosition: 9, source: 'translation' },
    { verseKey: '3:3', wordPosition: 9, source: 'tajweed' },
    { verseKey: '3:3', wordPosition: 9, source: 'mushaf' },
  ];
  const locationKeys = payloads.map((payload) => {
    const event = normalizeWordStudyPressEvent(payload);
    assert.ok(event);
    return event ? getWordStudyLocationKey(event) : null;
  });

  assert.deepEqual(locationKeys, ['3:3:9', '3:3:9', '3:3:9']);
});

test('builds segmented verb content and friendly morphology copy', () => {
  const verb = WORD_STUDY_RICH_CONTRACT_FIXTURES[0];
  if (!verb) throw new Error('Missing verb fixture');
  const state = toWordQuickSheetLoadState(verb);
  assert.equal(state.status, 'ready');
  assert.deepEqual(getAnalysisSegments(verb).map((segment) => segment.arabic), ['وَ', 'أَنزَلَ']);
  assert.equal(getPosLabel('V'), 'Verb');
  assert.equal(getPosLabel('CONJ'), 'Conjunction');
  assert.equal(getPrimaryGloss(verb), 'and He revealed');
  assert.equal(
    verb.morphology.status === 'available' ? describeMorphology(verb.morphology.value) : '',
    'Perfect · Active · Third person · Masculine · Singular · Form IV'
  );
});

test('expands the installed corpus particle codes into readable labels', () => {
  assert.equal(getPosLabel('REM'), 'Resumption particle');
  assert.equal(getPosLabel('CAUS'), 'Causal particle');
  assert.equal(getPosLabel('IMPN'), 'Imperative verbal noun');
});

test('renders explicit rootless and missing-analysis explanations', () => {
  const particle = WORD_STUDY_RICH_CONTRACT_FIXTURES[1];
  if (!particle) throw new Error('Missing particle fixture');
  assert.equal(
    particle.root.status === 'available' ? '' : describeMissingReason(particle.root.reason),
    'No root applies to this particle.'
  );
  assert.deepEqual(toWordQuickSheetLoadState({
    location: parseWordStudyLocation('2:1:1'),
    status: 'missing',
    reason: 'source-row-missing',
    sourceReferences: [],
  }), {
    status: 'missing',
    result: {
      location: parseWordStudyLocation('2:1:1'),
      status: 'missing',
      reason: 'source-row-missing',
      sourceReferences: [],
    },
  });
});

test('shows pack attribution from source identifiers', () => {
  const verb = WORD_STUDY_RICH_CONTRACT_FIXTURES[0];
  if (!verb) throw new Error('Missing verb fixture');
  const analysis = {
    ...verb,
    sourceReferences: [
      { sourceId: 'qac-morphology-v0.4', sourceVersion: '0.4', layer: 'morphology' as const },
      {
        sourceId: 'quran-app-offline-word-pack-en-2026-07-04',
        sourceVersion: '2026-07-04',
        layer: 'contextual-gloss' as const,
      },
    ],
  };
  assert.equal(
    getSourceLabel(analysis),
    'Quranic Arabic Corpus v0.4 · Quran App offline word pack'
  );
});

test('quick sheet keeps numeric height constraints and required actions', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/word-study/WordQuickSheet.tsx'),
    'utf8'
  );
  assert.match(source, /height: sheetHeight/);
  assert.match(source, /minHeight: sheetHeight/);
  assert.match(source, /maxHeight: sheetHeight/);
  assert.match(source, /Play word/);
  assert.match(source, /Play verse from here/);
  assert.match(source, /Open full word study/);
  assert.match(source, /accessibilityLabel="Loading word analysis"/);
});

test('Android Surah, Juz, Page, Mushaf, and Tajweed readers share the React Native sheet', () => {
  const surahScreen = readFileSync(join(process.cwd(), 'app/surah/[surahId].tsx'), 'utf8');
  const juzScreen = readFileSync(join(process.cwd(), 'app/juz/[juzNumber].tsx'), 'utf8');
  const pageScreen = readFileSync(join(process.cwd(), 'app/page/[pageNumber].tsx'), 'utf8');
  const verseCard = readFileSync(join(process.cwd(), 'components/surah/VerseCard.tsx'), 'utf8');
  const tajweedFactory = readFileSync(
    join(
      process.cwd(),
      'android/app/src/main/java/com/anonymous/quranappmobile/nativesurahreader/NativeTajweedTextFactory.kt'
    ),
    'utf8'
  );
  const nativeReaderView = readFileSync(
    join(
      process.cwd(),
      'android/app/src/main/java/com/anonymous/quranappmobile/nativesurahreader/NativeSurahReaderView.kt'
    ),
    'utf8'
  );

  for (const screen of [surahScreen, juzScreen, pageScreen]) {
    assert.match(screen, /ReaderWordStudySheet/);
    assert.match(screen, /source: 'mushaf'/);
    assert.match(screen, /wordQuickSheet\.open/);
  }
  assert.match(juzScreen, /onWordStudyPress=\{Platform\.OS === 'android'/);
  assert.match(pageScreen, /onWordStudyPress=\{Platform\.OS === 'android'/);
  assert.match(verseCard, /pressBehavior=\{[\s\S]*?'study'/);
  assert.match(tajweedFactory, /NativeTajweedWordSpan/);
  assert.match(tajweedFactory, /buildNativeTajweedWordRanges/);
  assert.match(tajweedFactory, /if \(enabled\) onPress\(word\)/);
  assert.match(nativeReaderView, /settings\.displayMode == DISPLAY_MODE_TAJWEED/);
  assert.match(nativeReaderView, /putString\([\s\S]*?currentWordPressSource/);
  assert.ok(!tajweedFactory.includes('WordQuickSheet'));
  assert.ok(!tajweedFactory.includes('WordStudyRepository'));
});
