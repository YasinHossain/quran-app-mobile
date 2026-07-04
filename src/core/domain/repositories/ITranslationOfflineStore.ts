export type OfflineVerseRowInput = {
  verseKey: string;
  surahId: number;
  ayahNumber: number;
  arabicUthmani: string;
  wordsJson?: string;
};

export type OfflineWordTranslationRowInput = OfflineVerseRowInput & {
  languageCode: string;
};

export type OfflineTranslationRowInput = {
  translationId: number;
  verseKey: string;
  text: string;
};

export type OfflineVerseWithTranslations = {
  verseKey: string;
  surahId: number;
  ayahNumber: number;
  arabicUthmani: string;
  translations: Array<{ translationId: number; text: string }>;
  wordsJson?: string;
};

export interface ITranslationOfflineStore {
  upsertVersesAndTranslations(params: {
    verses: OfflineVerseRowInput[];
    translations: OfflineTranslationRowInput[];
  }): Promise<void>;

  upsertWordTranslations(params: {
    languageCode: string;
    verses: OfflineVerseRowInput[];
  }): Promise<void>;

  getSurahVersesWithTranslations(
    surahId: number,
    translationIds: number[],
    wordLang?: string
  ): Promise<OfflineVerseWithTranslations[]>;

  getSurahVersesPageWithTranslations(params: {
    surahId: number;
    translationIds: number[];
    page: number;
    perPage: number;
    wordLang?: string;
  }): Promise<OfflineVerseWithTranslations[]>;

  getJuzVersesPageWithTranslations(params: {
    juzId: number;
    translationIds: number[];
    page: number;
    perPage: number;
    wordLang?: string;
  }): Promise<OfflineVerseWithTranslations[]>;

  getVerseWithTranslations(
    verseKey: string,
    translationIds: number[],
    wordLang?: string
  ): Promise<OfflineVerseWithTranslations | null>;

  deleteTranslation(translationId: number): Promise<void>;

  deleteWordTranslation(languageCode?: string): Promise<void>;
}
