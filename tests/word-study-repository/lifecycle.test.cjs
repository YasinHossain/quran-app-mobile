const assert = require('node:assert/strict');
const test = require('node:test');
const { loadLifecycleModule } = require('./helpers.cjs');

const { WordStudyPackLifecycle } = loadLifecycleModule();

const manifest = {
  format: 'quran-word-study-sqlite-v1',
  compilerVersion: 'test',
  schemaVersion: 1,
  databaseFile: 'pack.db',
  databaseSizeBytes: 1,
  databaseChecksumSha256: 'a'.repeat(64),
  logicalChecksumSha256: 'b'.repeat(64),
  sources: [],
};

function pack(version) {
  return {
    packId: 'core',
    version,
    manifest,
    databaseDirectoryUri: `file:///packs/${version}/`,
    databaseUri: `file:///packs/${version}/pack.db`,
  };
}

class FakeBackend {
  constructor(state = null) {
    this.state = state;
    this.valid = new Map();
    this.writes = [];
    this.bundledInstalls = 0;
    this.hostedError = null;
    this.hostedInstalls = 0;
  }
  async readActivationStateAsync() {
    return this.state;
  }
  async writeActivationStateAsync(state) {
    this.state = state;
    this.writes.push(state);
  }
  async validateInstalledPackAsync(ref) {
    const value = this.valid.get(ref.version);
    if (!value) throw new Error(`invalid ${ref.version}`);
    return value;
  }
  async installBundledPackAsync() {
    this.bundledInstalls += 1;
    const value = pack('bundled');
    this.valid.set('bundled', value);
    return value;
  }
  async installHostedPackAsync(entry) {
    this.hostedInstalls += 1;
    if (this.hostedError) throw this.hostedError;
    const value = pack(entry.version);
    this.valid.set(entry.version, value);
    return value;
  }
}

function ref(version) {
  return { packId: 'core', version, manifest };
}

test('missing activation installs the trusted bundled pack', async () => {
  const backend = new FakeBackend();
  const ready = await new WordStudyPackLifecycle(backend).ensureReadyAsync();
  assert.equal(ready.version, 'bundled');
  assert.equal(ready.recovery, 'bundled-install');
  assert.equal(backend.bundledInstalls, 1);
  assert.equal(backend.state.active.version, 'bundled');
});

test('corrupt active pack rolls back to the retained valid generation', async () => {
  const backend = new FakeBackend({
    format: 'quran-word-study-activation-v1',
    active: ref('corrupt'),
    previous: ref('previous'),
  });
  backend.valid.set('previous', pack('previous'));
  const ready = await new WordStudyPackLifecycle(backend).ensureReadyAsync();
  assert.equal(ready.version, 'previous');
  assert.equal(ready.recovery, 'rollback');
  assert.equal(backend.state.active.version, 'previous');
  assert.equal(backend.bundledInstalls, 0);
});

test('missing/incompatible active and previous packs recover from bundled content', async () => {
  const backend = new FakeBackend({
    format: 'quran-word-study-activation-v1',
    active: ref('incompatible'),
    previous: ref('corrupt'),
  });
  const ready = await new WordStudyPackLifecycle(backend).ensureReadyAsync();
  assert.equal(ready.recovery, 'bundled-reinstall');
  assert.equal(backend.state.active.version, 'bundled');
  assert.equal(backend.bundledInstalls, 1);
});

test('interrupted update never changes the active generation', async () => {
  const backend = new FakeBackend({
    format: 'quran-word-study-activation-v1',
    active: ref('stable'),
  });
  backend.valid.set('stable', pack('stable'));
  backend.hostedError = new Error('interrupted download');
  const lifecycle = new WordStudyPackLifecycle(backend);
  await assert.rejects(
    lifecycle.installUpdateAsync({
      packId: 'core',
      version: 'next',
      manifestUrl: 'https://example.test/manifest.json',
      databaseUrl: 'https://example.test/pack.db',
      databaseSizeBytes: 1,
      databaseChecksumSha256: 'a'.repeat(64),
      schemaVersion: 1,
    }),
    /interrupted download/
  );
  assert.equal(backend.state.active.version, 'stable');
  assert.equal(backend.writes.length, 0);
});

test('validated update activation retains the previous generation for rollback', async () => {
  const backend = new FakeBackend({
    format: 'quran-word-study-activation-v1',
    active: ref('stable'),
  });
  backend.valid.set('stable', pack('stable'));
  const ready = await new WordStudyPackLifecycle(backend).installUpdateAsync({
    packId: 'core',
    version: 'next',
    manifestUrl: 'https://example.test/manifest.json',
    databaseUrl: 'https://example.test/pack.db',
    databaseSizeBytes: 1,
    databaseChecksumSha256: 'a'.repeat(64),
    schemaVersion: 1,
  });
  assert.equal(ready.version, 'next');
  assert.equal(backend.state.active.version, 'next');
  assert.equal(backend.state.previous.version, 'stable');
});

test('pack versions are immutable and an already-active version is not replaced', async () => {
  const backend = new FakeBackend({
    format: 'quran-word-study-activation-v1',
    active: ref('stable'),
  });
  backend.valid.set('stable', pack('stable'));
  const lifecycle = new WordStudyPackLifecycle(backend);
  const entry = {
    packId: 'core',
    version: 'stable',
    manifestUrl: 'https://example.test/manifest.json',
    databaseUrl: 'https://example.test/pack.db',
    databaseSizeBytes: 1,
    databaseChecksumSha256: manifest.databaseChecksumSha256,
    schemaVersion: 1,
  };
  const ready = await lifecycle.installUpdateAsync(entry);
  assert.equal(ready.version, 'stable');
  assert.equal(backend.hostedInstalls, 0);
  await assert.rejects(
    lifecycle.installUpdateAsync({ ...entry, databaseChecksumSha256: 'c'.repeat(64) }),
    /versions are immutable/
  );
  assert.equal(backend.hostedInstalls, 0);
});
