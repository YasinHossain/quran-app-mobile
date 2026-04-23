export type TranslationPackChecksum = string;
export type TranslationPackPayloadFormat = 'translation-json-v1';

export interface HostedTranslationPackCatalogEntry {
  translationId: number;
  name: string;
  authorName: string;
  languageName: string;
  version: string;
  downloadUrl: string;
  checksum: TranslationPackChecksum;
  sizeBytes: number;
  totalVerses?: number | undefined;
  manifestUrl?: string | undefined;
  manifestChecksum?: string | undefined;
  manifestSizeBytes?: number | undefined;
  minAppVersion?: string | undefined;
  maxAppVersion?: string | undefined;
  compatibility?: Record<string, string | number | boolean | null> | undefined;
}

export interface HostedTranslationPackCatalog {
  generatedAt?: string | undefined;
  packs: HostedTranslationPackCatalogEntry[];
}

export interface TranslationPackManifest {
  translationId: number;
  name: string;
  authorName: string;
  languageName: string;
  version: string;
  bundled: boolean;
  format: TranslationPackPayloadFormat;
  payloadFile: string;
  payloadChecksum?: TranslationPackChecksum | undefined;
  payloadSizeBytes?: number | undefined;
  totalVerses: number;
  generatedAt: string;
  source: string;
}

export interface TranslationPackPayloadVerse {
  verseKey: string;
  surahId: number;
  ayahNumber: number;
  arabicUthmani: string;
  text: string;
}

export interface TranslationPackPayload {
  translationId: number;
  version: string;
  format: TranslationPackPayloadFormat;
  verses: TranslationPackPayloadVerse[];
}
