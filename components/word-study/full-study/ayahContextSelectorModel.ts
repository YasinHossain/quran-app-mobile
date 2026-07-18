export type AyahExcerptWord = {
  readonly wordPosition: number;
  readonly surfaceUthmani: string;
};

export type AyahExcerptRange = {
  readonly startIndex: number;
  readonly endIndex: number;
};

const DIACRITIC_PATTERN = /\p{Mark}|\u0640/gu;

export function estimateAyahWordUnits(surfaceUthmani: string): number {
  const baseCharacters = Array.from(
    surfaceUthmani.normalize('NFD').replace(DIACRITIC_PATTERN, '')
  ).length;
  return Math.max(2, baseCharacters + 1);
}

export function getCollapsedAyahCapacity(
  viewportWidth: number,
  fontSize = 31,
  lineCount = 3
): number {
  const contentWidth = Math.max(180, viewportWidth - 32);
  const averageGlyphWidth = fontSize * 0.48;
  return Math.max(18, Math.floor(contentWidth / averageGlyphWidth) * lineCount);
}

export function shouldCollapseAyah(
  words: readonly AyahExcerptWord[],
  capacity: number
): boolean {
  return words.reduce(
    (total, word) => total + estimateAyahWordUnits(word.surfaceUthmani),
    0
  ) > capacity;
}

export function getSelectedAyahExcerpt(
  words: readonly AyahExcerptWord[],
  selectedPosition: number,
  capacity: number
): AyahExcerptRange {
  if (words.length === 0) return { startIndex: 0, endIndex: 0 };

  const selectedIndex = Math.max(
    0,
    words.findIndex((word) => word.wordPosition === selectedPosition)
  );
  let startIndex = selectedIndex;
  let endIndex = selectedIndex + 1;
  let usedUnits = estimateAyahWordUnits(words[selectedIndex]?.surfaceUthmani ?? '');
  let earlierUnits = 0;
  let laterUnits = 0;
  const budget = Math.max(usedUnits, capacity - 4);

  while (startIndex > 0 || endIndex < words.length) {
    const preferEarlier = startIndex > 0 && (endIndex >= words.length || earlierUnits <= laterUnits);
    const preferredIndex = preferEarlier ? startIndex - 1 : endIndex;
    const alternateIndex = preferEarlier ? endIndex : startIndex - 1;
    const preferredUnits = words[preferredIndex]
      ? estimateAyahWordUnits(words[preferredIndex].surfaceUthmani)
      : Number.POSITIVE_INFINITY;
    const alternateUnits = words[alternateIndex]
      ? estimateAyahWordUnits(words[alternateIndex].surfaceUthmani)
      : Number.POSITIVE_INFINITY;

    if (usedUnits + preferredUnits <= budget) {
      usedUnits += preferredUnits;
      if (preferEarlier) {
        startIndex -= 1;
        earlierUnits += preferredUnits;
      } else {
        endIndex += 1;
        laterUnits += preferredUnits;
      }
      continue;
    }

    if (usedUnits + alternateUnits <= budget) {
      usedUnits += alternateUnits;
      if (preferEarlier) {
        endIndex += 1;
        laterUnits += alternateUnits;
      } else {
        startIndex -= 1;
        earlierUnits += alternateUnits;
      }
      continue;
    }

    break;
  }

  return { startIndex, endIndex };
}
