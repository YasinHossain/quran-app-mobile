const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  clean,
  normalizeArabic,
  verbForm,
} = require('../../scripts/verb-reference-pack/compiler.cjs');

const ROOT = path.resolve(__dirname, '../..');
const PACK_DIRECTORY = path.join(ROOT, 'dist/verb-reference-packs/quran-verbs-v1');

test('verb reference compiler maps source patterns to Quranic verb forms', () => {
  assert.equal(verbForm('b3'), 'I');
  assert.equal(verbForm('d2'), 'II');
  assert.equal(verbForm('d10'), 'X');
  assert.equal(verbForm('f4'), 'IV');
  assert.equal(normalizeArabic('أَنْزَلَ'), 'انزل');
  assert.equal(clean('\u00a0مُنْزَل  عَنْهُ  '), 'مُنْزَل عَنْهُ');
});

test('non-distributed verb reference candidate manifest matches its immutable database', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PACK_DIRECTORY, 'manifest.json'), 'utf8'));
  const database = fs.readFileSync(path.join(PACK_DIRECTORY, manifest.databaseFile));
  assert.equal(database.length, manifest.databaseSizeBytes);
  assert.equal(crypto.createHash('sha256').update(database).digest('hex'), manifest.databaseChecksumSha256);
  assert.equal(manifest.format, 'quran-verb-reference-sqlite-v1');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.rowCount, 2075);
});
