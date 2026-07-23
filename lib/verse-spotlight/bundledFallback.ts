import fallbackMetadataJson from '../../assets/verse-spotlight/bundled-sahih-metadata.json';
import fallbackPayloadJson from '../../dist/translation-packs/translations/20/2026-04-23/payload.json';

import { CANONICAL_VERSE_COUNT, CANONICAL_VERSE_KEYS, isValidVerseKey } from './canonicalIndex';
import type { VerseKey } from './contracts';

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

function validateFallback(): ReadonlyMap<VerseKey, Readonly<FallbackVerse>> {
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

  const verses = new Map<VerseKey, Readonly<FallbackVerse>>();
  for (let index = 0; index < payload.verses.length; index += 1) {
    const verse = payload.verses[index];
    const expectedKey = CANONICAL_VERSE_KEYS[index];
    if (
      !verse ||
      verse.verseKey !== expectedKey ||
      !isValidVerseKey(verse.verseKey) ||
      !verse.arabicUthmani.trim() ||
      !verse.text.trim() ||
      verses.has(verse.verseKey)
    ) {
      throw new Error(`Bundled Verse Spotlight fallback is invalid at ${expectedKey}.`);
    }
    verses.set(verse.verseKey, Object.freeze(verse));
  }
  return verses;
}

const fallbackByKey = validateFallback();

export const BUNDLED_SAHIH_TRANSLATION_ID = metadata.translationId;
export const BUNDLED_SAHIH_TRANSLATOR_NAME = metadata.translatorName;

export function getBundledFallbackVerse(verseKey: string): Readonly<FallbackVerse> | null {
  if (!isValidVerseKey(verseKey)) return null;
  return fallbackByKey.get(verseKey) ?? null;
}
