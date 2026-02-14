export type ChapterTranslationVerse = {
  verseKey: string;
  ayahNumber: number;
  arabicUthmani: string;
  translationText: string;
};

export type ChapterTranslationVersesPage = {
  verses: ChapterTranslationVerse[];
  pagination: {
    currentPage: number;
    totalPages: number;
    perPage: number;
  };
};

export interface ITranslationDownloadRepository {
  getChapterVersesPage(params: {
    chapterNumber: number;
    translationId: number;
    page: number;
    perPage: number;
  }): Promise<ChapterTranslationVersesPage>;
}

