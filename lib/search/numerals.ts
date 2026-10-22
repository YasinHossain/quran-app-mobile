const SUPPORTED_NON_ASCII_NUMERAL_PATTERN =
  /[\u0660-\u0669\u06F0-\u06F9\u09E6-\u09EF\u0966-\u096F]/g;

const UNSUPPORTED_NUMERIC_INPUT_PATTERN =
  /[^\d\u0660-\u0669\u06F0-\u06F9\u09E6-\u09EF\u0966-\u096F]/g;

const DECIMAL_DIGIT_RANGES = [
  { start: 0x0660, end: 0x0669 },
  { start: 0x06f0, end: 0x06f9 },
  { start: 0x09e6, end: 0x09ef },
  { start: 0x0966, end: 0x096f },
] as const;

/**
 * Converts common localized decimal numerals to ASCII so numeric search does
 * not depend on the currently selected display language or keyboard script.
 */
export function normalizeNumeralsToAscii(input: string): string {
  return input.replace(SUPPORTED_NON_ASCII_NUMERAL_PATTERN, (digit) => {
    const codePoint = digit.codePointAt(0);
    if (codePoint === undefined) return digit;

    const range = DECIMAL_DIGIT_RANGES.find(
      ({ start, end }) => codePoint >= start && codePoint <= end
    );

    return range ? String(codePoint - range.start) : digit;
  });
}

/**
 * Keeps decimal numerals accepted by numeric selectors while preserving the
 * script the user typed, so the input does not unexpectedly rewrite itself.
 */
export function sanitizeNumeralInput(input: string): string {
  return input.replace(UNSUPPORTED_NUMERIC_INPUT_PATTERN, '');
}
