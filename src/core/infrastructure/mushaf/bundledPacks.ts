import manifestJson from '../../../data/mushaf/packs/unicode-uthmani-v1/manifest.json';
import payloadJson from '../../../data/mushaf/packs/unicode-uthmani-v1/payload.json';
import type { MushafPackId, MushafPackManifest, MushafPackPayload } from '@/types';

export type BundledMushafPack = {
  manifest: MushafPackManifest;
  payload: MushafPackPayload;
};

const unicodeUthmaniPack: BundledMushafPack = {
  manifest: manifestJson as MushafPackManifest,
  payload: payloadJson as MushafPackPayload,
};

export const BUNDLED_MUSHAF_PACKS: Record<MushafPackId, BundledMushafPack | undefined> = {
  'unicode-uthmani-v1': unicodeUthmaniPack,
  'qcf-madani-v1': undefined,
  'qcf-madani-v2': undefined,
  'qpc-uthmani-hafs': undefined,
  'unicode-indopak-15': undefined,
  'unicode-indopak-16': undefined,
  'qcf-tajweed-v4': undefined,
};

export function getBundledMushafPack(packId: MushafPackId): BundledMushafPack | null {
  return BUNDLED_MUSHAF_PACKS[packId] ?? null;
}

export function listBundledMushafPacks(): BundledMushafPack[] {
  return Object.values(BUNDLED_MUSHAF_PACKS).filter(
    (pack): pack is BundledMushafPack => pack !== undefined
  );
}
