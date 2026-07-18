const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  assertReferentialIntegrity,
  buckwalterToArabic,
  buildPackData,
  compilePack,
  normalizeArabic,
  parseCanonicalPayload,
  parseMorphologySource,
  sha256Buffer,
  structuredFeatures,
} = require('../../scripts/word-study-pack/compiler.cjs');

const MORPHOLOGY_FIXTURE = `# Quranic Arabic Corpus fixture
LOCATION\tFORM\tTAG\tFEATURES
(3:3:9:1)\twa\tCONJ\tPREFIX|w:CONJ+
(3:3:9:2)\t>anzala\tV\tSTEM|POS:V|PERF|(IV)|LEM:>anzala|ROOT:nzl|3MS
(3:4:1:1)\twa\tCONJ\tPREFIX|w:CONJ+
(3:4:1:2)\t>anzala\tV\tSTEM|POS:V|PERF|(IV)|LEM:>anzala|ROOT:nzl|3MS
(2:141:11:1)\twa\tREM\tPREFIX|w:REM+
(2:141:11:2)\tlaA\tNEG\tSTEM|POS:NEG|LEM:laA
`;

const CANONICAL_FIXTURE = {
  verses: [
    {
      verseKey: '2:141',
      words: [
        { position: 11, charTypeName: 'word', uthmani: 'وَلَا', translationText: 'and not' },
        { position: 12, charTypeName: 'end', uthmani: '١٤١' },
      ],
    },
    {
      verseKey: '3:3',
      words: [{ position: 9, charTypeName: 'word', uthmani: 'وَأَنزَلَ', translationText: 'and He revealed' }],
    },
    {
      verseKey: '3:4',
      words: [{ position: 1, charTypeName: 'word', uthmani: 'وَأَنزَلَ', translationText: 'and He sent down' }],
    },
  ],
};

const MORPHOLOGY_SOURCE = {
  sourceId: 'fixture-morphology',
  title: 'Fixture morphology',
  version: '1',
  license: 'test-only',
  url: 'fixture://morphology',
  checksumSha256: sha256Buffer(Buffer.from(MORPHOLOGY_FIXTURE)),
  attribution: 'test fixture',
};

function canonicalSource(canonicalText) {
  return {
    sourceId: 'fixture-canonical',
    title: 'Fixture canonical words',
    version: '1',
    license: 'test-only',
    url: 'fixture://canonical',
    checksumSha256: sha256Buffer(Buffer.from(canonicalText)),
    attribution: 'test fixture',
  };
}

function buildFixture() {
  const canonicalText = JSON.stringify(CANONICAL_FIXTURE);
  return buildPackData({
    morphologyText: MORPHOLOGY_FIXTURE,
    canonicalPayload: CANONICAL_FIXTURE,
    morphologySource: MORPHOLOGY_SOURCE,
    canonicalSource: canonicalSource(canonicalText),
    expectedAyahs: 3,
    expectedWords: 3,
  });
}

test('normalizes Quranic script variants without erasing base letters', () => {
  assert.equal(buckwalterToArabic('>anzala'), 'أَنزَلَ');
  assert.equal(normalizeArabic('ٱلْـَٔاخِرَةِ ۖ'), 'الاخره');
  assert.notEqual(normalizeArabic('كتب'), normalizeArabic('قتب'));
});

test('normalizes the unmarked default verb form without changing explicit forms', () => {
  assert.equal(structuredFeatures('STEM|POS:V|PERF|3MS', 'V').verbForm, 'I');
  assert.equal(structuredFeatures('STEM|POS:V|PERF|(IV)|3MS', 'V').verbForm, 'IV');
  assert.equal(structuredFeatures('STEM|POS:N|NOM', 'N').verbForm, undefined);
});

