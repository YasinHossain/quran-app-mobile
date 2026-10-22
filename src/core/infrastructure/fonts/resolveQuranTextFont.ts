export const QPC_UTHMANI_FONT_FAMILY = 'UthmanicHafs1Ver18';
export const QURAN_TEXT_SUPPORT_FONT_FAMILY = 'Scheherazade New';

// U+06DF ARABIC SMALL HIGH ROUNDED ZERO is present in the Uthmani source text,
// but the bundled QPC font has no glyph for it. Keep the source text intact and
// use a Quran-capable fallback for the affected text run, matching Android's
// native reader behavior.
const QPC_UNSUPPORTED_GLYPH = '\u06DF';

export function resolveQuranTextFontFamily(
  text: string,
  requestedFamily: string = QPC_UTHMANI_FONT_FAMILY
): string {
  return requestedFamily.includes(QPC_UTHMANI_FONT_FAMILY)
    && text.includes(QPC_UNSUPPORTED_GLYPH)
    ? QURAN_TEXT_SUPPORT_FONT_FAMILY
    : requestedFamily;
}
