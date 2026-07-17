const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const FORMAT = 'quran-word-grammar-sqlite-v1';
const COMPILER_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const APPLICATION_ID = 1363624525;
const SOURCE_ID = 'qac-arabic-irab';
const SOURCE_VERSION = '1.4';

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

function unzipMember(zipPath, suffix) {
  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (listing.status !== 0) throw new Error(listing.stderr || 'Unable to inspect grammar source archive');
  const member = listing.stdout.split(/\r?\n/).find((name) => name.endsWith(suffix));
  if (!member) throw new Error(`Grammar source archive is missing ${suffix}`);
  const result = spawnSync('unzip', ['-p', zipPath, member], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr?.toString() || `Unable to read ${member}`);
  return result.stdout;
}

function parseStarDict(idx, dictionary) {
  const entries = [];
  let cursor = 0;
  while (cursor < idx.length) {
    const end = idx.indexOf(0, cursor);
    if (end < 0 || end + 9 > idx.length) throw new Error('Invalid StarDict index');
    const key = idx.subarray(cursor, end).toString('utf8');
    const offset = idx.readUInt32BE(end + 1);
    const size = idx.readUInt32BE(end + 5);
    if (offset + size > dictionary.length) throw new Error(`Invalid StarDict range for ${key}`);
    entries.push({ key, html: dictionary.subarray(offset, offset + size).toString('utf8') });
    cursor = end + 9;
  }
  return entries;
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&amp;/giu, '&');
}

function plainText(value) {
  return decodeEntities(value.replace(/<br\s*\/?>/giu, '\n').replace(/<[^>]+>/gu, ''))
    .replace(/[\u200e\u200f]/gu, '')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim();
}

function normalizeArabic(value) {
  return plainText(value)
    .normalize('NFKD')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\s]/gu, '')
    .replace(/[ٱأإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/[^\p{Script=Arabic}]/gu, '');
}

function parsePassages(html) {
  const passages = [];
  const pattern = /<p dir="rtl" style="font-size:120%">([\s\S]*?)<\/p>/giu;
  let match;
  while ((match = pattern.exec(html))) {
    const raw = match[1].trim();
    const structured = /^(.*?):\s*<span[^>]*>([\s\S]*?)<\/span>\s*$/iu.exec(raw);
    const headingArabic = plainText(structured ? structured[1] : '');
    const bodyArabic = plainText(structured ? structured[2] : raw);
    if (!bodyArabic) continue;
    passages.push({
      sequence: passages.length + 1,
      headingArabic,
      bodyArabic,
      normalizedHeading: normalizeArabic(headingArabic),
    });
  }
  return passages;
}

