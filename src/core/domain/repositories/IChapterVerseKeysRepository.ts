export interface IChapterVerseKeysRepository {
  getChapterVerseKeys(chapterNumber: number): Promise<string[]>;
}

