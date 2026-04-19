import type { MushafOption, MushafPackId } from '@/types';

export const DEFAULT_MUSHAF_ID: MushafPackId = 'unicode-uthmani-v1';
export const TAJWEED_MUSHAF_ID: MushafPackId = 'qcf-tajweed-v4';

export const MUSHAF_OPTIONS: MushafOption[] = [
  {
    id: 'unicode-uthmani-v1',
    packId: 'unicode-uthmani-v1',
    version: 'v1',
    channel: 'bundled',
    renderer: 'text',
    name: 'Uthmani Unicode',
    description: 'Bundled offline-safe base mushaf pack for the page reader.',
    script: 'uthmani',
    lines: 15,
    isBundledDefault: true,
    requiresDownload: false,
  },
  {
    id: 'qcf-madani-v1',
    packId: 'qcf-madani-v1',
    version: 'v1',
    channel: 'download',
    renderer: 'webview',
    name: 'King Fahad Complex V1',
    description: 'Exact downloadable mushaf pack with per-page QCF glyph layout.',
    script: 'uthmani',
    lines: 15,
    requiresDownload: true,
  },
  {
    id: 'qcf-madani-v2',
    packId: 'qcf-madani-v2',
    version: 'v2',
    channel: 'download',
    renderer: 'webview',
    name: 'King Fahad Complex V2',
    description: 'High-fidelity Uthmani glyph mushaf V2 (per-page QCF fonts).',
    script: 'uthmani',
    lines: 15,
    requiresDownload: true,
  },
  {
    id: 'qpc-uthmani-hafs',
    packId: 'qpc-uthmani-hafs',
    version: 'v1',
    channel: 'download',
    renderer: 'text',
    name: 'QPC Uthmani Hafs',
    description: 'High-fidelity Uthmani Hafs font (text-based).',
    script: 'uthmani',
    lines: 15,
    requiresDownload: true,
  },
  {
    id: 'unicode-indopak-15',
    packId: 'unicode-indopak-15',
    version: 'v1',
    channel: 'download',
    renderer: 'text',
    name: 'IndoPak (15-line)',
    description: 'IndoPak Nastaleeq layout with 15 lines per page.',
    script: 'indopak',
    lines: 15,
    requiresDownload: true,
  },
  {
    id: 'unicode-indopak-16',
    packId: 'unicode-indopak-16',
    version: 'v1',
    channel: 'download',
    renderer: 'text',
    name: 'IndoPak (16-line)',
    description: 'Standard IndoPak Nastaleeq layout (16 lines per page).',
    script: 'indopak',
    lines: 16,
    requiresDownload: true,
  },
  {
    id: 'qcf-tajweed-v4',
    packId: 'qcf-tajweed-v4',
    version: 'v4',
    channel: 'download',
    renderer: 'webview',
    name: 'Tajweed Colors',
    description: 'King Fahad Complex V4 with Tajweed color-coded glyphs.',
    script: 'tajweed',
    lines: 15,
    requiresDownload: true,
  },
];

export const getDefaultMushafOption = (): MushafOption => MUSHAF_OPTIONS[0]!;

export const findMushafOption = (id?: string): MushafOption | undefined =>
  id ? MUSHAF_OPTIONS.find((option) => option.id === id) : undefined;

export const isMushafPackId = (value: string): value is MushafPackId =>
  MUSHAF_OPTIONS.some((option) => option.id === value);
