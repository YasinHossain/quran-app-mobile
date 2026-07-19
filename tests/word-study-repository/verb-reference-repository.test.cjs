const assert = require('node:assert/strict');
const test = require('node:test');
const {
  NodeWordStudyDatabaseProvider,
  VERB_REFERENCE_PACK_PATH,
  loadVerbReferenceRepositoryModule,
} = require('./helpers.cjs');

const { SQLiteVerbReferenceRepository } = loadVerbReferenceRepositoryModule();

test('verb reference lookup returns only the encountered derived form', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider(VERB_REFERENCE_PACK_PATH);
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
  const provider = new NodeWordStudyDatabaseProvider(VERB_REFERENCE_PACK_PATH);
  context.after(() => provider.closeAsync());
  const repository = new SQLiteVerbReferenceRepository(provider);
  const result = await repository.findByVerb({
    rootNormalized: 'حلل',
    lemmaNormalized: 'حل',
    verbForm: 'I',
  });
  assert.deepEqual(result, { status: 'missing', reason: 'ambiguous-reference' });
});
