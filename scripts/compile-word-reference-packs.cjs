#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { compileDictionaryPack } = require('./word-reference-pack/compiler.cjs');

const rootDir = path.resolve(__dirname, '..');
const coreDatabasePath = process.env.WORD_REFERENCE_CORE || path.join(rootDir, 'dist', 'word-study-packs', 'qac-v0.4', 'quran-word-study.db');
const outputRoot = process.env.WORD_REFERENCE_OUTPUT || path.join(rootDir, 'dist', 'word-reference-packs');

const definitions = [
  {
    sourceDatabasePath: process.env.LANE_LEXICON_SOURCE || path.join(rootDir, '.artifacts', 'word-reference', 'lanelexicon-v3.1.3.sqlite'),
    outputDir: path.join(outputRoot, 'lane-en', '3.1.3'),
    definitionFormat: 'sanitized-html',
    source: {
      packId: 'lane-en',
      sourceId: 'lane-lexicon',
      title: "Lane's Arabic-English Lexicon",
      languageCode: 'en',
      version: '3.1.3',
      attribution: 'E. W. Lane; digital database published by GibreelAbdullah/LaneLexicon.',
      url: 'https://github.com/GibreelAbdullah/LaneLexicon',
    },
  },
  {
    sourceDatabasePath: process.env.HANS_WEHR_SOURCE || path.join(rootDir, '.artifacts', 'word-reference', 'hanswehr-v2.14.01.sqlite'),
    outputDir: path.join(outputRoot, 'hans-wehr-en', '2.14.01'),
    definitionFormat: 'plain-text',
    source: {
      packId: 'hans-wehr-en',
      sourceId: 'hans-wehr',
      title: 'Hans Wehr Dictionary of Modern Written Arabic',
      languageCode: 'en',
      version: '2.14.01',
      attribution: 'Hans Wehr, edited by J. Milton Cowan; digital database published by GibreelAbdullah/HansWehrDictionary.',
      url: 'https://github.com/GibreelAbdullah/HansWehrDictionary',
    },
  },
];

try {
  const results = definitions.map((definition) => compileDictionaryPack({
    ...definition,
    coreDatabasePath,
  }));
  const catalog = {
    format: 'quran-word-reference-catalog-v1',
    packs: results.map(({ manifest }) => ({
      packId: manifest.source.packId,
      kind: 'dictionary',
      sourceId: manifest.source.sourceId,
      title: manifest.source.title,
      languageCode: manifest.source.languageCode,
      version: manifest.source.version,
      manifestUrl: `${manifest.source.packId}/${manifest.source.version}/manifest.json`,
      databaseUrl: `${manifest.source.packId}/${manifest.source.version}/${manifest.databaseFile}`,
      databaseSizeBytes: manifest.databaseSizeBytes,
      databaseChecksumSha256: manifest.databaseChecksumSha256,
      schemaVersion: manifest.schemaVersion,
    })),
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  for (const result of results) {
    process.stdout.write(`${result.manifest.source.packId}: ${result.manifest.entryCount} entries, ${result.manifest.matchedRootCount} roots, ${result.manifest.matchedLemmaCount} lemmas\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
