export type MushafPackId =
  | 'unicode-uthmani-v1'
  | 'qcf-madani-v1'
  | 'qcf-madani-v2'
  | 'qpc-uthmani-hafs'
  | 'unicode-indopak-15'
  | 'unicode-indopak-16'
  | 'qcf-tajweed-v4';

export type MushafScript = 'uthmani' | 'indopak' | 'tajweed';
export type MushafPackChannel = 'bundled' | 'download';
export type MushafRenderer = 'text' | 'webview';
export type MushafQcfVersion = 'v1' | 'v2' | 'v4';
export type MushafScaleStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type MushafCharType = 'word' | 'end' | 'pause' | 'sajdah' | 'rub' | 'symbol' | string;

export const MUSHAF_SCALE_MIN = 1 as const;
export const MUSHAF_SCALE_MAX = 10 as const;
export const DEFAULT_MUSHAF_SCALE_STEP: MushafScaleStep = 6;

const MUSHAF_FONT_MIN_PX = 20;
const MUSHAF_FONT_MAX_PX = 44;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function clampMushafScaleStep(value: number): MushafScaleStep {
  return clamp(Math.round(value), MUSHAF_SCALE_MIN, MUSHAF_SCALE_MAX) as MushafScaleStep;
}

export function mushafScaleStepToFontSize(scaleStep: number): number {
  const clampedScale = clampMushafScaleStep(scaleStep);
  const t = (clampedScale - MUSHAF_SCALE_MIN) / (MUSHAF_SCALE_MAX - MUSHAF_SCALE_MIN);
  const size = MUSHAF_FONT_MIN_PX + t * (MUSHAF_FONT_MAX_PX - MUSHAF_FONT_MIN_PX);
  return Math.round(size);
}

export function fontSizeToMushafScaleStep(fontSize: number): MushafScaleStep {
  const clampedSize = clamp(fontSize, MUSHAF_FONT_MIN_PX, MUSHAF_FONT_MAX_PX);
  const t = (clampedSize - MUSHAF_FONT_MIN_PX) / (MUSHAF_FONT_MAX_PX - MUSHAF_FONT_MIN_PX);
  const scale = MUSHAF_SCALE_MIN + t * (MUSHAF_SCALE_MAX - MUSHAF_SCALE_MIN);
  return clampMushafScaleStep(scale);
}

export interface MushafWord {
  id?: number | undefined;
  verseKey?: string | undefined;
  pageNumber?: number | undefined;
  lineNumber?: number | undefined;
  position: number;
  charType?: MushafCharType | undefined;
  location?: string | undefined;
  textUthmani?: string | undefined;
  textQpcHafs?: string | undefined;
  textIndopak?: string | undefined;
  codeV1?: string | undefined;
  codeV2?: string | undefined;
}

export interface MushafVerse {
  id: number;
  verseKey: string;
  chapterId?: number | string | undefined;
  pageNumber: number;
  juzNumber?: number | undefined;
  hizbNumber?: number | undefined;
  rubElHizbNumber?: number | undefined;
  textUthmani?: string | undefined;
  textIndopak?: string | undefined;
  textUthmaniTajweed?: string | undefined;
  words: MushafWord[];
}

export interface MushafLineGroup {
  lineNumber: number;
  key: string;
  words: MushafWord[];
}

export interface MushafPageLines {
  pageNumber: number;
  lines: MushafLineGroup[];
}

export interface MushafPageLookupRecord {
  from: string;
  to: string;
  firstVerseKey: string;
  lastVerseKey: string;
}

export type MushafLocalPayloadFormat = 'page-json-v1';

export type MushafPackChecksum = string;

export interface MushafPackRemoteFile {
  file: string;
  url?: string | undefined;
  checksum?: MushafPackChecksum | undefined;
  sizeBytes?: number | undefined;
}

export interface MushafPackPageAddressableLocalPayload {
  format: MushafLocalPayloadFormat;
  lookupFile: string;
  pagesDirectory: string;
}

export interface HostedMushafPackCatalogEntry {
  packId: MushafPackId;
  version: string;
  renderer: MushafRenderer;
  script: MushafScript;
  lines: number;
  downloadUrl: string;
  checksum: MushafPackChecksum;
  sizeBytes: number;
  totalPages?: number | undefined;
  manifestUrl?: string | undefined;
  manifestChecksum?: MushafPackChecksum | undefined;
  manifestSizeBytes?: number | undefined;
  files?: MushafPackRemoteFile[] | undefined;
  minAppVersion?: string | undefined;
  maxAppVersion?: string | undefined;
  compatibility?: Record<string, string | number | boolean | null> | undefined;
}

export interface HostedMushafPackCatalog {
  generatedAt?: string | undefined;
  packs: HostedMushafPackCatalogEntry[];
}

export interface MushafPackManifest {
  packId: MushafPackId;
  version: string;
  channel: MushafPackChannel;
  renderer: MushafRenderer;
  script: MushafScript;
  lines: number;
  totalPages: number;
  bundled: boolean;
  payloadFile: string;
  payloadChecksum?: MushafPackChecksum | undefined;
  payloadSizeBytes?: number | undefined;
  localPayload?: MushafPackPageAddressableLocalPayload | undefined;
  assetFiles?: MushafPackRemoteFile[] | undefined;
  generatedAt: string;
  source: string;
}

export interface MushafPackPayload {
  packId: MushafPackId;
  version: string;
  totalPages: number;
  lookup: Record<string, MushafPageLookupRecord>;
  pages: Record<string, MushafVerse[]>;
}

export interface MushafPackPageLookupPayload {
  packId: MushafPackId;
  version: string;
  totalPages: number;
  lookup: Record<string, MushafPageLookupRecord>;
}

export interface MushafPackPagePayload {
  packId: MushafPackId;
  version: string;
  pageNumber: number;
  verses: MushafVerse[];
}

export interface MushafResolvedPackVersion {
  packId: MushafPackId;
  version: string;
  channel: MushafPackChannel;
  renderer: MushafRenderer;
  script: MushafScript;
  lines: number;
  totalPages: number;
  isBundled: boolean;
}

export interface MushafPageRendererAssets {
  packDirectoryUri?: string | undefined;
  pageFontFileUri?: string | undefined;
  pageFontFamily?: string | undefined;
  qcfVersion?: MushafQcfVersion | undefined;
}

export interface MushafPageData {
  pack: MushafResolvedPackVersion;
  pageNumber: number;
  lookup: MushafPageLookupRecord;
  verses: MushafVerse[];
  pageLines: MushafPageLines;
  rendererAssets?: MushafPageRendererAssets | undefined;
}

export interface MushafOption {
  id: MushafPackId;
  packId: MushafPackId;
  version: string;
  channel: MushafPackChannel;
  renderer: MushafRenderer;
  name: string;
  description: string;
  script: MushafScript;
  lines: number;
  isBundledDefault?: boolean;
  requiresDownload?: boolean;
}
