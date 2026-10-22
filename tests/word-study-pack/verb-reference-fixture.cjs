const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { compileVerbReferencePack } = require('../../scripts/verb-reference-pack/compiler.cjs');

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE_ROOT = path.join(ROOT, '.artifacts/verb-reference-fixture');

const FIXTURE_SOURCE = Object.freeze({
  sourceId: 'fixture-verb-reference',
  title: 'Fixture verb principal parts',
  license: 'Test fixture',
  attribution: 'Hand-written principal parts for compiler and repository tests.',
  url: 'https://example.org/verb-reference-fixture',
});

// Root, Type, Past, Present, Order, Subject, Object, Masdar — the compiler's source columns.
const FIXTURE_ROWS = [
  ['نزل', 'b1', 'نَزَلَ', 'يَنْزِلُ', 'اِنْزِلْ', 'نَازِل', 'مَنْزُول', 'نُزُول'],
  ['نزل', 'd2', 'نَزَّلَ', 'يُنَزِّلُ', 'نَزِّلْ', 'مُنَزِّل', 'مُنَزَّل', 'تَنْزِيل'],
  ['نزل', 'd4', 'أَنْزَلَ', 'يُنْزِلُ', 'أَنْزِلْ', 'مُنْزِل', 'مُنْزَل', 'إِنْزَال'],
  ['نزل', 'd4', 'أَنْزَلَ', 'يُنْزِلُ', 'أَنْزِلْ', 'مُنْزِل', 'مُنْزَل', 'إِنْزَال'],
  ['حلل', 'b1', 'حَلَّ', 'يَحِلُّ', 'حِلَّ', 'حَالّ', 'مَحْلُول', 'حُلُول'],
  ['حلل', 'b2', 'حَلَّ', 'يَحُلُّ', 'حُلَّ', 'حَالّ', 'مَحْلُول', 'حَلّ'],
];

let compiled = null;

/** Compiles a small, deterministic verb-reference pack once per test process. */
function compileVerbReferenceFixture() {
  if (compiled) return compiled;
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  const sourcePath = path.join(FIXTURE_ROOT, 'source.db');
  const source = new DatabaseSync(sourcePath);
  source.exec(
    'CREATE TABLE verbs (Root TEXT, Type TEXT, Past TEXT, Present TEXT, "Order" TEXT, Subject TEXT, Object TEXT, Masdar TEXT);'
  );
  const insert = source.prepare('INSERT INTO verbs VALUES (?, ?, ?, ?, ?, ?, ?, ?);');
  for (const row of FIXTURE_ROWS) insert.run(...row);
  source.close();
  compiled = compileVerbReferencePack({
    sourcePath,
    source: FIXTURE_SOURCE,
    outputDirectory: path.join(FIXTURE_ROOT, 'pack'),
    sqlitePath: process.env.WORD_STUDY_SQLITE3 ?? 'sqlite3',
    sourceVersion: '1',
  });
  return compiled;
}

module.exports = { FIXTURE_ROWS, FIXTURE_SOURCE, compileVerbReferenceFixture };
