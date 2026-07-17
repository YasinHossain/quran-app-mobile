import manifestJson from '../../../../dist/word-grammar-packs/qac-irab-v1.4/manifest.json';

import {
  assertCompatibleWordGrammarManifest,
  type WordGrammarPackManifest,
} from './WordGrammarPack.types';

const databaseAssetModule = require(
  '../../../../dist/word-grammar-packs/qac-irab-v1.4/quran-word-grammar.db'
) as number;

export const BUNDLED_WORD_GRAMMAR_PACK = {
  packId: 'qac-irab',
  version: '1.4',
  databaseAssetModule,
  manifest: assertCompatibleWordGrammarManifest(manifestJson as WordGrammarPackManifest),
} as const;
