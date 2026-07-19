import manifestJson from '../../../../dist/verb-reference-packs/quran-verbs-v1/manifest.json';

import {
  assertCompatibleVerbReferenceManifest,
  type VerbReferencePackManifest,
} from './VerbReferencePack.types';

const databaseAssetModule = require(
  '../../../../dist/verb-reference-packs/quran-verbs-v1/quran-verb-reference.db'
) as number;

export const BUNDLED_VERB_REFERENCE_PACK = {
  packId: 'quran-verbs',
  version: manifestJson.source.version,
  databaseAssetModule,
  manifest: assertCompatibleVerbReferenceManifest(manifestJson as VerbReferencePackManifest),
} as const;
