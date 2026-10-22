import juzData from '../../src/data/juz.json';
import { INDOPAK_15_PAGE_VERSE_RANGES } from '../../src/data/indopak15PageVerseRanges';
import { INDOPAK_16_PAGE_VERSE_RANGES } from '../../src/data/indopak16PageVerseRanges';
import { QURAN_PAGE_VERSE_RANGES } from '../../src/data/quranPageVerseRanges';

export type MushafPageRange = {
  firstPage: number;
  lastPage: number;
};

type PageVerseRanges = ReadonlyArray<readonly [string, string]>;

type JuzRow = {
  number: number;
  startSurahId: number;
  startAyah: number;
  endSurahId: number;
  endAyah: number;
};

/**
 * How one printed mushaf divides the Quran into pages. The Madani prints (QCF V1/V2, QPC Hafs,
 * Tajweed) share 604 pages; the IndoPak prints have their own page breaks and page counts.
 */
export type MushafPageLayout = {
  id: 'madani' | 'indopak-15' | 'indopak-16';
  /** Quran.com's `mushaf` id for a page endpoint that groups verses this way. */
  apiMushafId: number;
  totalPages: number;
  getPageVerseRange: (pageNumber: number) => readonly [string, string] | null;
  /** The page a verse starts on, or null for an unknown verse. */
  getVersePage: (verseKey: string) => number | null;
  getSurahPageRange: (surahId: number) => MushafPageRange | null;
  getJuzPageRange: (juzNumber: number) => MushafPageRange | null;
  /** The Juz a page ends in, matching the printed page footer. */
  getJuzForPage: (pageNumber: number) => number;
};

function parseVerseKey(verseKey: string | undefined): number | null {
  const [surahRaw, ayahRaw] = (verseKey ?? '').split(':');
  const surah = Number(surahRaw);
  const ayah = Number(ayahRaw);
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || surah <= 0 || ayah <= 0) return null;
  // A comparable position in Mushaf order; no Surah has 1000 verses.
  return surah * 1000 + ayah;
}

function createPageLayout(
  id: MushafPageLayout['id'],
  apiMushafId: number,
  ranges: PageVerseRanges
): MushafPageLayout {
  const pageStarts = ranges.map(([from]) => parseVerseKey(from) ?? 0);
  const pageEnds = ranges.map(([, to]) => parseVerseKey(to) ?? 0);
  const totalPages = ranges.length;

  const getPageVerseRange = (pageNumber: number): readonly [string, string] | null => {
    if (!Number.isFinite(pageNumber)) return null;
    const normalized = Math.trunc(pageNumber);
    if (normalized < 1 || normalized > totalPages) return null;
    return ranges[normalized - 1] ?? null;
  };

  const getPageForPosition = (position: number): number | null => {
    // Binary search for the first page that ends at or after the verse. In the 16-line IndoPak
    // print a verse often continues onto the next page, which then starts with the same verse.
    let low = 0;
    let high = totalPages - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if ((pageEnds[middle] ?? 0) >= position) {
        found = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    if (found < 0 || position < (pageStarts[found] ?? 0)) return null;
    return found + 1;
  };

  const getVersePage = (verseKey: string): number | null => {
    const position = parseVerseKey(verseKey);
    return position === null ? null : getPageForPosition(position);
  };

  const getSurahPageRange = (surahId: number): MushafPageRange | null => {
    if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) return null;
    const firstPage = getPageForPosition(surahId * 1000 + 1);
    if (firstPage === null) return null;
    if (surahId === 114) return { firstPage, lastPage: totalPages };
    const nextSurahPage = getPageForPosition((surahId + 1) * 1000 + 1);
    if (nextSurahPage === null) return null;
    // The next Surah may begin mid-page, in which case that page still holds this Surah's end.
    const nextSurahStartsPage = pageStarts[nextSurahPage - 1] === (surahId + 1) * 1000 + 1;
    return {
      firstPage,
      lastPage: Math.max(firstPage, nextSurahStartsPage ? nextSurahPage - 1 : nextSurahPage),
    };
  };

  const juzPageRanges = (juzData as JuzRow[]).map((juz) => {
    const firstPage = getPageForPosition(juz.startSurahId * 1000 + juz.startAyah);
    const lastPage = getPageForPosition(juz.endSurahId * 1000 + juz.endAyah);
    return firstPage !== null && lastPage !== null ? { firstPage, lastPage } : null;
  });

  const getJuzPageRange = (juzNumber: number): MushafPageRange | null =>
    Number.isInteger(juzNumber) ? juzPageRanges[juzNumber - 1] ?? null : null;

  const getJuzForPage = (pageNumber: number): number => {
    const pageEnd = pageEnds[Math.trunc(pageNumber) - 1];
    if (!pageEnd) return 1;
    const juz = (juzData as JuzRow[]).find(
      (row) =>
        pageEnd >= row.startSurahId * 1000 + row.startAyah &&
        pageEnd <= row.endSurahId * 1000 + row.endAyah
    );
    return juz?.number ?? 1;
  };

  return {
    id,
    apiMushafId,
    totalPages,
    getPageVerseRange,
    getVersePage,
    getSurahPageRange,
    getJuzPageRange,
    getJuzForPage,
  };
}

let madaniLayout: MushafPageLayout | null = null;
let indopak15Layout: MushafPageLayout | null = null;
let indopak16Layout: MushafPageLayout | null = null;

export function getMadaniPageLayout(): MushafPageLayout {
  madaniLayout ??= createPageLayout('madani', 1, QURAN_PAGE_VERSE_RANGES);
  return madaniLayout;
}

/**
 * The page layout of the selected mushaf, so page numbers, page counts and Surah/Juz page ranges
 * match the pages the reader shows. Without a selection pages follow the Madani print.
 */
export function getMushafPageLayout(mushafId?: string | null): MushafPageLayout {
  switch (mushafId) {
    case 'unicode-indopak-15':
      indopak15Layout ??= createPageLayout('indopak-15', 6, INDOPAK_15_PAGE_VERSE_RANGES);
      return indopak15Layout;
    case 'unicode-indopak-16':
      indopak16Layout ??= createPageLayout('indopak-16', 7, INDOPAK_16_PAGE_VERSE_RANGES);
      return indopak16Layout;
    default:
      return getMadaniPageLayout();
  }
}
