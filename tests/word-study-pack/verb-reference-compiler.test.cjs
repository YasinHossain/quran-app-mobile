const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  clean,
  compileVerbReferencePack,
  normalizeArabic,
  verbForm,
} = require('../../scripts/verb-reference-pack/compiler.cjs');
const { FIXTURE_SOURCE, compileVerbReferenceFixture } = require('./verb-reference-fixture.cjs');

test('verb reference compiler maps source patterns to Quranic verb forms', () => {
  assert.equal(verbForm('b3'), 'I');
  assert.equal(verbForm('d2'), 'II');
  assert.equal(verbForm('d10'), 'X');
  assert.equal(verbForm('f4'), 'IV');
  assert.equal(normalizeArabic('أَنْزَلَ'), 'انزل');
  assert.equal(clean('\u00a0مُنْزَل  عَنْهُ  '), 'مُنْزَل عَنْهُ');
});

test('compiled verb reference manifest matches its database and records the supplied source', () => {
  const { databasePath } = compileVerbReferenceFixture();
  const packDirectory = path.dirname(databasePath);
  const manifest = JSON.parse(fs.readFileSync(path.join(packDirectory, 'manifest.json'), 'utf8'));
  const database = fs.readFileSync(path.join(packDirectory, manifest.databaseFile));
  assert.equal(database.length, manifest.databaseSizeBytes);
  assert.equal(crypto.createHash('sha256').update(database).digest('hex'), manifest.databaseChecksumSha256);
  assert.equal(manifest.format, 'quran-verb-reference-sqlite-v1');
  assert.equal(manifest.schemaVersion, 1);
  // The duplicate form IV source row collapses into one record.
  assert.equal(manifest.rowCount, 5);
  assert.deepEqual(
    { ...manifest.source, version: undefined, checksumSha256: undefined },
    { ...FIXTURE_SOURCE, version: undefined, checksumSha256: undefined }
  );
});

test('verb reference compiler refuses a source without attribution', () => {
  assert.throws(
    () =>
      compileVerbReferencePack({
        sourcePath: __filename,
        source: { ...FIXTURE_SOURCE, attribution: ' ' },
        outputDirectory: path.join(__dirname, 'unused'),
      }),
    /non-empty attribution/
  );
});
