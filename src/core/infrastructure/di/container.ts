import { DownloadIndexRepository } from '@/src/core/infrastructure/repositories/DownloadIndexRepository';
import { TranslationOfflineStore } from '@/src/core/infrastructure/offline/TranslationOfflineStore';
import { QuranComTranslationDownloadRepository } from '@/src/core/infrastructure/repositories/QuranComTranslationDownloadRepository';
import { TafsirRepository } from '@/src/core/infrastructure/repositories/TafsirRepository';
import { QuranComChapterVerseKeysRepository } from '@/src/core/infrastructure/repositories/QuranComChapterVerseKeysRepository';

const downloadIndexRepository = new DownloadIndexRepository();
const tafsirRepository = new TafsirRepository();
const translationOfflineStore = new TranslationOfflineStore();
const translationDownloadRepository = new QuranComTranslationDownloadRepository();
const chapterVerseKeysRepository = new QuranComChapterVerseKeysRepository();

export const container = {
  getDownloadIndexRepository: (): DownloadIndexRepository => downloadIndexRepository,
  getTafsirRepository: (): TafsirRepository => tafsirRepository,
  getTranslationOfflineStore: (): TranslationOfflineStore => translationOfflineStore,
  getTranslationDownloadRepository: (): QuranComTranslationDownloadRepository =>
    translationDownloadRepository,
  getChapterVerseKeysRepository: (): QuranComChapterVerseKeysRepository => chapterVerseKeysRepository,
};
