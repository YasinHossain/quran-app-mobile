const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  NodeWordStudyDatabaseProvider,
  loadVerbReferencePackTypesModule,
  loadVerbReferenceRepositoryModule,
} = require('./helpers.cjs');
const { compileVerbReferenceFixture } = require('../word-study-pack/verb-reference-fixture.cjs');

const { SQLiteVerbReferenceRepository } = loadVerbReferenceRepositoryModule();
const { assertCompatibleVerbReferenceManifest } = loadVerbReferencePackTypesModule();

test('compiled verb reference manifests pass the installer manifest check', () => {
  const { databasePath } = compileVerbReferenceFixture();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(path.dirname(databasePath), 'manifest.json'), 'utf8')
  );
  assert.equal(assertCompatibleVerbReferenceManifest(manifest), manifest);
  assert.throws(
    () => assertCompatibleVerbReferenceManifest({ ...manifest, databaseChecksumSha256: 'not-a-checksum' }),
    /checksum is invalid/
  );
  assert.throws(
    () => assertCompatibleVerbReferenceManifest({ ...manifest, databaseFile: 'nested/pack.db' }),
    /must be a file name/
  );
});

test('verb reference lookup returns only the encountered derived form', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider(compileVerbReferenceFixture().databasePath);
  context.after(() => provider.closeAsync());
  const repository = new SQLiteVerbReferenceRepository(provider);
  const formFour = await repository.findByVerb({
    rootNormalized: 'نزل',
    lemmaNormalized: 'انزل',
    verbForm: 'IV',
  });
  assert.ok('principalParts' in formFour);
  assert.equal(formFour.verbForm, 'IV');
  assert.equal(formFour.principalParts.perfect, 'أَنْزَلَ');
  assert.equal(formFour.principalParts.imperfect, 'يُنْزِلُ');
  assert.equal(formFour.principalParts.imperative, 'أَنْزِلْ');
  assert.equal(formFour.principalParts.activeParticiple, 'مُنْزِل');
  assert.equal(formFour.principalParts.passiveParticiple, 'مُنْزَل');
  assert.equal(formFour.principalParts.verbalNoun, 'إِنْزَال');
  assert.notEqual(formFour.principalParts.perfect, 'نَزَّلَ');
});

test('verb reference lookup does not guess between conflicting patterns', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider(compileVerbReferenceFixture().databasePath);
  context.after(() => provider.closeAsync());
  const repository = new SQLiteVerbReferenceRepository(provider);
  const result = await repository.findByVerb({
    rootNormalized: 'حلل',
    lemmaNormalized: 'حل',
    verbForm: 'I',
  });
  assert.deepEqual(result, { status: 'missing', reason: 'ambiguous-reference' });
});
