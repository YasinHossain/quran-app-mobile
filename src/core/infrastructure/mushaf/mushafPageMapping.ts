import type { MushafPageLines, MushafVerse, MushafWord } from '@/types';

const toVerseSortValue = (verseKey?: string): number => {
  if (!verseKey) return Number.MAX_SAFE_INTEGER;

  const [chapterRaw, ayahRaw] = verseKey.split(':');
  const chapter = Number.parseInt(chapterRaw ?? '', 10);
  const ayah = Number.parseInt(ayahRaw ?? '', 10);

  if (Number.isFinite(chapter) && Number.isFinite(ayah)) {
    return chapter * 1000 + ayah;
  }

  if (Number.isFinite(ayah)) {
    return ayah;
  }

  return Number.MAX_SAFE_INTEGER;
};

const createLineKey = (pageNumber: number, lineNumber: number): string => `${pageNumber}:${lineNumber}`;

const sortWordsByPosition = (words: MushafWord[]): MushafWord[] => [...words].sort((a, b) => a.position - b.position);

export function mapVersesToPageLines(pageNumber: number, verses: MushafVerse[]): MushafPageLines {
  const lineBuckets = new Map<number, MushafWord[]>();
  const orderedVerses = [...verses].sort(
    (a, b) => toVerseSortValue(a.verseKey) - toVerseSortValue(b.verseKey)
  );

  for (const verse of orderedVerses) {
    for (const word of sortWordsByPosition(verse.words)) {
      if (typeof word.lineNumber !== 'number') continue;

      const existing = lineBuckets.get(word.lineNumber);
      if (existing) {
        existing.push(word);
      } else {
        lineBuckets.set(word.lineNumber, [word]);
      }
    }
  }

  return {
    pageNumber,
    lines: Array.from(lineBuckets.entries())
      .sort(([left], [right]) => left - right)
      .map(([lineNumber, words]) => ({
        lineNumber,
        key: createLineKey(pageNumber, lineNumber),
        words,
      })),
  };
}
