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
  readingMode?: 'translations' | 'mushaf';
  /**
   * Language used when querying Quran content resources, such as translation lists.
   */
  contentLanguage?: string;
  /**
   * Language used for app chrome/settings labels.
   */
  uiLanguage?: string;
}
