const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const COMPILER_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const APPLICATION_ID = 1448231473;
const DATABASE_FILE = 'quran-verb-reference.db';

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

function normalizeArabic(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\s\u200e\u200f]/gu, '')
    .replace(/[ٱأإآ]/gu, 'ا')
    .replace(/^ء/gu, 'ا')
    .replace(/ء(?=ا)/gu, '')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ة/gu, 'ه');
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\u00a0/gu, ' ').trim().replace(/\s+/gu, ' ');
  return cleaned || null;
}

const ROMAN = Object.freeze({
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI',
  7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII',
});

function verbForm(patternCode) {
  if (/^b\d+$/.test(patternCode) || patternCode === 'nc') return 'I';
  const derived = /^d(\d+)$/.exec(patternCode);
  if (derived && ROMAN[Number(derived[1])]) return ROMAN[Number(derived[1])];
  const quadriliteral = /^f(\d+)$/.exec(patternCode);
  if (quadriliteral && ROMAN[Number(quadriliteral[1])]) return ROMAN[Number(quadriliteral[1])];
  throw new Error(`Unsupported verb pattern code: ${patternCode}`);
}

function sqlite(sqlitePath, databasePath, args, input) {
  const result = spawnSync(sqlitePath, [databasePath, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'sqlite3 failed');
  return result.stdout;
}

function readSourceRows(sourcePath, sqlitePath) {
  const output = sqlite(
    sqlitePath,
    sourcePath,
    ['-json', 'SELECT Root AS root, Type AS patternCode, Past AS perfect, Present AS imperfect, "Order" AS imperative, Subject AS activeParticiple, Object AS passiveParticiple, Masdar AS verbalNoun FROM verbs ORDER BY Root, Type, Past, Present, "Order", Subject, Object, Masdar;']
  );
  const rows = JSON.parse(output || '[]').map((row) => {
    const rootArabic = clean(row.root);
    const patternCode = clean(row.patternCode);
    if (!rootArabic || !patternCode) throw new Error('Verb source contains a row without root or pattern');
    const perfect = clean(row.perfect);
    return {
      rootArabic,
      rootNormalized: normalizeArabic(rootArabic),
      patternCode,
      verbForm: verbForm(patternCode),
      perfect,
      normalizedPerfect: perfect ? normalizeArabic(perfect) : null,
      imperfect: clean(row.imperfect),
      imperative: clean(row.imperative),
      activeParticiple: clean(row.activeParticiple),
      passiveParticiple: clean(row.passiveParticiple),
      verbalNoun: clean(row.verbalNoun),
    };
  });
  const unique = new Map();
  for (const row of rows) unique.set(stableStringify(row), row);
  return [...unique.values()].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right), 'en'));
}

function quote(value) {
  if (value === null) return 'NULL';
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function compileVerbReferencePack({ sourcePath, outputDirectory, sqlitePath = 'sqlite3', sourceVersion = '1' }) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Verb reference source not found: ${sourcePath}`);
  const sourceChecksum = sha256File(sourcePath);
  const rows = readSourceRows(sourcePath, sqlitePath);
  if (rows.length < 1) throw new Error('Verb reference source is empty');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'verb-reference-pack-'));
  const temporaryDatabase = path.join(temporaryDirectory, DATABASE_FILE);
  const logicalChecksum = sha256Buffer(stableStringify(rows));
  const sql = [
    'PRAGMA page_size=4096;',
    `PRAGMA application_id=${APPLICATION_ID};`,
    `PRAGMA user_version=${SCHEMA_VERSION};`,
    'PRAGMA journal_mode=OFF;',
    'PRAGMA synchronous=OFF;',
    'BEGIN;',
    'CREATE TABLE compiler_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;',
    'CREATE TABLE source_metadata (source_id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT NOT NULL, license TEXT NOT NULL, attribution TEXT NOT NULL, url TEXT NOT NULL, checksum_sha256 TEXT NOT NULL) WITHOUT ROWID;',
    'CREATE TABLE verb_reference (id INTEGER PRIMARY KEY, root_arabic TEXT NOT NULL, root_normalized TEXT NOT NULL, pattern_code TEXT NOT NULL, verb_form TEXT NOT NULL, perfect TEXT, normalized_perfect TEXT, imperfect TEXT, imperative TEXT, active_participle TEXT, passive_participle TEXT, verbal_noun TEXT, source_id TEXT NOT NULL, source_version TEXT NOT NULL);',
    'CREATE INDEX verb_reference_lookup ON verb_reference(root_normalized, verb_form);',
    'CREATE INDEX verb_reference_lemma_lookup ON verb_reference(root_normalized, verb_form, normalized_perfect);',
    `INSERT INTO compiler_metadata VALUES ('compiler_version',${quote(COMPILER_VERSION)}),('logical_checksum_sha256',${quote(logicalChecksum)}),('row_count',${quote(String(rows.length))});`,
    `INSERT INTO source_metadata VALUES ('greentech-verb-reference','Quran verb principal-parts reference',${quote(sourceVersion)},'Permission pending','Six-field verb reference data from the inspected Al Quran (Tafsir & by Word) application package.','https://gtaf.org/apps/quran/',${quote(sourceChecksum)});`,
    ...rows.map((row, index) => `INSERT INTO verb_reference VALUES (${index + 1},${quote(row.rootArabic)},${quote(row.rootNormalized)},${quote(row.patternCode)},${quote(row.verbForm)},${quote(row.perfect)},${quote(row.normalizedPerfect)},${quote(row.imperfect)},${quote(row.imperative)},${quote(row.activeParticiple)},${quote(row.passiveParticiple)},${quote(row.verbalNoun)},'greentech-verb-reference',${quote(sourceVersion)});`),
    'COMMIT;',
    'VACUUM;',
  ].join('\n');
  sqlite(sqlitePath, temporaryDatabase, [], sql);
  const integrity = sqlite(sqlitePath, temporaryDatabase, ['PRAGMA integrity_check;']).trim();
  if (integrity !== 'ok') throw new Error(`Verb reference integrity check failed: ${integrity}`);
  const databasePath = path.join(outputDirectory, DATABASE_FILE);
  fs.copyFileSync(temporaryDatabase, databasePath);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  const databaseSizeBytes = fs.statSync(databasePath).size;
  const manifest = {
    format: 'quran-verb-reference-sqlite-v1',
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    databaseFile: DATABASE_FILE,
    databaseSizeBytes,
    databaseChecksumSha256: sha256File(databasePath),
    logicalChecksumSha256: logicalChecksum,
    rowCount: rows.length,
    source: {
      sourceId: 'greentech-verb-reference',
      title: 'Quran verb principal-parts reference',
      version: sourceVersion,
      license: 'Permission pending',
      attribution: 'Six-field verb reference data from the inspected Al Quran (Tafsir & by Word) application package.',
      url: 'https://gtaf.org/apps/quran/',
      checksumSha256: sourceChecksum,
    },
  };
  fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { databasePath, manifest, rowCount: rows.length };
}

module.exports = {
  APPLICATION_ID,
  SCHEMA_VERSION,
  clean,
  compileVerbReferencePack,
  normalizeArabic,
  verbForm,
};
