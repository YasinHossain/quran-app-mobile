const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const {
  APPLICATION_ID,
  compileDictionaryPack,
  sanitizedHtmlDefinition,
} = require('../../scripts/word-reference-pack/compiler.cjs');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG_PATH = path.join(ROOT, 'dist/word-reference-packs/catalog.json');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('Lane markup sanitizer keeps emphasis and removes executable or unknown markup', () => {
  const value = sanitizedHtmlDefinition(
    '<script>alert(1)</script><span class="x">word</span> <i>meaning</i> === next'
  );
  assert.doesNotMatch(value, /script|span|alert/iu);
  assert.match(value, /word <i>meaning<\/i> <br\/><br\/> next/u);
});

test('dictionary compiler is byte deterministic and reports missing coverage', (context) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dictionary-compiler-'));
  context.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const corePath = path.join(temp, 'core.db');
  const sourcePath = path.join(temp, 'source.db');
  const core = new DatabaseSync(corePath);
  core.exec("CREATE TABLE root(normalized TEXT); CREATE TABLE lemma(normalized TEXT); INSERT INTO root VALUES('نزل'),('فقد'); INSERT INTO lemma VALUES('نزل'),('منزل');");
  core.close();
  const source = new DatabaseSync(sourcePath);
  source.exec(`
    CREATE VIRTUAL TABLE DICTIONARY USING fts5(id,word,definition,is_root,parent_id,quran_occurrence,favorite_flag);
    INSERT INTO DICTIONARY VALUES(1,'نزل','نزل',1,1,NULL,0);
    INSERT INTO DICTIONARY VALUES(2,'نزل','<i>descend</i>',0,1,NULL,0);
    INSERT INTO DICTIONARY VALUES(3,'منزل','dwelling',0,1,NULL,0);
    INSERT INTO DICTIONARY VALUES(4,'نزل','second root',1,4,NULL,0);
  `);
  source.close();
  const sourceConfig = {
    packId: 'fixture-en',
    sourceId: 'fixture',
    title: 'Fixture',
    languageCode: 'en',
    version: '1',
    attribution: 'fixture',
    url: 'https://example.test',
  };
  const first = compileDictionaryPack({ coreDatabasePath: corePath, sourceDatabasePath: sourcePath, outputDir: path.join(temp, 'a'), source: sourceConfig, definitionFormat: 'sanitized-html' });
  const second = compileDictionaryPack({ coreDatabasePath: corePath, sourceDatabasePath: sourcePath, outputDir: path.join(temp, 'b'), source: sourceConfig, definitionFormat: 'sanitized-html' });
  assert.deepEqual(fs.readFileSync(first.databasePath), fs.readFileSync(second.databasePath));
  assert.equal(first.report.matchedRootCount, 1);
  assert.equal(first.report.matchedLemmaCount, 2);
  assert.deepEqual(first.report.unmatchedRoots, ['فقد']);
  const db = new DatabaseSync(first.databasePath, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) count FROM quran_lookup WHERE kind='root' AND normalized_key='نزل'").get().count, 2);
  db.close();
});

test('published Lane and Hans packs match their immutable manifests and schema', () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  assert.equal(catalog.format, 'quran-word-reference-catalog-v1');
  assert.deepEqual(catalog.packs.map((pack) => pack.packId), ['lane-en', 'hans-wehr-en']);
  for (const item of catalog.packs) {
    const directory = path.join(ROOT, 'dist/word-reference-packs', item.packId, item.version);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const databasePath = path.join(directory, manifest.databaseFile);
    assert.equal(fs.statSync(databasePath).size, manifest.databaseSizeBytes);
    assert.equal(sha256(databasePath), manifest.databaseChecksumSha256);
    const db = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(db.prepare('PRAGMA application_id').get().application_id, APPLICATION_ID);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.ok(db.prepare("SELECT count(*) count FROM quran_lookup WHERE kind='root' AND normalized_key='نزل'").get().count > 0);
    assert.ok(db.prepare("SELECT count(*) count FROM dictionary_entry WHERE parent_entry_id IN (SELECT entry_id FROM quran_lookup WHERE kind='root' AND normalized_key='نزل')").get().count > 0);
    db.close();
  }
});
