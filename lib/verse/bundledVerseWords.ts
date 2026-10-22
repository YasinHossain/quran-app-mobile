import type { MushafVerse, VerseWord } from '@/types';

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

export function getBundledVerseWords(_verseKey: string): VerseWord[] | undefined {
  return undefined;
}
