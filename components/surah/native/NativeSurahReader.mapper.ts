import type { SurahVerse } from '@/hooks/useSurahVerses';

import type {
  NativeSurahReaderTajweedGlyphRun,
  NativeSurahReaderVerse,
  NativeSurahReaderWord,
} from './NativeSurahReader.types';

type TranslationResource = {
  name?: string;
};

type BuildNativeLightSurahVersesParams = {
  audioWordSyncEnabled?: boolean;
  getVerseByNumber: (verseNumber: number) => SurahVerse | undefined;
  showTranslationAttribution: boolean;
  showByWords: boolean;
  tajweed: boolean;
  supportsNativeLightSurahReader: boolean;
  translationsById: Map<number, TranslationResource>;
  verseNumbers: number[];
};

function buildNativeWords(verse: SurahVerse): NativeSurahReaderWord[] {
  return (verse.words ?? [])
    .map((word, index) => {
      const fallbackId = index + 1;
      const id = Number.isFinite(word.id) && word.id > 0 ? Math.trunc(word.id) : fallbackId;
      return {
        id,
        uthmani: word.uthmani.trim(),
        ...(typeof word.position === 'number' && Number.isFinite(word.position) && word.position > 0
          ? { position: Math.trunc(word.position) }
          : {}),
        ...(typeof word.translationText === 'string' && word.translationText.trim()
          ? { translationText: word.translationText.trim() }
          : {}),
        ...(typeof word.charTypeName === 'string' && word.charTypeName.trim()
          ? { charTypeName: word.charTypeName.trim() }
          : {}),
        ...(typeof word.codeV2 === 'string' && word.codeV2.trim()
          ? { codeV2: word.codeV2.trim() }
          : {}),
        ...(typeof word.pageNumber === 'number' && Number.isFinite(word.pageNumber) && word.pageNumber > 0
          ? { pageNumber: Math.trunc(word.pageNumber) }
          : {}),
      };
    })
    .filter((word) => word.uthmani.length > 0);
}

function buildFallbackNativeWords(verse: SurahVerse): NativeSurahReaderWord[] {
  return (verse.text_uthmani ?? '')
    .split(/\s+/)
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((uthmani, index) => ({
      id: index + 1,
      position: index + 1,
      uthmani,
    }));
}

function buildNativeTajweedGlyphRuns(verse: SurahVerse): NativeSurahReaderTajweedGlyphRun[] {
  return (verse.tajweedGlyphRuns ?? [])
    .map((run) => ({
      fontFamily: run.fontFamily.trim(),
      fontFileUri: run.fontFileUri.trim(),
      glyphs: run.glyphs.map((glyph) => glyph.trim()).filter((glyph) => glyph.length > 0),
    }))
    .filter((run) => run.fontFamily && run.fontFileUri && run.glyphs.length > 0);
}

export function buildNativeLightSurahVerses({
  audioWordSyncEnabled = false,
  getVerseByNumber,
  showTranslationAttribution,
  showByWords,
  tajweed,
  supportsNativeLightSurahReader,
  translationsById,
  verseNumbers,
}: BuildNativeLightSurahVersesParams): NativeSurahReaderVerse[] {
  if (!supportsNativeLightSurahReader) return [];

  const nativeVerses: NativeSurahReaderVerse[] = [];
  for (const verseNumber of verseNumbers) {
    const verse = getVerseByNumber(verseNumber);
    if (!verse) return [];
    const shouldIncludeWords = showByWords || audioWordSyncEnabled || tajweed;
    const nativeWords = shouldIncludeWords ? buildNativeWords(verse) : undefined;
    const words =
      shouldIncludeWords && nativeWords?.length
        ? nativeWords
        : shouldIncludeWords
          ? buildFallbackNativeWords(verse)
          : undefined;
    if (shouldIncludeWords && !words?.length) return [];
    const tajweedGlyphRuns = tajweed && !showByWords ? buildNativeTajweedGlyphRuns(verse) : undefined;

    nativeVerses.push({
      verseKey: verse.verse_key,
      verseNumber: verse.verse_number,
      ...(typeof verse.id === 'number' && Number.isFinite(verse.id) && verse.id > 0
        ? { verseApiId: verse.id }
        : {}),
      arabicText: verse.text_uthmani ?? '',
      ...(words ? { words } : {}),
      ...(tajweedGlyphRuns?.length ? { tajweedGlyphRuns } : {}),
      translationItems: showTranslationAttribution
        ? (verse.translationItems ?? []).map((translation) => {
            if (translation.resourceName) return translation;
            const fallbackName =
              typeof translation.resourceId === 'number'
                ? translationsById.get(translation.resourceId)?.name ??
                  `Translation ${translation.resourceId}`
                : undefined;
            return { ...translation, resourceName: fallbackName };
          })
        : verse.translationItems ?? [],
    });
  }

  return nativeVerses;
}
