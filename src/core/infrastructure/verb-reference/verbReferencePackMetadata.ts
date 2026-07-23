import manifestJson from '../../../../dist/verb-reference-packs/quran-verbs-v1/manifest.json';

import {
  assertCompatibleVerbReferenceManifest,
  type VerbReferencePackManifest,
} from './VerbReferencePack.types';

export const VERB_REFERENCE_PACK_METADATA = {
  packId: 'quran-verbs',
  version: manifestJson.source.version,
  manifest: assertCompatibleVerbReferenceManifest(manifestJson as VerbReferencePackManifest),
} as const;
