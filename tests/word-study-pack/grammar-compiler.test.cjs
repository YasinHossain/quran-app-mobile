const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeArabic,
  parsePassages,
} = require('../../scripts/word-grammar-pack/compiler.cjs');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(
  ROOT,
  'dist/word-grammar-packs/qac-irab-v1.4/manifest.json'
);
const PACK_PATH = path.join(
  ROOT,
  'dist/word-grammar-packs/qac-irab-v1.4/quran-word-grammar.db'
);

test('grammar compiler parses Arabic headings and sanitizes presentation markup', () => {
  const passages = parsePassages(
    '<p dir="rtl" style="font-size:120%">وَأَنْزَلَ: <span style="color:#444">فعل ماض <b>مبني</b>.</span></p>'
  );
  assert.deepEqual(passages, [
    {
      sequence: 1,
      headingArabic: 'وَأَنْزَلَ',
      bodyArabic: 'فعل ماض مبني.',
      normalizedHeading: 'وانزل',
    },
  ]);
  assert.equal(normalizeArabic('ٱلْكِتَابِ'), 'الكتاب');
});

test('downloadable grammar candidate manifest matches the generated immutable database', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const bytes = fs.readFileSync(PACK_PATH);
  assert.equal(fs.statSync(PACK_PATH).size, manifest.databaseSizeBytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.databaseChecksumSha256);
  assert.equal(manifest.format, 'quran-word-grammar-sqlite-v1');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.verseCount, 5785);
  assert.equal(manifest.passageCount, 29881);
});

test('grammar catalog publishes the immutable development pack', () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'dist/word-grammar-packs/catalog.json'), 'utf8')
  );
  assert.equal(catalog.format, 'quran-word-grammar-catalog-v1');
  assert.equal(catalog.packs.length, 1);
  assert.deepEqual(catalog.packs[0], {
    packId: 'qac-irab',
    version: '1.4',
    sourceId: 'qac-arabic-irab',
    title: "Quranic Arabic Corpus Arabic i'rab",
    manifestUrl: 'qac-irab-v1.4/manifest.json',
    databaseUrl: 'qac-irab-v1.4/quran-word-grammar.db',
    databaseSizeBytes: 15876096,
    databaseChecksumSha256: '34fc38dca6b71708acbb4c3dcf685d639fd25febcda3624ea1404a8caa4cf3d6',
    schemaVersion: 1,
  });
});

test('public runtime does not import Word Study databases as app assets', () => {
  const grammarProvider = fs.readFileSync(
    path.join(ROOT, 'src/core/infrastructure/word-grammar/ExpoGrammarStudyDatabaseProvider.ts'),
    'utf8'
  );
  const verbProvider = fs.readFileSync(
    path.join(ROOT, 'src/core/infrastructure/verb-reference/ExpoVerbReferenceDatabaseProvider.ts'),
    'utf8'
  );
  const coreBackend = fs.readFileSync(
    path.join(ROOT, 'src/core/infrastructure/word-study/ExpoWordStudyPackBackend.ts'),
    'utf8'
  );
  const coreIndex = fs.readFileSync(
    path.join(ROOT, 'src/core/infrastructure/word-study/index.ts'),
    'utf8'
  );
  assert.doesNotMatch(grammarProvider, /Asset\.fromModule|quran-word-grammar\.db/);
  assert.doesNotMatch(verbProvider, /Asset\.fromModule|quran-verb-reference\.db/);
  assert.doesNotMatch(coreBackend, /Asset\.fromModule|quran-word-study\.db/);
  assert.doesNotMatch(coreIndex, /bundledWordStudyPack/);
});
