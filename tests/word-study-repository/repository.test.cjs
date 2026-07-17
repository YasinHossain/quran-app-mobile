const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');
const {
  MANIFEST_PATH,
  PACK_PATH,
  NodeWordStudyDatabaseProvider,
  loadPackTypesModule,
  loadRepositoryModule,
} = require('./helpers.cjs');

const {
  SQLiteWordStudyRepository,
  WordStudyQueryCancelledError,
} = loadRepositoryModule();
const { assertCompatibleWordStudyManifest } = loadPackTypesModule();

test('hosted catalog metadata matches the bundled immutable pack', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const catalog = JSON.parse(
    fs.readFileSync(path.join(path.dirname(path.dirname(MANIFEST_PATH)), 'catalog.json'), 'utf8')
  );
  const entry = catalog.packs.find((item) => item.packId === 'core-qac-v0.4');
  assert.ok(entry);
  assert.equal(entry.version, 'qac-v0.4');
  assert.equal(entry.schemaVersion, manifest.schemaVersion);
  assert.equal(entry.databaseSizeBytes, manifest.databaseSizeBytes);
  assert.equal(entry.databaseChecksumSha256, manifest.databaseChecksumSha256);
});

test('incompatible schemas are rejected before SQLite is opened', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.throws(
    () => assertCompatibleWordStudyManifest({ ...manifest, schemaVersion: 2 }),
    /Unsupported word-study schema/
  );
});

test('real pack passes checksum, schema metadata, and golden word lookup', async (context) => {
  const manifest = assertCompatibleWordStudyManifest(
    JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  );
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(PACK_PATH)).digest('hex');
  assert.equal(checksum, manifest.databaseChecksumSha256);
  assert.equal(fs.statSync(PACK_PATH).size, manifest.databaseSizeBytes);

  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider);
  const analysis = await repository.findByLocation('3:3:9');
  assert.equal(analysis.surfaceUthmani, 'وَأَنزَلَ');
  assert.equal(analysis.location.locationKey, '3:3:9');
  assert.equal(analysis.lemma.status, 'available');
  assert.equal(analysis.lemma.value.arabic, 'أَنزَلَ');
  assert.equal(analysis.lemma.value.occurrenceCount, 183);
  assert.equal(analysis.root.status, 'available');
  assert.equal(analysis.root.value.arabic, 'نزل');
  assert.equal(analysis.root.value.occurrenceCount, 293);
  assert.equal(analysis.root.value.lemmaCount, 12);
  assert.deepEqual(
    analysis.morphemes.value.map((item) => item.segmentType),
    ['prefix', 'stem']
  );
  assert.equal(analysis.contextualGlosses[0].text, 'and He revealed');
});

test('rootless and missing locations return structured states', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider);
  const particle = await repository.findByLocation('2:141:11');
  assert.equal(particle.root.status, 'unsupported');
  assert.equal(particle.root.reason, 'particle-has-no-root');
  const demonstrative = await repository.findByLocation('2:2:1');
  assert.equal(demonstrative.root.status, 'unsupported');
  assert.equal(demonstrative.root.reason, 'not-applicable');
  const missing = await repository.findByLocation('1:1:99');
  assert.equal(missing.status, 'missing');
  assert.equal(missing.reason, 'source-row-missing');
});

test('verse lookup returns every ayah word in canonical position order', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider);
  const words = await repository.findByVerse('3:3');
  assert.equal(words.length, 11);
  assert.deepEqual(
    words.map((word) => word.location.wordPosition),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  );
  assert.equal(words[8].surfaceUthmani, 'وَأَنزَلَ');
});

test('real lemma/root pagination has stable golden counts and first/last pages', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider);

  const lemmaFirst = await repository.findOccurrences({ scope: 'lemma', lemmaId: '671', limit: 50 });
  assert.equal(lemmaFirst.pageInfo.totalCount, 183);
  assert.equal(lemmaFirst.items.length, 50);
  assert.equal(lemmaFirst.pageInfo.nextCursor, '50');

  let rootPage = await repository.findOccurrences({ scope: 'root', rootId: '1438', limit: 50 });
  assert.equal(rootPage.pageInfo.totalCount, 293);
  assert.equal(rootPage.items[0].location.locationKey, '2:4:4');
  let seen = rootPage.items.length;
  while (rootPage.pageInfo.nextCursor) {
    rootPage = await repository.findOccurrences({
      scope: 'root',
      rootId: '1438',
      limit: 50,
      cursor: rootPage.pageInfo.nextCursor,
    });
    seen += rootPage.items.length;
  }
  assert.equal(seen, 293);
  assert.equal(rootPage.items.at(-1).location.locationKey, '97:4:1');
  assert.equal(rootPage.pageInfo.hasNextPage, false);
});

test('surface pagination keeps normalized duplicates exact and includes concise ayah context', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider);

  const first = await repository.findOccurrences({
    scope: 'surface',
    normalizedSurface: 'من',
    limit: 30,
  });
  assert.equal(first.pageInfo.totalCount, 2763);
  assert.equal(first.items.length, 30);
  assert.equal(first.items[0].location.locationKey, '2:4:8');
  assert.ok(first.items[0].ayahContextUthmani.includes(first.items[0].surfaceUthmani));
  assert.ok(first.items[0].ayahContextUthmani.split(' ').length > 1);
  assert.ok(first.items[0].sourceReferences.some((source) => source.layer === 'occurrence-index'));

  const final = await repository.findOccurrences({
    scope: 'surface',
    normalizedSurface: 'من',
    limit: 30,
    cursor: '2760',
  });
  assert.equal(final.items.length, 3);
  assert.equal(final.items.at(-1).location.locationKey, '114:6:1');
  assert.equal(final.items.at(-1).surfaceUthmani, 'مِنَ');
  assert.equal(final.pageInfo.hasNextPage, false);
});

test('a 500+ root returns fixed-size first and final pages', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider);

  const first = await repository.findOccurrences({ scope: 'root', rootId: '46', limit: 30 });
  assert.equal(first.pageInfo.totalCount, 2851);
  assert.equal(first.items.length, 30);
  assert.equal(first.items[0].location.locationKey, '1:1:2');

  const final = await repository.findOccurrences({
    scope: 'root',
    rootId: '46',
    limit: 30,
    cursor: '2850',
  });
  assert.equal(final.items.length, 1);
  assert.equal(final.items[0].location.locationKey, '114:3:1');
  assert.equal(final.pageInfo.hasNextPage, false);
});

test('word, lemma, and root LRUs stay bounded and callers can cancel stale work', async (context) => {
  const provider = new NodeWordStudyDatabaseProvider();
  context.after(() => provider.closeAsync());
  const repository = new SQLiteWordStudyRepository(provider, {
    wordCacheCapacity: 2,
    lemmaCacheCapacity: 2,
    rootCacheCapacity: 2,
  });
  await repository.findByLocation('3:3:9');
  await repository.findByLocation('4:51:12');
  await repository.findByLocation('12:84:1');
  assert.deepEqual(repository.getCacheStats(), { words: 2, lemmas: 2, roots: 2 });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    repository.findByLocation('3:3:9', { signal: controller.signal }),
    WordStudyQueryCancelledError
  );
  await assert.rejects(
    repository.findOccurrences(
      { scope: 'root', rootId: '1438', limit: 50 },
      { signal: controller.signal }
    ),
    WordStudyQueryCancelledError
  );
});
