export interface TafsirDownloadVerse {
  verseKey: string;
  html: string;
}

export interface ITafsirDownloadRepository {
  getChapterTafsir(params: { tafsirId: number; surahId: number }): Promise<TafsirDownloadVerse[]>;
}
