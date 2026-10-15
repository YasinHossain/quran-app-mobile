import juzData from '../../src/data/juz.json';
import { getQuranPageVerseRange } from '../../src/data/quranPageVerseRanges';

/** A Juz or Mushaf page, as an inclusive verse range in Mushaf order. */
export type ReaderPassage = {
  kind: 'juz' | 'page';
  number: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
};

type ChapterSummary = { id: number; verses_count: number };

type JuzRow = {
  number: number;
  startSurahId: number;
  startAyah: number;
  endSurahId: number;
  endAyah: number;
};

function parseVerseKey(verseKey: string | undefined): { surah: number; ayah: number } | null {
  const [surahRaw, ayahRaw] = (verseKey ?? '').split(':');
  const surah = Number(surahRaw);
  const ayah = Number(ayahRaw);
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || surah <= 0 || ayah <= 0) return null;
  return { surah, ayah };
}

export function getJuzPassage(juzNumber: number): ReaderPassage | null {
  const juz = (juzData as JuzRow[]).find((row) => row.number === juzNumber);
  if (!juz) return null;
  return {
    kind: 'juz',
    number: juz.number,
    startSurah: juz.startSurahId,
    startAyah: juz.startAyah,
    endSurah: juz.endSurahId,
    endAyah: juz.endAyah,
  };
}

export function getPagePassage(pageNumber: number): ReaderPassage | null {
  const range = getQuranPageVerseRange(pageNumber);
  const start = parseVerseKey(range?.[0]);
  const end = parseVerseKey(range?.[1]);
  if (!start || !end) return null;
  return {
    kind: 'page',
    number: Math.trunc(pageNumber),
    startSurah: start.surah,
    startAyah: start.ayah,
    endSurah: end.surah,
    endAyah: end.ayah,
  };
}

export function getPassageSurahIds(passage: ReaderPassage): number[] {
  return Array.from(
    { length: passage.endSurah - passage.startSurah + 1 },
    (_value, index) => passage.startSurah + index
  );
}

/** 0 when chapter metadata is missing, so callers skip the completeness check instead of failing. */
export function countPassageVerses(passage: ReaderPassage, chapters: ChapterSummary[]): number {
  let count = 0;
  for (const surahId of getPassageSurahIds(passage)) {
    const firstAyah = surahId === passage.startSurah ? passage.startAyah : 1;
    let lastAyah = passage.endAyah;
    if (surahId !== passage.endSurah) {
      const versesCount = chapters.find((chapter) => chapter.id === surahId)?.verses_count;
      if (!versesCount) return 0;
      lastAyah = versesCount;
    }
    count += lastAyah - firstAyah + 1;
  }
  return count;
}

export function passageContainsVerseKey(passage: ReaderPassage, verseKey: string | null): boolean {
  const verse = parseVerseKey(verseKey ?? undefined);
  if (!verse) return false;
  const afterStart =
    verse.surah > passage.startSurah ||
    (verse.surah === passage.startSurah && verse.ayah >= passage.startAyah);
  const beforeEnd =
    verse.surah < passage.endSurah ||
    (verse.surah === passage.endSurah && verse.ayah <= passage.endAyah);
  return afterStart && beforeEnd;
}

/** "An-Nisa 24 – 147" within one Surah, "Al-Baqarah 253 – Al-Imran 92" across Surahs. */
export function formatPassageSpan(
  passage: ReaderPassage,
  surahName: (surahId: number) => string
): string {
  const start = `${surahName(passage.startSurah)} ${passage.startAyah}`;
  if (passage.startSurah === passage.endSurah) return `${start} – ${passage.endAyah}`;
  return `${start} – ${surahName(passage.endSurah)} ${passage.endAyah}`;
}
