import curatedPoolJson from '../../assets/verse-spotlight/curated-anchor-pool.json';

import { isValidVerseKey } from './canonicalIndex';
import type { VerseKey } from './contracts';

type CuratedPoolAsset = {
  schemaVersion: number;
  poolVersion: string;
  verseCount: number;
  verseKeys: string[];
};

const asset = curatedPoolJson as CuratedPoolAsset;

function validatePool(): readonly VerseKey[] {
  if (
    asset.schemaVersion !== 1 ||
    !asset.poolVersion ||
    asset.verseCount !== asset.verseKeys.length ||
    asset.verseKeys.length < 2
  ) {
    throw new Error('Verse Spotlight anchor-pool metadata is invalid.');
  }

  const seen = new Set<string>();
  return Object.freeze(
    asset.verseKeys.map((verseKey) => {
      if (!isValidVerseKey(verseKey) || seen.has(verseKey)) {
        throw new Error(`Verse Spotlight anchor pool contains an invalid key: ${verseKey}`);
      }
      seen.add(verseKey);
      return verseKey;
    })
  );
}

export const VERSE_SPOTLIGHT_POOL_VERSION = asset.poolVersion;
export const CURATED_ANCHOR_KEYS: readonly VerseKey[] = validatePool();
