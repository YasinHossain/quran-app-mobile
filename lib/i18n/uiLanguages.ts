export const UI_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'bn', label: 'Bangla', nativeLabel: 'বাংলা' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
] as const;

export type UiLanguageCode = (typeof UI_LANGUAGES)[number]['code'];

export function isUiLanguageCode(value: string | undefined | null): value is UiLanguageCode {
  return UI_LANGUAGES.some((language) => language.code === value);
}

export function getUiLanguageLabel(code: string | undefined | null): string {
  const found = UI_LANGUAGES.find((language) => language.code === code);
  return found?.nativeLabel ?? 'English';
}
