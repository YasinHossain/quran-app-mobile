import type { MushafPackId, MushafScaleStep } from './mushaf';

/**
 * User preferences controlling fonts, translations and reading options.
 */
export interface Settings {
  translationId: number;
  translationIds: number[];
  tafsirIds: number[];
  arabicFontSize: number;
  translationFontSize: number;
  tafsirFontSize: number;
  arabicFontFace: string;
  wordLang: string;
  wordTranslationId: number;
  showByWords: boolean;
  tajweed: boolean;
  mushafId?: MushafPackId;
  mushafScaleStep: MushafScaleStep;
  /**
   * The UI language code that was last used to apply language-specific defaults
   * for translations, tafsir and word-by-word settings.
   */
  contentLanguage?: string;
}
