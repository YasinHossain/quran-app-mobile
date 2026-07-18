const assert = require('node:assert/strict');
const test = require('node:test');
const { loadWordReferenceRegistryModule } = require('./helpers.cjs');

const {
  activateWordReferencePack,
  emptyWordReferenceRegistry,
  removeWordReferencePackVersion,
  rollbackWordReferencePack,
} = loadWordReferenceRegistryModule();

function ref(packId, version, checksum = 'a'.repeat(64)) {
  return {
    packId,
    version,
    manifest: {
      format: 'quran-word-reference-sqlite-v1',
      compilerVersion: 'test',
      schemaVersion: 1,
      databaseFile: 'dictionary.db',
      databaseSizeBytes: 1,
      databaseChecksumSha256: checksum,
      logicalChecksumSha256: 'b'.repeat(64),
      entryCount: 1,
      matchedRootCount: 1,
      matchedLemmaCount: 1,
      source: {
        packId,
        sourceId: packId,
        title: packId,
        languageCode: 'en',
        version,
        attribution: 'fixture',
        url: 'https://example.test',
        checksumSha256: 'c'.repeat(64),
      },
    },
  };
}

test('Lane and Hans Wehr can be active simultaneously', () => {
  let registry = emptyWordReferenceRegistry();
  registry = activateWordReferencePack(registry, ref('lane-en', '1'));
  registry = activateWordReferencePack(registry, ref('hans-wehr-en', '1'));
  assert.deepEqual(Object.keys(registry.packs).sort(), ['hans-wehr-en', 'lane-en']);
});

test('updating one source retains its previous generation and rollback is isolated', () => {
  let registry = activateWordReferencePack(emptyWordReferenceRegistry(), ref('lane-en', '1'));
  registry = activateWordReferencePack(registry, ref('lane-en', '2'));
  assert.equal(registry.packs['lane-en'].active.version, '2');
  assert.equal(registry.packs['lane-en'].previous.version, '1');
  registry = rollbackWordReferencePack(registry, 'lane-en');
  assert.equal(registry.packs['lane-en'].active.version, '1');
});

test('pack versions are immutable', () => {
  const registry = activateWordReferencePack(emptyWordReferenceRegistry(), ref('lane-en', '1'));
  assert.throws(
    () => activateWordReferencePack(registry, ref('lane-en', '1', 'd'.repeat(64))),
    /immutable/
  );
});

test('deleting active content restores previous, then removes the slot', () => {
  let registry = activateWordReferencePack(emptyWordReferenceRegistry(), ref('lane-en', '1'));
  registry = activateWordReferencePack(registry, ref('lane-en', '2'));
  registry = removeWordReferencePackVersion(registry, 'lane-en', '2');
  assert.equal(registry.packs['lane-en'].active.version, '1');
  registry = removeWordReferencePackVersion(registry, 'lane-en', '1');
  assert.equal(registry.packs['lane-en'], undefined);
});
