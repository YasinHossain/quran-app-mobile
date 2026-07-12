import type { SurahVerse } from '@/hooks/useSurahVerses';

import type { NativeSurahReaderVerse } from './NativeSurahReader.types';

type TranslationResource = {
  name?: string;
};

type BuildNativeLightSurahVersesParams = {
  getVerseByNumber: (verseNumber: number) => SurahVerse | undefined;
  showTranslationAttribution: boolean;
  supportsNativeLightSurahReader: boolean;
  translationsById: Map<number, TranslationResource>;
  verseNumbers: number[];
};

export function buildNativeLightSurahVerses({
  getVerseByNumber,
  showTranslationAttribution,
  supportsNativeLightSurahReader,
  translationsById,
  verseNumbers,
}: BuildNativeLightSurahVersesParams): NativeSurahReaderVerse[] {
  if (!supportsNativeLightSurahReader) return [];

  const nativeVerses: NativeSurahReaderVerse[] = [];
  for (const verseNumber of verseNumbers) {
    const verse = getVerseByNumber(verseNumber);
    if (!verse) return [];

    nativeVerses.push({
      verseKey: verse.verse_key,
      verseNumber: verse.verse_number,
      ...(typeof verse.id === 'number' && Number.isFinite(verse.id) && verse.id > 0
        ? { verseApiId: verse.id }
        : {}),
      arabicText: verse.text_uthmani ?? '',
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
