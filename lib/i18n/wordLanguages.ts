export const WORD_LANGUAGES = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'bn', name: 'Bangla', direction: 'ltr' },
  { code: 'ur', name: 'Urdu', direction: 'rtl' },
  { code: 'hi', name: 'Hindi', direction: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', direction: 'ltr' },
  { code: 'fa', name: 'Persian', direction: 'rtl' },
  { code: 'tr', name: 'Turkish', direction: 'ltr' },
  { code: 'ta', name: 'Tamil', direction: 'ltr' },
] as const;

export type WordLanguageCode = (typeof WORD_LANGUAGES)[number]['code'];
export type WordLanguageDirection = (typeof WORD_LANGUAGES)[number]['direction'];

export function normalizeWordLanguageCode(value: string | undefined | null): WordLanguageCode {
  const normalized = value?.trim().toLowerCase();
  return WORD_LANGUAGES.some((language) => language.code === normalized)
    ? normalized as WordLanguageCode
    : 'en';
}

export function getWordLanguageName(value: string | undefined | null): string {
  const code = normalizeWordLanguageCode(value);
  return WORD_LANGUAGES.find((language) => language.code === code)?.name ?? 'English';
}

export function getWordLanguageDirection(
  value: string | undefined | null
): WordLanguageDirection {
  const code = normalizeWordLanguageCode(value);
  return WORD_LANGUAGES.find((language) => language.code === code)?.direction ?? 'ltr';
}
