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
  getAdjacentWordPositions,
  getMorphologyDetails,
  getRootText,
  getStudySources,
} from '../../components/word-study/full-study/wordStudyScreenModel';
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

test('morphology rows contain only source-applicable fields with beginner explanations', () => {
  assert.equal(verb.morphology.status, 'available');
  if (verb.morphology.status !== 'available') return;
  const rows = getMorphologyDetails(verb.morphology.value);
  assert.deepEqual(rows.map((row) => row.key), ['aspect', 'voice', 'person', 'gender', 'number', 'verbForm']);
  assert.equal(rows.find((row) => row.key === 'verbForm')?.value, 'Form IV');
  assert.ok(rows.every((row) => row.arabicTerm.length > 0 && row.explanation.length > 20));
  assert.equal(rows.some((row) => row.key === 'mood'), false);
  assert.equal(getMorphologyDetails({}).length, 0);
});

test('rootless particles explain the absence instead of rendering a blank field', () => {
  assert.equal(particle.root.status, 'unsupported');
  assert.equal(getRootText(particle), 'No root applies to this particle.');
});

test('adjacent navigation follows canonical word position order', () => {
  const words = [
    { ...verb, location: { ...verb.location, wordPosition: 1, locationKey: '3:3:1' } },
    { ...verb, location: { ...verb.location, wordPosition: 2, locationKey: '3:3:2' } },
    { ...verb, location: { ...verb.location, wordPosition: 3, locationKey: '3:3:3' } },
  ];
  assert.deepEqual(getAdjacentWordPositions(words, 1), { next: 2 });
  assert.deepEqual(getAdjacentWordPositions(words, 2), { previous: 1, next: 3 });
  assert.deepEqual(getAdjacentWordPositions(words, 3), { previous: 2 });
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

test('full screen keeps the Phase 5 route, ribbon, tabs, RTL text, and route-driven selection', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/study/word/[surah]/[ayah]/[position].tsx'),
    'utf8'
  );
  assert.match(source, /<WordRibbon/);
  assert.match(source, /horizontal/);
  assert.match(source, /inverted/);
  assert.match(source, /router\.setParams\(\{ position:/);
  assert.match(source, /label="Overview"/);
  assert.match(source, /label="Morphology"/);
  assert.match(source, /label="Grammar"/);
  assert.match(source, /label="Occurrences"/);
  assert.match(source, /label="Dictionary"/);
  assert.match(source, /horizontal/);
  assert.match(source, /useFocusEffect/);
  assert.match(source, /scrollOffsetRef/);
  assert.match(source, /About this analysis/);
  assert.match(source, /Share\.share/);
  assert.match(source, /writingDirection: 'rtl'/);
  assert.match(source, /Complete ayah grammar/);
  assert.match(source, /إِعْرَابٌ مُخْتَصَرٌ/);
  assert.doesNotMatch(source, /Dictionary definition/);
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
