export type OfflineVerseRowInput = {
  verseKey: string;
  surahId: number;
  ayahNumber: number;
  arabicUthmani: string;
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
};

export interface ITranslationOfflineStore {
  upsertVersesAndTranslations(params: {
    verses: OfflineVerseRowInput[];
    translations: OfflineTranslationRowInput[];
  }): Promise<void>;

  getSurahVersesWithTranslations(
    surahId: number,
    translationIds: number[]
  ): Promise<OfflineVerseWithTranslations[]>;

  getSurahVersesPageWithTranslations(params: {
    surahId: number;
    translationIds: number[];
    page: number;
    perPage: number;
  }): Promise<OfflineVerseWithTranslations[]>;

  deleteTranslation(translationId: number): Promise<void>;
}
