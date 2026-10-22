#!/usr/bin/env node
const path = require('path');
const { compilePack, EXPECTED_AYAH_COUNT, EXPECTED_WORD_COUNT } = require('./word-study-pack/compiler.cjs');

const rootDir = path.resolve(__dirname, '..');
const defaults = {
  morphologyPath: process.env.WORD_STUDY_MORPHOLOGY_SOURCE || path.join(rootDir, '.artifacts', 'word-study', 'quranic-corpus-morphology-0.4.txt'),
  canonicalPath: path.join(rootDir, 'dist', 'word-translation-packs', 'languages', 'en', '2026-07-04', 'payload.json'),
  sourceConfigPath: path.join(__dirname, 'word-study-pack', 'qac-v0.4.sources.json'),
  outputDir: path.join(rootDir, 'dist', 'word-study-packs', 'qac-v0.4'),
  expectedAyahs: EXPECTED_AYAH_COUNT,
  expectedWords: EXPECTED_WORD_COUNT,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`Arguments must use --name=value syntax: ${arg}`);
    const [, name, value] = match;
    if (name === 'morphology') options.morphologyPath = path.resolve(value);
    else if (name === 'canonical') options.canonicalPath = path.resolve(value);
    else if (name === 'sources') options.sourceConfigPath = path.resolve(value);
    else if (name === 'output') options.outputDir = path.resolve(value);
    else if (name === 'sqlite') options.sqliteBinary = path.resolve(value);
    else throw new Error(`Unknown argument: --${name}`);
  }
  return options;
}

try {
  const result = compilePack(parseArgs(process.argv.slice(2)));
  process.stdout.write(`Word study pack generated at ${result.databasePath}\n`);
  process.stdout.write(`Words: ${result.report.countChecks.alignedWords.actual}; logical SHA-256: ${result.report.logicalChecksum}\n`);
  process.stdout.write(`Database SHA-256: ${result.manifest.databaseChecksumSha256}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
