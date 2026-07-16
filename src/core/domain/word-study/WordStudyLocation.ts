export interface WordStudyLocationInput {
  readonly surah: number;
  readonly ayah: number;
  readonly wordPosition: number;
}

export interface WordStudyLocation extends WordStudyLocationInput {
  readonly verseKey: string;
  readonly locationKey: string;
}

export class WordStudyLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordStudyLocationError';
  }
}

const LOCATION_PATTERN = /^([1-9]\d*):([1-9]\d*):([1-9]\d*)$/;
const VERSE_KEY_PATTERN = /^([1-9]\d*):([1-9]\d*)$/;

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new WordStudyLocationError(`${fieldName} must be a positive integer`);
  }
}

function assertSurahRange(surah: number): void {
  if (surah < 1 || surah > 114) {
    throw new WordStudyLocationError('surah must be between 1 and 114');
  }
}

function toNumber(rawValue: string, fieldName: string): number {
  const value = Number(rawValue);
  assertPositiveInteger(value, fieldName);
  return value;
}

export function formatWordStudyLocation(input: WordStudyLocationInput): string {
  assertPositiveInteger(input.surah, 'surah');
  assertSurahRange(input.surah);
  assertPositiveInteger(input.ayah, 'ayah');
  assertPositiveInteger(input.wordPosition, 'wordPosition');
  return `${input.surah}:${input.ayah}:${input.wordPosition}`;
}

export function formatVerseKey(input: Pick<WordStudyLocationInput, 'surah' | 'ayah'>): string {
  assertPositiveInteger(input.surah, 'surah');
  assertSurahRange(input.surah);
  assertPositiveInteger(input.ayah, 'ayah');
  return `${input.surah}:${input.ayah}`;
}

export function parseWordStudyLocation(locationKey: string): WordStudyLocation {
  const normalizedLocationKey = locationKey.trim();
  const match = LOCATION_PATTERN.exec(normalizedLocationKey);
  if (!match) {
    throw new WordStudyLocationError('Invalid word-study location. Expected "surah:ayah:wordPosition"');
  }

  const [, rawSurah, rawAyah, rawWordPosition] = match;
  if (rawSurah === undefined || rawAyah === undefined || rawWordPosition === undefined) {
    throw new WordStudyLocationError('Invalid word-study location. Expected "surah:ayah:wordPosition"');
  }

  const surah = toNumber(rawSurah, 'surah');
  assertSurahRange(surah);
  const ayah = toNumber(rawAyah, 'ayah');
  const wordPosition = toNumber(rawWordPosition, 'wordPosition');
  const verseKey = formatVerseKey({ surah, ayah });
  const canonicalLocationKey = formatWordStudyLocation({ surah, ayah, wordPosition });

  return {
    surah,
    ayah,
    wordPosition,
    verseKey,
    locationKey: canonicalLocationKey,
  };
}

export function parseVerseKey(verseKey: string): Pick<WordStudyLocation, 'surah' | 'ayah' | 'verseKey'> {
  const normalizedVerseKey = verseKey.trim();
  const match = VERSE_KEY_PATTERN.exec(normalizedVerseKey);
  if (!match) {
    throw new WordStudyLocationError('Invalid verse key. Expected "surah:ayah"');
  }

  const [, rawSurah, rawAyah] = match;
  if (rawSurah === undefined || rawAyah === undefined) {
    throw new WordStudyLocationError('Invalid verse key. Expected "surah:ayah"');
  }

  const surah = toNumber(rawSurah, 'surah');
  assertSurahRange(surah);
  const ayah = toNumber(rawAyah, 'ayah');

  return {
    surah,
    ayah,
    verseKey: formatVerseKey({ surah, ayah }),
  };
}

export function toWordStudyLocation(input: string | WordStudyLocationInput): WordStudyLocation {
  if (typeof input === 'string') {
    return parseWordStudyLocation(input);
  }

  const locationKey = formatWordStudyLocation(input);
  return parseWordStudyLocation(locationKey);
}
