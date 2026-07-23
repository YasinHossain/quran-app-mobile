export type VerseKey = `${number}:${number}`;

export type VerseSpotlightSurface = 'home' | 'android-widget';

export type VerseSpotlightState = {
  schemaVersion: 1;
  surface: VerseSpotlightSurface;
  verseKey: VerseKey;
  selectedAt: number;
  nextRandomAt: number | null;
  requestedTranslationId: number;
  effectiveTranslationId: number;
  poolVersion: string;
};

export type CanonicalVerse = {
  verseKey: VerseKey;
  canonicalIndex: number;
  surahId: number;
  ayahNumber: number;
  surahName: string;
  surahNameArabic: string;
  surahTranslatedName: string;
};

export type SpotlightVerseContent = {
  verseKey: VerseKey;
  arabicUthmani: string;
  translationText: string;
  requestedTranslationId: number;
  effectiveTranslationId: number;
  source: 'installed' | 'bundled-fallback';
};

export type TranslationDownloadIndexReader = {
  get(content: {
    kind: 'translation';
    translationId: number;
  }): Promise<{ status: string; error?: string } | null>;
};

export type TranslationVerseReader = {
  getVerseWithTranslations(
    verseKey: string,
    translationIds: number[]
  ): Promise<{
    verseKey: string;
    arabicUthmani: string;
    translations: Array<{ translationId: number; text: string }>;
  } | null>;
};

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
