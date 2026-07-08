const DIGIT_MAPS: Record<string, readonly string[]> = {
  bn: ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'],
  hi: ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'],
  ar: ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
  ur: ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
} as const;

const LOCALE_OVERRIDES: Record<string, string> = {
  bn: 'bn-BD',
  hi: 'hi-IN',
  ar: 'ar',
  ur: 'ur-PK',
} as const;

const normalizeLanguageCode = (languageCode: string): string =>
  (languageCode || '').toLowerCase().split(/[-_]/)[0] ?? '';

export const localizeDigits = (value: string, languageCode: string): string => {
  const map = DIGIT_MAPS[normalizeLanguageCode(languageCode)];
  if (!map) return value;

  return value.replace(/\d/g, (digit) => {
    const index = Number(digit);
    return Number.isInteger(index) && index >= 0 && index <= 9 ? map[index]! : digit;
  });
};

export const formatLocalizedNumber = (
  value: number,
  languageCode: string,
  options?: Intl.NumberFormatOptions
): string => {
  try {
    const base = normalizeLanguageCode(languageCode);
    const locale = LOCALE_OVERRIDES[base] ?? languageCode;
    return localizeDigits(new Intl.NumberFormat(locale, options).format(value), languageCode);
  } catch {
    return localizeDigits(String(value), languageCode);
  }
};
