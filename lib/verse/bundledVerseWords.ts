import { getBundledMushafPack } from '@/src/core/infrastructure/mushaf/bundledPacks';

import type { MushafVerse, VerseWord } from '@/types';

let bundledVerseWordsByKey: Map<string, VerseWord[]> | null = null;

export function mushafWordsToVerseWords(words: MushafVerse['words']): VerseWord[] {
  return words
    .map((word, index) => ({
      id: typeof word.id === 'number' ? word.id : index + 1,
      ...(typeof word.position === 'number' ? { position: word.position } : {}),
      ...(typeof word.charType === 'string' ? { charTypeName: word.charType } : {}),
      uthmani: word.textUthmani ?? word.textQpcHafs ?? word.textIndopak ?? '',
      ...(typeof word.codeV2 === 'string' ? { codeV2: word.codeV2 } : {}),
      ...(typeof word.pageNumber === 'number' ? { pageNumber: word.pageNumber } : {}),
    }))
    .filter((word) => word.uthmani.trim().length > 0);
}

function getBundledVerseWordsByKey(): Map<string, VerseWord[]> {
  if (bundledVerseWordsByKey) return bundledVerseWordsByKey;

  const map = new Map<string, VerseWord[]>();
  const pack = getBundledMushafPack('unicode-uthmani-v1');
  const pages = pack?.payload.pages ?? {};

  for (const pageVerses of Object.values(pages)) {
    for (const verse of pageVerses) {
      const words = mushafWordsToVerseWords(verse.words);
      if (words.length > 0) map.set(verse.verseKey, words);
    }
  }

  bundledVerseWordsByKey = map;
  return map;
}

export function getBundledVerseWords(verseKey: string): VerseWord[] | undefined {
  return getBundledVerseWordsByKey().get(verseKey.trim());
}
