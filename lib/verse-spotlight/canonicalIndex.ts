import canonicalIndexJson from '../../assets/verse-spotlight/canonical-verse-index.json';

import type { CanonicalVerse, VerseKey } from './contracts';

type CanonicalChapterAsset = {
  id: number;
  nameSimple: string;
  nameArabic: string;
  translatedName: string;
  verseCount: number;
  startIndex: number;
};

type CanonicalIndexAsset = {
  schemaVersion: number;
  surahCount: number;
  verseCount: number;
  firstVerseKey: string;
  finalVerseKey: string;
  chapters: CanonicalChapterAsset[];
  verseKeys: string[];
};

const EXPECTED_VERSE_COUNT = 6236;
const asset = canonicalIndexJson as CanonicalIndexAsset;

function isExactVerseKey(value: string): value is VerseKey {
  return /^(?:[1-9]|[1-9]\d|1[01]\d|114):[1-9]\d*$/.test(value);
}

function validateCanonicalAsset(): void {
  if (
    asset.schemaVersion !== 1 ||
    asset.surahCount !== 114 ||
    asset.verseCount !== EXPECTED_VERSE_COUNT ||
    asset.chapters.length !== 114 ||
    asset.verseKeys.length !== EXPECTED_VERSE_COUNT ||
    asset.firstVerseKey !== '1:1' ||
    asset.finalVerseKey !== '114:6'
  ) {
    throw new Error('Verse Spotlight canonical index metadata is invalid.');
  }

  const seen = new Set<string>();
  for (let index = 0; index < asset.verseKeys.length; index += 1) {
    const verseKey = asset.verseKeys[index];
    if (!verseKey || !isExactVerseKey(verseKey) || seen.has(verseKey)) {
      throw new Error(`Verse Spotlight canonical index has an invalid key at ${index}.`);
    }
    seen.add(verseKey);
  }

  for (let chapterIndex = 0; chapterIndex < asset.chapters.length; chapterIndex += 1) {
    const chapter = asset.chapters[chapterIndex];
    if (
      !chapter ||
      chapter.id !== chapterIndex + 1 ||
      !Number.isInteger(chapter.verseCount) ||
      chapter.verseCount < 1 ||
      asset.verseKeys[chapter.startIndex] !== `${chapter.id}:1` ||
      asset.verseKeys[chapter.startIndex + chapter.verseCount - 1] !==
        `${chapter.id}:${chapter.verseCount}`
    ) {
      throw new Error(`Verse Spotlight canonical index has an invalid surah ${chapterIndex + 1}.`);
    }
  }
}

validateCanonicalAsset();

const canonicalVerseKeys = Object.freeze(asset.verseKeys.map((key) => key as VerseKey));
const canonicalIndexByKey = new Map<VerseKey, number>(
  canonicalVerseKeys.map((verseKey, index) => [verseKey, index])
);
const chapterById = new Map(asset.chapters.map((chapter) => [chapter.id, chapter]));

export const CANONICAL_VERSE_COUNT = EXPECTED_VERSE_COUNT;
export const FIRST_VERSE_KEY = canonicalVerseKeys[0] as VerseKey;
export const FINAL_VERSE_KEY = canonicalVerseKeys.at(-1) as VerseKey;
export const CANONICAL_VERSE_KEYS: readonly VerseKey[] = canonicalVerseKeys;

export function isValidVerseKey(value: unknown): value is VerseKey {
  return (
    typeof value === 'string' &&
    isExactVerseKey(value) &&
    canonicalIndexByKey.has(value)
  );
}

export function getCanonicalVerse(verseKey: string): CanonicalVerse | null {
  if (!isValidVerseKey(verseKey)) return null;
  const canonicalIndex = canonicalIndexByKey.get(verseKey);
  if (canonicalIndex === undefined) return null;

  const separatorIndex = verseKey.indexOf(':');
  const surahId = Number(verseKey.slice(0, separatorIndex));
  const ayahNumber = Number(verseKey.slice(separatorIndex + 1));
  const chapter = chapterById.get(surahId);
  if (!chapter) return null;

  return {
    verseKey,
    canonicalIndex,
    surahId,
    ayahNumber,
    surahName: chapter.nameSimple,
    surahNameArabic: chapter.nameArabic,
    surahTranslatedName: chapter.translatedName,
  };
}

export function getPreviousVerseKey(verseKey: string): VerseKey | null {
  if (!isValidVerseKey(verseKey)) return null;
  const index = canonicalIndexByKey.get(verseKey);
  if (index === undefined || index === 0) return null;
  return canonicalVerseKeys[index - 1] ?? null;
}

export function getNextVerseKey(verseKey: string): VerseKey | null {
  if (!isValidVerseKey(verseKey)) return null;
  const index = canonicalIndexByKey.get(verseKey);
  if (index === undefined || index >= canonicalVerseKeys.length - 1) return null;
  return canonicalVerseKeys[index + 1] ?? null;
}

export function getVerseReaderTarget(verseKey: string): {
  pathname: '/surah/[surahId]';
  params: { surahId: string; startVerse: string; view: 'translations' };
} | null {
  const verse = getCanonicalVerse(verseKey);
  if (!verse) return null;
  return {
    pathname: '/surah/[surahId]',
    params: {
      surahId: String(verse.surahId),
      startVerse: String(verse.ayahNumber),
      view: 'translations',
    },
  };
}
