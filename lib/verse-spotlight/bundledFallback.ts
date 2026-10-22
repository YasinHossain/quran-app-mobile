import fallbackMetadataJson from '../../assets/verse-spotlight/bundled-sahih-metadata.json';
import fallbackPayloadJson from '../../dist/translation-packs/translations/20/2026-04-23/payload.json';

import { CANONICAL_VERSE_COUNT, getCanonicalVerse } from './canonicalIndex';

type FallbackVerse = {
  verseKey: string;
  surahId: number;
  ayahNumber: number;
  arabicUthmani: string;
  text: string;
};

type FallbackPayload = {
  translationId: number;
  version: string;
  format: string;
  verses: FallbackVerse[];
};

type FallbackMetadata = {
  translationId: number;
  translatorName: string;
  sourceVersion: string;
  verseCount: number;
};

const payload = fallbackPayloadJson as FallbackPayload;
const metadata = fallbackMetadataJson as FallbackMetadata;

function validateFallbackMetadata(): void {
  if (
    metadata.translationId !== 20 ||
    metadata.translationId !== payload.translationId ||
    metadata.sourceVersion !== payload.version ||
    payload.format !== 'translation-json-v1' ||
    metadata.verseCount !== CANONICAL_VERSE_COUNT ||
    payload.verses.length !== CANONICAL_VERSE_COUNT
  ) {
    throw new Error('Bundled Verse Spotlight fallback metadata is invalid.');
  }
}

validateFallbackMetadata();

export const BUNDLED_SAHIH_TRANSLATION_ID = metadata.translationId;
export const BUNDLED_SAHIH_TRANSLATOR_NAME = metadata.translatorName;

export function getBundledFallbackVerse(verseKey: string): Readonly<FallbackVerse> | null {
  const canonical = getCanonicalVerse(verseKey);
  if (!canonical) return null;

  const verse = payload.verses[canonical.canonicalIndex];
  if (
    !verse ||
    verse.verseKey !== verseKey ||
    !verse.arabicUthmani?.trim() ||
    !verse.text?.trim()
  ) {
    throw new Error(`Bundled Verse Spotlight fallback is invalid at ${verseKey}.`);
  }
  return Object.freeze(verse);
}
