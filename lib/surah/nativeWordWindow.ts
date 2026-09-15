export const NATIVE_WORD_WINDOW_RADIUS = 16;
export const NATIVE_WORD_WINDOW_MAX_WORDS = 400;

export type NativeWordWindowCandidate = {
  verseNumber: number;
  wordCount: number;
};

export function selectNativeWordWindowVerseNumbers(
  candidates: readonly NativeWordWindowCandidate[],
  centerVerse: number,
  maxWords = NATIVE_WORD_WINDOW_MAX_WORDS
): number[] {
  const normalizedCenter = Math.max(1, Math.trunc(centerVerse));
  const normalizedMaxWords = Math.max(1, Math.trunc(maxWords));
  const selected: number[] = [];
  let selectedWordCount = 0;

  const nearestFirst = candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.verseNumber) &&
        candidate.verseNumber > 0 &&
        Number.isFinite(candidate.wordCount) &&
        candidate.wordCount > 0
    )
    .map((candidate) => ({
      verseNumber: Math.trunc(candidate.verseNumber),
      wordCount: Math.trunc(candidate.wordCount),
    }))
    .sort((left, right) => {
      const distance =
        Math.abs(left.verseNumber - normalizedCenter) -
        Math.abs(right.verseNumber - normalizedCenter);
      return distance || left.verseNumber - right.verseNumber;
    });

  for (const candidate of nearestFirst) {
    if (selectedWordCount + candidate.wordCount > normalizedMaxWords) continue;
    selected.push(candidate.verseNumber);
    selectedWordCount += candidate.wordCount;
  }

  return selected.sort((left, right) => left - right);
}
