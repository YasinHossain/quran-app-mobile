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
  apiMushafId: number;
  qcfVersion?: MushafQcfVersion | undefined;
  pageDataApiBaseUrl?: string | undefined;
  pageFontBaseUrl?: string | undefined;
  pageFontExtension?: 'woff2' | 'woff' | 'ttf' | undefined;
}

// Page data comes from Quran.com's own page endpoint, which honours `mushaf` for page and line
// numbers. The public v4 endpoint mixed V1 page breaks with V2 line breaks.
const QURAN_COM_PAGE_DATA_API_BASE_URL = 'https://api.qurancdn.com/api/qdc/verses/by_page';

export const QCF_MADANI_V1_PACK: DownloadableMushafPackDefinition = {
  packId: 'qcf-madani-v1',
  version: 'v1-r2',
  renderer: 'webview',
  script: 'uthmani',
  lines: 15,
  totalPages: 604,
  support: 'installable',
  sourceLabel: 'Quran.com official page-data API and Quran Foundation font CDN',
  apiMushafId: 2,
  qcfVersion: 'v1',
  pageDataApiBaseUrl: QURAN_COM_PAGE_DATA_API_BASE_URL,
  pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2',
};

export const DOWNLOADABLE_MUSHAF_PACKS: Record<
  MushafPackId,
  DownloadableMushafPackDefinition | undefined
> = {
  'qcf-madani-v1': QCF_MADANI_V1_PACK,
  'qcf-madani-v2': {
    packId: 'qcf-madani-v2',
    version: 'v2-r2',
    renderer: 'webview',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    support: 'installable',
    sourceLabel: 'Quran.com official page-data API and Quran Foundation font CDN',
    apiMushafId: 1,
    qcfVersion: 'v2',
    pageDataApiBaseUrl: QURAN_COM_PAGE_DATA_API_BASE_URL,
    pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v2/woff2',
  },
  'qpc-uthmani-hafs': {
    packId: 'qpc-uthmani-hafs',
    version: 'v1-r2',
    renderer: 'webview',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    support: 'installable',
    sourceLabel: 'Quran.com official page-data API',
    apiMushafId: 5,
    pageDataApiBaseUrl: QURAN_COM_PAGE_DATA_API_BASE_URL,
  },
  'unicode-indopak-15': {
    packId: 'unicode-indopak-15',
    version: 'v2',
    renderer: 'webview',
    script: 'indopak',
    lines: 15,
    totalPages: 610,
    support: 'installable',
    sourceLabel: 'Quran.com official page-data API',
    apiMushafId: 6,
    pageDataApiBaseUrl: QURAN_COM_PAGE_DATA_API_BASE_URL,
  },
  'unicode-indopak-16': {
    packId: 'unicode-indopak-16',
    version: 'v2',
    renderer: 'webview',
    script: 'indopak',
    lines: 16,
    totalPages: 548,
    support: 'installable',
    sourceLabel: 'Quran.com official page-data API',
    apiMushafId: 7,
    pageDataApiBaseUrl: QURAN_COM_PAGE_DATA_API_BASE_URL,
  },
  'qcf-tajweed-v4': {
    packId: 'qcf-tajweed-v4',
    version: 'v4-ttf-r2',
    renderer: 'webview',
    script: 'tajweed',
    lines: 15,
    totalPages: 604,
    support: 'installable',
    sourceLabel: 'Quran.com official page-data API and Quran Foundation COLRv1 font CDN',
    apiMushafId: 19,
    qcfVersion: 'v4',
    pageDataApiBaseUrl: QURAN_COM_PAGE_DATA_API_BASE_URL,
    pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/ttf',
    pageFontExtension: 'ttf',
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

  return `fonts/p${Math.trunc(pageNumber)}.${definition.pageFontExtension ?? 'woff2'}`;
}

export function getExactPackPageFontFileName(packId: MushafPackId, pageNumber: number): string | null {
  const definition = getDownloadableMushafPackDefinition(packId);
  if (!definition?.qcfVersion || !Number.isFinite(pageNumber) || pageNumber < 1) {
    return null;
  }

  return `p${Math.trunc(pageNumber)}.${definition.pageFontExtension ?? 'woff2'}`;
}

export function getExactPackPageFontFamily(
  pageNumber: number,
  qcfVersion: MushafQcfVersion
): string {
  return `p${Math.trunc(pageNumber)}-${qcfVersion}`;
}

export function getSharedPackFontRelativePath(packId: MushafPackId): string | null {
  switch (packId) {
    case 'qpc-uthmani-hafs':
      return 'fonts/UthmanicHafs1Ver18.ttf';
    case 'unicode-indopak-15':
    case 'unicode-indopak-16':
      return 'fonts/indopak-nastaleeq-waqf-lazim-v4.2.1.ttf';
    default:
      return null;
  }
}

export function getSharedPackFontFamily(packId: MushafPackId): string | null {
  switch (packId) {
    case 'qpc-uthmani-hafs':
      return 'UthmanicHafs1Ver18';
    case 'unicode-indopak-15':
    case 'unicode-indopak-16':
      return 'IndoPak';
    default:
      return null;
  }
}
