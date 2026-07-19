#!/usr/bin/env node

const path = require('path');
const { compileVerbReferencePack } = require('./verb-reference-pack/compiler.cjs');

function options(argv) {
  return Object.fromEntries(
    argv.slice(2).map((argument) => {
      const match = /^--([^=]+)=(.*)$/.exec(argument);
      if (!match) throw new Error(`Expected --name=value, received ${argument}`);
      return [match[1], match[2]];
    })
  );
}

const args = options(process.argv);
const source = args.source ?? process.env.VERB_REFERENCE_SOURCE;
if (!source) {
  throw new Error('Set VERB_REFERENCE_SOURCE or pass --source=/path/to/source.db');
}

const result = compileVerbReferencePack({
  sourcePath: path.resolve(source),
  outputDirectory: path.resolve(
    args.output ?? 'dist/verb-reference-packs/quran-verbs-v1'
  ),
  sqlitePath: args.sqlite ?? process.env.WORD_STUDY_SQLITE3 ?? 'sqlite3',
  sourceVersion: args.version ?? '1',
});

console.log(`Compiled ${result.rowCount} verb references to ${result.databasePath}`);