function resolveVerseKey(key, chapterByName) {
  const match = /^(.*) (\d+)$/.exec(key);
  if (!match) return undefined;
  const chapterId = chapterByName.get(match[1]);
  const ayah = Number(match[2]);
  if (!chapterId || !Number.isInteger(ayah) || ayah < 1) return undefined;
  return `${chapterId}:${ayah}`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(analyses, logicalChecksum, sourceChecksum) {
  const lines = [
    'PRAGMA journal_mode=OFF;',
    'PRAGMA synchronous=OFF;',
    'PRAGMA locking_mode=EXCLUSIVE;',
    `PRAGMA application_id=${APPLICATION_ID};`,
    `PRAGMA user_version=${SCHEMA_VERSION};`,
    'BEGIN;',
    'CREATE TABLE compiler_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);',
    'CREATE TABLE source_metadata(source_id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT NOT NULL, url TEXT NOT NULL, checksum_sha256 TEXT NOT NULL);',
    'CREATE TABLE grammar_analysis(verse_key TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_version TEXT NOT NULL, review_status TEXT NOT NULL, passage_count INTEGER NOT NULL);',
    'CREATE TABLE grammar_passage(verse_key TEXT NOT NULL, sequence INTEGER NOT NULL, heading_ar TEXT NOT NULL, body_ar TEXT NOT NULL, normalized_heading TEXT NOT NULL, PRIMARY KEY(verse_key, sequence), FOREIGN KEY(verse_key) REFERENCES grammar_analysis(verse_key));',
    'CREATE INDEX grammar_passage_heading_idx ON grammar_passage(normalized_heading);',
    `INSERT INTO compiler_metadata VALUES('compiler_version',${sqlString(COMPILER_VERSION)});`,
    `INSERT INTO compiler_metadata VALUES('logical_checksum_sha256',${sqlString(logicalChecksum)});`,
    `INSERT INTO source_metadata VALUES(${sqlString(SOURCE_ID)},${sqlString("Quranic Arabic Corpus Arabic i'rab")},${sqlString(SOURCE_VERSION)},${sqlString('https://github.com/zeeyado/quran-ebook/releases')},${sqlString(sourceChecksum)});`,
  ];

  for (const analysis of analyses) {
    lines.push(
      `INSERT INTO grammar_analysis VALUES(${sqlString(analysis.verseKey)},${sqlString(SOURCE_ID)},${sqlString(SOURCE_VERSION)},'source-provided',${analysis.passages.length});`
    );
    for (const passage of analysis.passages) {
      lines.push(
        `INSERT INTO grammar_passage VALUES(${sqlString(analysis.verseKey)},${passage.sequence},${sqlString(passage.headingArabic)},${sqlString(passage.bodyArabic)},${sqlString(passage.normalizedHeading)});`
      );
    }
  }
  lines.push('COMMIT;', 'VACUUM;', 'PRAGMA query_only=ON;');
  return lines.join('\n');
}

function compileGrammarPack({ sourceZipPath, chaptersPath, outputDir, sqliteBinary = 'sqlite3' }) {
  const sourceChecksum = sha256File(sourceZipPath);
  const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
  const chapterByName = new Map(chapters.map((chapter) => [chapter.name_simple, chapter.id]));
  const rawEntries = parseStarDict(
    unzipMember(sourceZipPath, '.idx'),
    unzipMember(sourceZipPath, '.dict')
  );

  const analyses = rawEntries
    .map((entry) => ({
      verseKey: resolveVerseKey(entry.key, chapterByName),
      passages: parsePassages(entry.html),
    }))
    .filter((entry) => entry.verseKey && entry.passages.length)
    .sort((left, right) => {
      const a = left.verseKey.split(':').map(Number);
      const b = right.verseKey.split(':').map(Number);
      return a[0] - b[0] || a[1] - b[1];
    });

  const duplicate = analyses.find((entry, index) => index > 0 && entry.verseKey === analyses[index - 1].verseKey);
  if (duplicate) throw new Error(`Duplicate grammar verse: ${duplicate.verseKey}`);

  const logicalPayload = analyses.map(({ verseKey, passages }) => ({ verseKey, passages }));
  const logicalChecksum = sha256Buffer(stableStringify(logicalPayload));
  fs.mkdirSync(outputDir, { recursive: true });
  const databaseFile = 'quran-word-grammar.db';
  const databasePath = path.join(outputDir, databaseFile);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-grammar-compiler-'));
  const sqlPath = path.join(tempDir, 'pack.sql');
  fs.writeFileSync(sqlPath, buildSql(analyses, logicalChecksum, sourceChecksum));
  if (fs.existsSync(databasePath)) fs.unlinkSync(databasePath);
  const sqlite = spawnSync(sqliteBinary, [databasePath], {
    input: fs.readFileSync(sqlPath),
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (sqlite.status !== 0) throw new Error(sqlite.stderr?.toString() || 'SQLite grammar pack compilation failed');

  const manifest = {
    format: FORMAT,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    databaseFile,
    databaseSizeBytes: fs.statSync(databasePath).size,
    databaseChecksumSha256: sha256File(databasePath),
    logicalChecksumSha256: logicalChecksum,
    verseCount: analyses.length,
    passageCount: analyses.reduce((sum, item) => sum + item.passages.length, 0),
    source: {
      sourceId: SOURCE_ID,
      title: "Quranic Arabic Corpus Arabic i'rab",
      version: SOURCE_VERSION,
      url: 'https://github.com/zeeyado/quran-ebook/releases',
      checksumSha256: sourceChecksum,
    },
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { databasePath, manifest };
}

module.exports = {
  APPLICATION_ID,
  COMPILER_VERSION,
  FORMAT,
  SCHEMA_VERSION,
  compileGrammarPack,
  normalizeArabic,
  parsePassages,
  parseStarDict,
};
