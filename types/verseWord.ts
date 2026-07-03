/**
 * A single Quran word token with optional word-by-word translation text.
 *
 * This is used by the mobile verse renderer to support word-by-word mode and
 * tap-to-show word translations.
 */
export interface VerseWord {
  id: number;
  uthmani: string;
  codeV2?: string;
  pageNumber?: number;
  translationText?: string;
  charTypeName?: string;
  position?: number;
}
