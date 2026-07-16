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
  assert.match(source, /About this analysis/);
  assert.match(source, /Share\.share/);
  assert.match(source, /writingDirection: 'rtl'/);
  assert.doesNotMatch(source, /Occurrence results|Dictionary definition|prose i‘rab.*<StudyFact/);
});