test('compiles golden morphology, segmentation, glosses, and derived counts', () => {
  const { data, report } = buildFixture();
  assert.equal(report.status, 'passed');
  assert.equal(report.logicalChecksum.length, 64);
  assert.equal(data.wordAnalyses.length, 3);
  const verb = data.wordAnalyses.find((word) => word.location === '3:3:9');
  assert.deepEqual(verb.segments.map((segment) => segment.segmentType), ['prefix', 'stem']);
  assert.equal(verb.primaryPos, 'V');
  assert.equal(verb.aspect, 'perfect');
  assert.equal(verb.voice, 'active');
  assert.equal(verb.verbForm, 'IV');
  assert.equal(verb.gloss, 'and He revealed');
  const lemma = data.lemmas.find((item) => item.id === verb.lemmaId);
  const root = data.roots.find((item) => item.id === verb.rootId);
  assert.equal(lemma.occurrenceCount, 2);
  assert.equal(root.occurrenceCount, 2);
  assert.equal(root.lemmaCount, 1);
});

test('rejects duplicate canonical words and morphology segments', () => {
  assert.throws(
    () => parseCanonicalPayload({ verses: [CANONICAL_FIXTURE.verses[0], CANONICAL_FIXTURE.verses[0]] }),
    /Duplicate canonical word/
  );
  const duplicateLine = MORPHOLOGY_FIXTURE.split('\n')[2];
  assert.throws(() => parseMorphologySource(`${MORPHOLOGY_FIXTURE}${duplicateLine}\n`), /Duplicate morphology segment/);
});

test('detects missing foreign keys before writing SQLite', () => {
  const { data } = buildFixture();
  data.wordAnalyses[0].lemmaId = 999999;
  assert.throws(() => assertReferentialIntegrity(data), /Missing lemma foreign key/);
});

test('records alignment exceptions and fails unresolved missing locations', () => {
  const changedPayload = JSON.parse(JSON.stringify(CANONICAL_FIXTURE));
  changedPayload.verses[1].words[0].uthmani = 'غَيْرُ';
  const variant = buildPackData({
    morphologyText: MORPHOLOGY_FIXTURE,
    canonicalPayload: changedPayload,
    morphologySource: MORPHOLOGY_SOURCE,
    canonicalSource: canonicalSource(JSON.stringify(changedPayload)),
    expectedAyahs: 3,
    expectedWords: 3,
  });
  assert.equal(variant.report.status, 'passed');
  assert.equal(variant.report.exceptions[0].disposition, 'accepted-canonical-pack-surface-authoritative');

  changedPayload.verses[1].words.push({ position: 10, charTypeName: 'word', uthmani: 'مِنْ' });
  const missing = buildPackData({
    morphologyText: MORPHOLOGY_FIXTURE,
    canonicalPayload: changedPayload,
    morphologySource: MORPHOLOGY_SOURCE,
    canonicalSource: canonicalSource(JSON.stringify(changedPayload)),
    expectedAyahs: 3,
    expectedWords: 4,
  });
  assert.equal(missing.report.status, 'failed');
  assert.equal(missing.report.counts.unresolvedExceptions, 1);
});

test('identical inputs produce byte-identical SQLite and reports', (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-study-compiler-test-'));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const morphologyPath = path.join(tempDir, 'morphology.txt');
  const canonicalPath = path.join(tempDir, 'canonical.json');
  const sourceConfigPath = path.join(tempDir, 'sources.json');
  const canonicalText = JSON.stringify(CANONICAL_FIXTURE);
  fs.writeFileSync(morphologyPath, MORPHOLOGY_FIXTURE);
  fs.writeFileSync(canonicalPath, canonicalText);
  fs.writeFileSync(sourceConfigPath, JSON.stringify({ morphology: MORPHOLOGY_SOURCE, canonical: canonicalSource(canonicalText) }));

  const first = compilePack({ morphologyPath, canonicalPath, sourceConfigPath, outputDir: path.join(tempDir, 'first'), expectedAyahs: 3, expectedWords: 3 });
  const second = compilePack({ morphologyPath, canonicalPath, sourceConfigPath, outputDir: path.join(tempDir, 'second'), expectedAyahs: 3, expectedWords: 3 });
  assert.deepEqual(fs.readFileSync(first.databasePath), fs.readFileSync(second.databasePath));
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(
    fs.readFileSync(path.join(tempDir, 'first', 'validation-report.json'), 'utf8'),
    fs.readFileSync(path.join(tempDir, 'second', 'validation-report.json'), 'utf8')
  );
});
