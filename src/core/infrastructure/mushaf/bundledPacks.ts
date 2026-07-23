import type { MushafPackId, MushafPackManifest, MushafPackPayload } from '@/types';

export type BundledMushafPack = {
  manifest: MushafPackManifest;
  payload: MushafPackPayload;
};

export const BUNDLED_MUSHAF_PACKS: Record<MushafPackId, BundledMushafPack | undefined> = {
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
