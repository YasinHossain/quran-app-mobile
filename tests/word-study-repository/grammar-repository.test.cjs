const assert = require('node:assert/strict');
const test = require('node:test');
const {
  GRAMMAR_PACK_PATH,
  NodeWordStudyDatabaseProvider,
  loadGrammarRepositoryModule,
} = require('./helpers.cjs');

const { SQLiteGrammarStudyRepository } = loadGrammarRepositoryModule();

test('real grammar pack returns ordered Arabic passages for an analyzed ayah', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider(GRAMMAR_PACK_PATH);
  context.after(() => provider.closeAsync());
  const repository = new SQLiteGrammarStudyRepository(provider);
  const result = await repository.findByVerse('3:3');
  assert.ok('passages' in result);
  assert.equal(result.verseKey, '3:3');
  assert.equal(result.source.layer, 'grammar');
  assert.ok(result.passages.length >= 3);
  assert.ok(result.passages.some((passage) => passage.headingArabic.includes('أَنْزَلَ')));
  assert.ok(result.passages.every((passage, index) => passage.sequence === index + 1));
});

test('grammar repository returns a structured missing state for uncovered ayahs', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider(GRAMMAR_PACK_PATH);
  context.after(() => provider.closeAsync());
  const repository = new SQLiteGrammarStudyRepository(provider);
  const result = await repository.findByVerse('2:141');
  assert.equal(result.status, 'missing');
  assert.equal(result.reason, 'source-row-missing');
});
