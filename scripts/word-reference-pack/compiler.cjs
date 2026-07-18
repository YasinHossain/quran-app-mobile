const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const { normalizeArabic } = require('../word-study-pack/compiler.cjs');

const FORMAT = 'quran-word-reference-sqlite-v1';
const COMPILER_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const APPLICATION_ID = 1465078866;

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function plainDefinition(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/\u0000/gu, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .trim();
}

function sanitizedHtmlDefinition(value) {
  const tokens = [];
  const tokenized = String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
    .replace(/<(\/)?(i|em|b|strong|br)\s*\/?>/giu, (tag, closing, name) => {
      const normalizedName = name.toLowerCase() === 'em' ? 'i' : name.toLowerCase() === 'strong' ? 'b' : name.toLowerCase();
      const safeTag = normalizedName === 'br' ? '<br/>' : `<${closing ? '/' : ''}${normalizedName}>`;
      const token = `\u0001${tokens.length}\u0002`;
      tokens.push(safeTag);
      return token;
    })
    .replace(/<[^>]+>/gu, '')
    .replace(/\u0000/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/===/gu, '<br/><br/>')
    .replace(/\r\n?/gu, '\n')
    .trim();
  return tokenized.replace(/\u0001(\d+)\u0002/gu, (_, index) => tokens[Number(index)] ?? '');
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readCoreKeys(coreDatabasePath) {
  const db = new DatabaseSync(coreDatabasePath, { readOnly: true });
  try {
    return {
      roots: [...new Set(db.prepare('SELECT normalized FROM root ORDER BY normalized').all().map((row) => String(row.normalized)))],
      lemmas: [...new Set(db.prepare('SELECT normalized FROM lemma ORDER BY normalized').all().map((row) => String(row.normalized)))],
    };
  } finally {
    db.close();
  }
}

function readSourceEntries(sourceDatabasePath, definitionFormat) {
  const db = new DatabaseSync(sourceDatabasePath, { readOnly: true });
  try {
    return db.prepare(`
      SELECT id, word, definition, is_root, parent_id
      FROM DICTIONARY
      ORDER BY CAST(id AS INTEGER)
    `).all().map((row, index) => {
      const headwordArabic = String(row.word ?? '').trim();
      return {
        entryId: String(row.id),
        parentEntryId: row.parent_id === null || row.parent_id === undefined ? undefined : String(row.parent_id),
        headwordArabic,
        normalizedHeadword: normalizeArabic(headwordArabic),
        isRoot: Number(row.is_root) === 1,
        sequence: index + 1,
        definition: definitionFormat === 'sanitized-html'
          ? sanitizedHtmlDefinition(row.definition)
          : plainDefinition(row.definition),
        definitionFormat,
      };
    });
  } finally {
    db.close();
  }
}

function buildPackData({ coreDatabasePath, sourceDatabasePath, definitionFormat }) {
  const core = readCoreKeys(coreDatabasePath);
  const coreRoots = new Set(core.roots);
  const coreLemmas = new Set(core.lemmas);
  const allEntries = readSourceEntries(sourceDatabasePath, definitionFormat);
  const entryById = new Map(allEntries.map((entry) => [entry.entryId, entry]));
  const rootEntries = allEntries.filter((entry) => entry.isRoot && coreRoots.has(entry.normalizedHeadword));
  const lemmaEntries = allEntries.filter((entry) => coreLemmas.has(entry.normalizedHeadword));
  const familyRootIds = new Set(rootEntries.map((entry) => entry.entryId));
  for (const entry of lemmaEntries) {
    const parent = entry.parentEntryId ? entryById.get(entry.parentEntryId) : undefined;
    if (parent?.isRoot) familyRootIds.add(parent.entryId);
  }
  const exactLemmaIds = new Set(lemmaEntries.map((entry) => entry.entryId));
  const included = allEntries.filter(
    (entry) =>
      familyRootIds.has(entry.entryId) ||
      (entry.parentEntryId ? familyRootIds.has(entry.parentEntryId) : false) ||
      exactLemmaIds.has(entry.entryId)
  );
  const includedIds = new Set(included.map((entry) => entry.entryId));

  const mappings = [];
  const rootsByKey = new Map();
  for (const entry of rootEntries) {
    if (!includedIds.has(entry.entryId) || !entry.normalizedHeadword) continue;
    const rank = rootsByKey.get(entry.normalizedHeadword) ?? 0;
    rootsByKey.set(entry.normalizedHeadword, rank + 1);
    mappings.push({ kind: 'root', normalizedKey: entry.normalizedHeadword, entryId: entry.entryId, rank });
  }
  const lemmasByKey = new Map();
  for (const entry of lemmaEntries.sort((a, b) => Number(a.isRoot) - Number(b.isRoot) || a.sequence - b.sequence)) {
    if (!includedIds.has(entry.entryId) || !entry.normalizedHeadword) continue;
    const rank = lemmasByKey.get(entry.normalizedHeadword) ?? 0;
    lemmasByKey.set(entry.normalizedHeadword, rank + 1);
    mappings.push({ kind: 'lemma', normalizedKey: entry.normalizedHeadword, entryId: entry.entryId, rank });
  }
  mappings.sort((a, b) => a.kind.localeCompare(b.kind) || a.normalizedKey.localeCompare(b.normalizedKey, 'ar') || a.rank - b.rank || Number(a.entryId) - Number(b.entryId));

  return {
    entries: included,
    mappings,
    report: {
      quranRootCount: core.roots.length,
      matchedRootCount: rootsByKey.size,
      unmatchedRoots: core.roots.filter((root) => !rootsByKey.has(root)),
      quranLemmaCount: core.lemmas.length,
      matchedLemmaCount: lemmasByKey.size,
      unmatchedLemmas: core.lemmas.filter((lemma) => !lemmasByKey.has(lemma)),
      sourceEntryCount: allEntries.length,
      includedEntryCount: included.length,
      emptyDefinitionCount: included.filter((entry) => !entry.definition).length,
    },
  };
}

function buildSql({ entries, mappings, source, logicalChecksum }) {
  const lines = [
    'PRAGMA journal_mode=OFF;',
    'PRAGMA synchronous=OFF;',
    'PRAGMA locking_mode=EXCLUSIVE;',
    `PRAGMA application_id=${APPLICATION_ID};`,
    `PRAGMA user_version=${SCHEMA_VERSION};`,
    'BEGIN;',
    'CREATE TABLE compiler_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);',
    'CREATE TABLE source_metadata(source_id TEXT PRIMARY KEY, pack_id TEXT NOT NULL, title TEXT NOT NULL, language_code TEXT NOT NULL, version TEXT NOT NULL, attribution TEXT NOT NULL, url TEXT NOT NULL, checksum_sha256 TEXT NOT NULL);',
    'CREATE TABLE dictionary_entry(entry_id TEXT PRIMARY KEY, parent_entry_id TEXT, headword_arabic TEXT NOT NULL, normalized_headword TEXT NOT NULL, is_root INTEGER NOT NULL CHECK(is_root IN (0,1)), sequence INTEGER NOT NULL, definition TEXT NOT NULL, definition_format TEXT NOT NULL);',
    "CREATE TABLE quran_lookup(kind TEXT NOT NULL CHECK(kind IN ('root','lemma')), normalized_key TEXT NOT NULL, entry_id TEXT NOT NULL, rank INTEGER NOT NULL, PRIMARY KEY(kind, normalized_key, entry_id), FOREIGN KEY(entry_id) REFERENCES dictionary_entry(entry_id));",
    'CREATE INDEX dictionary_entry_parent_idx ON dictionary_entry(parent_entry_id, sequence);',
    'CREATE INDEX dictionary_entry_headword_idx ON dictionary_entry(normalized_headword, sequence);',
    'CREATE INDEX quran_lookup_key_idx ON quran_lookup(kind, normalized_key, rank);',
    `INSERT INTO compiler_metadata VALUES('compiler_version',${sqlString(COMPILER_VERSION)});`,
    `INSERT INTO compiler_metadata VALUES('logical_checksum_sha256',${sqlString(logicalChecksum)});`,
    `INSERT INTO source_metadata VALUES(${sqlString(source.sourceId)},${sqlString(source.packId)},${sqlString(source.title)},${sqlString(source.languageCode)},${sqlString(source.version)},${sqlString(source.attribution)},${sqlString(source.url)},${sqlString(source.checksumSha256)});`,
  ];
  for (const entry of entries) {
    lines.push(`INSERT INTO dictionary_entry VALUES(${sqlString(entry.entryId)},${entry.parentEntryId ? sqlString(entry.parentEntryId) : 'NULL'},${sqlString(entry.headwordArabic)},${sqlString(entry.normalizedHeadword)},${entry.isRoot ? 1 : 0},${entry.sequence},${sqlString(entry.definition)},${sqlString(entry.definitionFormat)});`);
  }
  for (const mapping of mappings) {
    lines.push(`INSERT INTO quran_lookup VALUES(${sqlString(mapping.kind)},${sqlString(mapping.normalizedKey)},${sqlString(mapping.entryId)},${mapping.rank});`);
  }
  lines.push('COMMIT;', 'VACUUM;');
  return lines.join('\n');
}

function compileDictionaryPack({
  coreDatabasePath,
  sourceDatabasePath,
  outputDir,
  source,
  definitionFormat,
  sqliteBinary = 'sqlite3',
}) {
  const sourceChecksum = sha256File(sourceDatabasePath);
  const normalizedSource = { ...source, checksumSha256: sourceChecksum };
  const data = buildPackData({ coreDatabasePath, sourceDatabasePath, definitionFormat });
  const logicalChecksum = sha256Buffer(stableStringify({ entries: data.entries, mappings: data.mappings, source: normalizedSource }));
  fs.mkdirSync(outputDir, { recursive: true });
  const databaseFile = 'quran-word-reference.db';
  const databasePath = path.join(outputDir, databaseFile);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-reference-compiler-'));
  try {
    if (fs.existsSync(databasePath)) fs.unlinkSync(databasePath);
    const sqlite = spawnSync(sqliteBinary, [databasePath], {
      input: buildSql({ ...data, source: normalizedSource, logicalChecksum }),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (sqlite.status !== 0) throw new Error(sqlite.stderr || 'SQLite dictionary pack compilation failed');
    fs.chmodSync(databasePath, 0o644);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const manifest = {
    format: FORMAT,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    databaseFile,
    databaseSizeBytes: fs.statSync(databasePath).size,
    databaseChecksumSha256: sha256File(databasePath),
    logicalChecksumSha256: logicalChecksum,
    entryCount: data.entries.length,
    matchedRootCount: data.report.matchedRootCount,
    matchedLemmaCount: data.report.matchedLemmaCount,
    source: normalizedSource,
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'validation-report.json'), `${JSON.stringify({ format: 'quran-word-reference-validation-v1', status: 'passed', ...data.report }, null, 2)}\n`);
  return { databasePath, manifest, report: data.report };
}

module.exports = {
  APPLICATION_ID,
  COMPILER_VERSION,
  FORMAT,
  SCHEMA_VERSION,
  buildPackData,
  compileDictionaryPack,
  plainDefinition,
  sanitizedHtmlDefinition,
  stableStringify,
};
