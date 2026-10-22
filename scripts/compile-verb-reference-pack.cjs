#!/usr/bin/env node

const fs = require('fs');
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
const metadata = args.metadata ?? process.env.VERB_REFERENCE_SOURCE_METADATA;
if (!metadata) {
  throw new Error('Set VERB_REFERENCE_SOURCE_METADATA or pass --metadata=/path/to/source-metadata.json');
}

const result = compileVerbReferencePack({
  sourcePath: path.resolve(source),
  source: JSON.parse(fs.readFileSync(path.resolve(metadata), 'utf8')),
  outputDirectory: path.resolve(
    args.output ?? 'dist/verb-reference-packs/quran-verbs-v1'
  ),
  sqlitePath: args.sqlite ?? process.env.WORD_STUDY_SQLITE3 ?? 'sqlite3',
  sourceVersion: args.version ?? '1',
});

console.log(`Compiled ${result.rowCount} verb references to ${result.databasePath}`);

// Paths are relative to dist/verb-reference-packs/catalog.json, which the app reads.
const packDirectory = path.basename(path.dirname(result.databasePath));
const catalogEntry = {
  packId: 'quran-verbs',
  version: result.manifest.source.version,
  sourceId: result.manifest.source.sourceId,
  title: 'Verb Principal Parts',
  manifestUrl: `${packDirectory}/manifest.json`,
  databaseUrl: `${packDirectory}/${result.manifest.databaseFile}`,
  databaseSizeBytes: result.manifest.databaseSizeBytes,
  databaseChecksumSha256: result.manifest.databaseChecksumSha256,
  schemaVersion: result.manifest.schemaVersion,
};
console.log('\nCatalog entry to publish in dist/verb-reference-packs/catalog.json:');
console.log(JSON.stringify(catalogEntry, null, 2));
