const PREFIXES = [
  'وال',
  'فال',
  'بال',
  'كال',
  'لل',
  'ال',
  'و',
  'ف',
  'ب',
  'ك',
  'ل',
  'س',
] as const;

const SUFFIXES = [
  'كما',
  'هما',
  'كم',
  'كن',
  'هم',
  'هن',
  'نا',
  'ني',
  'ها',
  'ان',
  'ون',
  'ين',
  'وا',
  'ات',
  'ية',
  'ه',
  'ك',
  'ي',
  'ا',
  'ت',
  'ة',
] as const;

export function normalizeDictionaryArabic(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\s\u200e\u200f]/gu, '')
    .replace(/[ٱأإآ]/gu, 'ا')
    .replace(/ء(?=ا)/gu, '')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ة/gu, 'ه');
}

export function getDictionarySurfaceCandidates(surfaceArabic: string): readonly string[] {
  const normalized = normalizeDictionaryArabic(surfaceArabic);
  if (normalized.length < 2) return normalized ? [normalized] : [];

  const candidates = new Set<string>([normalized]);
  const add = (value: string): void => {
    if (value.length >= 2) candidates.add(value);
  };

  const withoutPrefixes = [normalized];
  for (const prefix of PREFIXES) {
    if (normalized.startsWith(prefix) && normalized.length - prefix.length >= 2) {
      const value = normalized.slice(prefix.length);
      add(value);
      withoutPrefixes.push(value);
    }
  }

  for (const value of withoutPrefixes) {
    for (const suffix of SUFFIXES) {
      if (value.endsWith(suffix) && value.length - suffix.length >= 2) {
        add(value.slice(0, -suffix.length));
      }
    }
  }

  return [...candidates];
}
