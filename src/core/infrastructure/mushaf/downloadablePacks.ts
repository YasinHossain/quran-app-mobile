import type { MushafPackId, MushafQcfVersion, MushafRenderer, MushafScript } from '@/types';

export type DownloadableMushafPackSupport = 'installable' | 'coming-soon';

export interface DownloadableMushafPackDefinition {
  packId: MushafPackId;
  version: string;
  renderer: MushafRenderer;
  script: MushafScript;
  lines: number;
  totalPages: number;
  support: DownloadableMushafPackSupport;
  sourceLabel: string;
  qcfVersion?: MushafQcfVersion | undefined;
  pageDataApiBaseUrl?: string | undefined;
  pageFontBaseUrl?: string | undefined;
}

export const QCF_MADANI_V1_PACK: DownloadableMushafPackDefinition = {
  packId: 'qcf-madani-v1',
  version: 'v1',
  renderer: 'webview',
  script: 'uthmani',
  lines: 15,
  totalPages: 604,
  support: 'installable',
  sourceLabel: 'Quran.com official page-data API and Quran Foundation font CDN',
  qcfVersion: 'v1',
  pageDataApiBaseUrl: 'https://api.quran.com/api/v4/verses/by_page',
  pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2',
};

export const DOWNLOADABLE_MUSHAF_PACKS: Record<
  MushafPackId,
  DownloadableMushafPackDefinition | undefined
> = {
  'unicode-uthmani-v1': undefined,
  'qcf-madani-v1': QCF_MADANI_V1_PACK,
  'qcf-madani-v2': {
    packId: 'qcf-madani-v2',
    version: 'v2',
    renderer: 'webview',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    support: 'coming-soon',
    sourceLabel: 'Reserved for a later exact-pack chunk.',
    qcfVersion: 'v2',
  },
  'qpc-uthmani-hafs': {
    packId: 'qpc-uthmani-hafs',
    version: 'v1',
    renderer: 'text',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    support: 'coming-soon',
    sourceLabel: 'Reserved for a later text-pack chunk.',
  },
  'unicode-indopak-15': {
    packId: 'unicode-indopak-15',
    version: 'v1',
    renderer: 'text',
    script: 'indopak',
    lines: 15,
    totalPages: 604,
    support: 'coming-soon',
    sourceLabel: 'Reserved for a later text-pack chunk.',
  },
  'unicode-indopak-16': {
    packId: 'unicode-indopak-16',
    version: 'v1',
    renderer: 'text',
    script: 'indopak',
    lines: 16,
    totalPages: 604,
    support: 'coming-soon',
    sourceLabel: 'Reserved for a later text-pack chunk.',
  },
  'qcf-tajweed-v4': {
    packId: 'qcf-tajweed-v4',
    version: 'v4',
    renderer: 'webview',
    script: 'tajweed',
    lines: 15,
    totalPages: 604,
    support: 'coming-soon',
    sourceLabel: 'Reserved for a later exact-pack chunk.',
    qcfVersion: 'v4',
  },
};

export function getDownloadableMushafPackDefinition(
  packId: MushafPackId
): DownloadableMushafPackDefinition | null {
  return DOWNLOADABLE_MUSHAF_PACKS[packId] ?? null;
}

export function getExactPackQcfVersion(packId: MushafPackId): MushafQcfVersion | null {
  return getDownloadableMushafPackDefinition(packId)?.qcfVersion ?? null;
}

export function getExactPackPageFontRelativePath(
  packId: MushafPackId,
  pageNumber: number
): string | null {
  const definition = getDownloadableMushafPackDefinition(packId);
  if (!definition?.qcfVersion || !Number.isFinite(pageNumber) || pageNumber < 1) {
    return null;
  }

  return `fonts/p${Math.trunc(pageNumber)}.woff2`;
}

export function getExactPackPageFontFamily(
  pageNumber: number,
  qcfVersion: MushafQcfVersion
): string {
  return `p${Math.trunc(pageNumber)}-${qcfVersion}`;
}
