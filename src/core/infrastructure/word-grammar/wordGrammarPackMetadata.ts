import manifestJson from '../../../../dist/word-grammar-packs/qac-irab-v1.4/manifest.json';

import {
  assertCompatibleWordGrammarManifest,
  type WordGrammarPackManifest,
} from './WordGrammarPack.types';

export const WORD_GRAMMAR_PACK_METADATA = {
  packId: 'qac-irab',
  version: '1.4',
  manifest: assertCompatibleWordGrammarManifest(manifestJson as WordGrammarPackManifest),
} as const;
