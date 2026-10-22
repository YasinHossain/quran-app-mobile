import type { VerseWord } from './verseWord';

export type WordTranslationPackChecksum = string;
export type WordTranslationPackPayloadFormat = 'word-translation-json-v1';

export interface HostedWordTranslationPackCatalogEntry {
  languageCode: string;
  name: string;
  version: string;
  downloadUrl: string;
  checksum: WordTranslationPackChecksum;
  sizeBytes: number;
  totalVerses?: number | undefined;
  manifestUrl?: string | undefined;
  manifestChecksum?: WordTranslationPackChecksum | undefined;
  manifestSizeBytes?: number | undefined;
  minAppVersion?: string | undefined;
  maxAppVersion?: string | undefined;
  compatibility?: Record<string, string | number | boolean | null> | undefined;
}

export interface HostedWordTranslationPackCatalog {
  generatedAt?: string | undefined;
  packs: HostedWordTranslationPackCatalogEntry[];
}

export interface WordTranslationPackManifest {
  languageCode: string;
  name: string;
  version: string;
  bundled: boolean;
  format: WordTranslationPackPayloadFormat;
  payloadFile: string;
  payloadChecksum?: WordTranslationPackChecksum | undefined;
  payloadSizeBytes?: number | undefined;
  totalVerses: number;
  generatedAt: string;
  source: string;
}

export interface WordTranslationPackPayloadVerse {
  verseKey: string;
  surahId: number;
  ayahNumber: number;
  arabicUthmani: string;
  words: VerseWord[];
}

export interface WordTranslationPackPayload {
  languageCode: string;
  version: string;
  format: WordTranslationPackPayloadFormat;
  verses: WordTranslationPackPayloadVerse[];
}
