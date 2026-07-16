import {
  PHASE_0_GOLDEN_LOCATION_FIXTURES,
  WORD_STUDY_CONTRACT_OCCURRENCE_FINAL_PAGE,
  WORD_STUDY_CONTRACT_OCCURRENCE_PAGE,
  WORD_STUDY_RICH_CONTRACT_FIXTURES,
  formatWordStudyLocation,
  isWordAnalysis,
  parseWordStudyLocation,
} from '../../src/core/domain/word-study';
import type { IWordStudyRepository } from '../../src/core/domain/repositories/IWordStudyRepository';
import { GetWordAnalysis } from '../../src/core/application/use-cases/word-study/GetWordAnalysis';
import { ListWordOccurrences } from '../../src/core/application/use-cases/word-study/ListWordOccurrences';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}. Expected ${expectedJson}, received ${actualJson}`);
  }
}

function assertThrows(fn: () => unknown, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

async function assertRejects(fn: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function testLocationContract(): void {
  assertDeepEqual(parseWordStudyLocation(' 3:3:9 '), {
    surah: 3,
    ayah: 3,
    wordPosition: 9,
    verseKey: '3:3',
    locationKey: '3:3:9',
  }, 'parses canonical location');
  assertEqual(
    formatWordStudyLocation({ surah: 114, ayah: 6, wordPosition: 3 }),
    '114:6:3',
    'formats canonical location'
  );
  assertThrows(() => parseWordStudyLocation('3:3'), 'rejects verse-only keys');
  assertThrows(() => parseWordStudyLocation('3:3:9:12345'), 'rejects extra numeric word ID');
  assertThrows(() => parseWordStudyLocation('115:1:1'), 'rejects invalid surah');
}

function testGoldenFixtures(): void {
  assertEqual(PHASE_0_GOLDEN_LOCATION_FIXTURES.length, 100, 'has 100 golden locations');
  assertEqual(PHASE_0_GOLDEN_LOCATION_FIXTURES[0]?.locationKey, '2:141:11', 'has first golden location');
  assertEqual(PHASE_0_GOLDEN_LOCATION_FIXTURES[99]?.locationKey, '57:22:17', 'has last golden location');
  assertEqual(
    new Set(PHASE_0_GOLDEN_LOCATION_FIXTURES.map((fixture) => fixture.locationKey)).size,
    100,
    'has unique golden locations'
  );
}

function testRichFixtures(): void {
  const [verb, particle, properNoun, unsegmented] = WORD_STUDY_RICH_CONTRACT_FIXTURES;
  assertEqual(verb?.morphemes.status, 'available', 'verb has available morphemes');
  if (!verb || verb.morphemes.status !== 'available' || verb.lemma.status !== 'available' || verb.root.status !== 'available') {
    throw new Error('Expected verb fixture to expose available morphemes, lemma, and root');
  }

  assertDeepEqual(
    verb.morphemes.value.map((morpheme) => morpheme.segmentType),
    ['prefix', 'stem'],
    'verb has prefix and stem segments'
  );
  assertEqual(verb.lemma.value.source.sourceVersion, '2026-07-16', 'carries source version');
  assert(particle?.root.status === 'unsupported', 'particle root is unsupported');
  assertEqual(particle.root.reason, 'particle-has-no-root', 'particle has explicit rootless reason');
  assert(properNoun?.root.status === 'unsupported', 'proper noun root is unsupported');
  assertEqual(properNoun.root.reason, 'proper-noun-root-absent', 'proper noun has explicit root absence reason');
  assert(unsegmented?.morphemes.status === 'missing', 'unsegmented word has missing morphemes');
  assertEqual(unsegmented.morphemes.reason, 'segmentation-not-provided', 'unsegmented word has explicit missing reason');
}

function testOccurrencePagination(): void {
  assertEqual(WORD_STUDY_CONTRACT_OCCURRENCE_PAGE.pageInfo.hasNextPage, true, 'first page has next page');
  assertEqual(
    WORD_STUDY_CONTRACT_OCCURRENCE_PAGE.pageInfo.nextCursor,
    'fixture-cursor-1',
    'first page exposes stable cursor'
  );
  assertEqual(WORD_STUDY_CONTRACT_OCCURRENCE_FINAL_PAGE.pageInfo.hasNextPage, false, 'final page has no next page');
}

async function testUseCases(): Promise<void> {
  const repository: IWordStudyRepository = {
    async findByLocation(locationKey) {
      return (
        WORD_STUDY_RICH_CONTRACT_FIXTURES.find((fixture) => fixture.location.locationKey === locationKey) ?? {
          location: parseWordStudyLocation(locationKey),
          status: 'missing',
          reason: 'source-row-missing',
          sourceReferences: [],
        }
      );
    },
    async findOccurrences(query) {
      return {
        ...WORD_STUDY_CONTRACT_OCCURRENCE_PAGE,
        query,
      };
    },
  };

  const analysis = await new GetWordAnalysis(repository).execute('3:3:9');
  assertEqual(isWordAnalysis(analysis), true, 'lookup returns analysis');
  await assertRejects(
    () => new ListWordOccurrences(repository).execute({ scope: 'root', limit: 0, rootId: 'root-nzl' }),
    'rejects invalid pagination limit'
  );
  await assertRejects(
    () => new ListWordOccurrences(repository).execute({ scope: 'lemma', limit: 10 }),
    'rejects missing lemma ID'
  );

  const occurrences = await new ListWordOccurrences(repository).execute({
    scope: 'root',
    limit: 1,
    rootId: 'root-nzl',
  });
  assertEqual(occurrences.pageInfo.hasNextPage, true, 'occurrence use case delegates to repository');
}

async function run(): Promise<void> {
  testLocationContract();
  testGoldenFixtures();
  testRichFixtures();
  testOccurrencePagination();
  await testUseCases();
}

void run();
