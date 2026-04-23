export type TafsirPackChecksum = string;
export type TafsirPackPayloadFormat = 'tafsir-json-v1';

export interface HostedTafsirPackCatalogEntry {
  tafsirId: number;
  name: string;
  authorName: string;
  languageName: string;
  version: string;
  downloadUrl: string;
  checksum: TafsirPackChecksum;
  sizeBytes: number;
  totalVerses?: number | undefined;
  manifestUrl?: string | undefined;
  manifestChecksum?: string | undefined;
  manifestSizeBytes?: number | undefined;
  minAppVersion?: string | undefined;
  maxAppVersion?: string | undefined;
  compatibility?: Record<string, string | number | boolean | null> | undefined;
}

export interface HostedTafsirPackCatalog {
  generatedAt?: string | undefined;
  packs: HostedTafsirPackCatalogEntry[];
}

export interface TafsirPackManifest {
  tafsirId: number;
  name: string;
  authorName: string;
  languageName: string;
  version: string;
  bundled: boolean;
  format: TafsirPackPayloadFormat;
  payloadFile: string;
  payloadChecksum?: TafsirPackChecksum | undefined;
  payloadSizeBytes?: number | undefined;
  totalVerses: number;
  generatedAt: string;
  source: string;
}

export interface TafsirPackPayloadVerse {
  verseKey: string;
  html: string;
}

export interface TafsirPackPayload {
  tafsirId: number;
  version: string;
  format: TafsirPackPayloadFormat;
  verses: TafsirPackPayloadVerse[];
}
