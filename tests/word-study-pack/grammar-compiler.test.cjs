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

test('bundled grammar pack manifest matches the generated immutable database', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const bytes = fs.readFileSync(PACK_PATH);
  assert.equal(fs.statSync(PACK_PATH).size, manifest.databaseSizeBytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.databaseChecksumSha256);
  assert.equal(manifest.format, 'quran-word-grammar-sqlite-v1');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.verseCount, 5785);
  assert.equal(manifest.passageCount, 29881);
});
