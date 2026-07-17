#!/usr/bin/env node
const path = require('path');
const { compileGrammarPack } = require('./word-grammar-pack/compiler.cjs');

const rootDir = path.resolve(__dirname, '..');
const defaults = {
  sourceZipPath: process.env.WORD_GRAMMAR_SOURCE || path.join(rootDir, '.artifacts', 'word-grammar', 'quran_irab_v1.4.zip'),
  chaptersPath: path.join(rootDir, 'src', 'data', 'chapters.en.json'),
  outputDir: path.join(rootDir, 'dist', 'word-grammar-packs', 'qac-irab-v1.4'),
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`Arguments must use --name=value syntax: ${arg}`);
    const [, name, value] = match;
    if (name === 'source') options.sourceZipPath = path.resolve(value);
    else if (name === 'chapters') options.chaptersPath = path.resolve(value);
    else if (name === 'output') options.outputDir = path.resolve(value);
    else if (name === 'sqlite') options.sqliteBinary = path.resolve(value);
    else throw new Error(`Unknown argument: --${name}`);
  }
  return options;
}

try {
  const result = compileGrammarPack(parseArgs(process.argv.slice(2)));
  process.stdout.write(`Word grammar pack generated at ${result.databasePath}\n`);
  process.stdout.write(`Verses: ${result.manifest.verseCount}; passages: ${result.manifest.passageCount}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
