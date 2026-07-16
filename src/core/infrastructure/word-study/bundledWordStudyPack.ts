import manifestJson from '../../../../dist/word-study-packs/qac-v0.4/manifest.json';

import type { WordStudyPackManifest } from './WordStudyPack.types';
import { assertCompatibleWordStudyManifest } from './WordStudyPack.types';

const databaseAssetModule = require('../../../../dist/word-study-packs/qac-v0.4/quran-word-study.db') as number;

export const BUNDLED_WORD_STUDY_PACK = {
  packId: 'core-qac-v0.4',
  version: 'qac-v0.4',
  manifest: assertCompatibleWordStudyManifest(manifestJson as WordStudyPackManifest),
  databaseAssetModule,
} as const;
