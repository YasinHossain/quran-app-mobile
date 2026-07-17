import { DownloadIndexRepository } from '@/src/core/infrastructure/repositories/DownloadIndexRepository';
import { TranslationOfflineStore } from '@/src/core/infrastructure/offline/TranslationOfflineStore';
import { TafsirOfflineStore } from '@/src/core/infrastructure/offline/TafsirOfflineStore';
import { QuranComTranslationDownloadRepository } from '@/src/core/infrastructure/repositories/QuranComTranslationDownloadRepository';
import { QuranComTafsirDownloadRepository } from '@/src/core/infrastructure/repositories/QuranComTafsirDownloadRepository';
import { TafsirRepository } from '@/src/core/infrastructure/repositories/TafsirRepository';
import { QuranComChapterVerseKeysRepository } from '@/src/core/infrastructure/repositories/QuranComChapterVerseKeysRepository';
import { AudioDownloadManager } from '@/src/core/infrastructure/audio/AudioDownloadManager';
import { MushafPackInstallRegistry } from '@/src/core/infrastructure/mushaf/MushafPackInstallRegistry';
import { MushafPackCatalogClient } from '@/src/core/infrastructure/mushaf/MushafPackCatalogClient';
import { MushafPackFileStore } from '@/src/core/infrastructure/mushaf/MushafPackFileStore';
import { MushafPackInstaller } from '@/src/core/infrastructure/mushaf/MushafPackInstaller';
import { LocalMushafPageRepository } from '@/src/core/infrastructure/mushaf/LocalMushafPageRepository';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { HostedTranslationPackRepository } from '@/src/core/infrastructure/translations/HostedTranslationPackRepository';
import { HostedTafsirPackRepository } from '@/src/core/infrastructure/tafsir/HostedTafsirPackRepository';
import { HostedWordTranslationPackRepository } from '@/src/core/infrastructure/word-translations/HostedWordTranslationPackRepository';
import {
  GetVerseWordAnalyses,
  GetVerseGrammar,
  GetWordAnalysis,
  ListWordOccurrences,
} from '@/src/core/application/use-cases/word-study';
import {
  ExpoGrammarStudyDatabaseProvider,
  SQLiteGrammarStudyRepository,
} from '@/src/core/infrastructure/word-grammar';
import {
  ExpoWordStudyDatabaseProvider,
  ExpoWordStudyPackBackend,
  SQLiteWordStudyRepository,
  WordStudyPackCatalogClient,
  WordStudyPackLifecycle,
} from '@/src/core/infrastructure/word-study';

const downloadIndexRepository = new DownloadIndexRepository();
const tafsirRepository = new TafsirRepository();
const translationOfflineStore = new TranslationOfflineStore();
const tafsirOfflineStore = new TafsirOfflineStore();
const translationDownloadRepository = new QuranComTranslationDownloadRepository();
const tafsirDownloadRepository = new QuranComTafsirDownloadRepository();
const translationPackRepository = new HostedTranslationPackRepository(translationOfflineStore, logger);
const wordTranslationPackRepository = new HostedWordTranslationPackRepository(
  translationOfflineStore,
  logger
);
const tafsirPackRepository = new HostedTafsirPackRepository(tafsirOfflineStore, logger);
const chapterVerseKeysRepository = new QuranComChapterVerseKeysRepository();
const audioDownloadManager = new AudioDownloadManager(downloadIndexRepository);
const mushafPackInstallRegistry = new MushafPackInstallRegistry();
const mushafPackCatalogClient = new MushafPackCatalogClient();
const mushafPackFileStore = new MushafPackFileStore();
const mushafPackInstaller = new MushafPackInstaller(
  mushafPackFileStore,
  mushafPackInstallRegistry,
  downloadIndexRepository,
  logger
);
const mushafPageRepository = new LocalMushafPageRepository(
  mushafPackInstallRegistry,
  mushafPackFileStore
);
const wordStudyPackBackend = new ExpoWordStudyPackBackend();
const wordStudyPackLifecycle = new WordStudyPackLifecycle(wordStudyPackBackend);
const wordStudyDatabaseProvider = new ExpoWordStudyDatabaseProvider(wordStudyPackLifecycle);
const wordStudyRepository = new SQLiteWordStudyRepository(wordStudyDatabaseProvider);
const wordStudyPackCatalogClient = new WordStudyPackCatalogClient();
const getWordAnalysis = new GetWordAnalysis(wordStudyRepository);
const getVerseWordAnalyses = new GetVerseWordAnalyses(wordStudyRepository);
const listWordOccurrences = new ListWordOccurrences(wordStudyRepository);
const grammarStudyDatabaseProvider = new ExpoGrammarStudyDatabaseProvider();
const grammarStudyRepository = new SQLiteGrammarStudyRepository(grammarStudyDatabaseProvider);
const getVerseGrammar = new GetVerseGrammar(grammarStudyRepository);

export const container = {
  getDownloadIndexRepository: (): DownloadIndexRepository => downloadIndexRepository,
  getTafsirRepository: (): TafsirRepository => tafsirRepository,
  getTranslationOfflineStore: (): TranslationOfflineStore => translationOfflineStore,
  getTafsirOfflineStore: (): TafsirOfflineStore => tafsirOfflineStore,
  getTranslationDownloadRepository: (): QuranComTranslationDownloadRepository =>
    translationDownloadRepository,
  getTafsirDownloadRepository: (): QuranComTafsirDownloadRepository => tafsirDownloadRepository,
  getTranslationPackRepository: (): HostedTranslationPackRepository => translationPackRepository,
  getWordTranslationPackRepository: (): HostedWordTranslationPackRepository =>
    wordTranslationPackRepository,
  getTafsirPackRepository: (): HostedTafsirPackRepository => tafsirPackRepository,
  getChapterVerseKeysRepository: (): QuranComChapterVerseKeysRepository => chapterVerseKeysRepository,
  getAudioDownloadManager: (): AudioDownloadManager => audioDownloadManager,
  getMushafPackInstallRegistry: (): MushafPackInstallRegistry => mushafPackInstallRegistry,
  getMushafPackCatalogClient: (): MushafPackCatalogClient => mushafPackCatalogClient,
  getMushafPackFileStore: (): MushafPackFileStore => mushafPackFileStore,
  getMushafPackInstaller: (): MushafPackInstaller => mushafPackInstaller,
  getMushafPageRepository: (): LocalMushafPageRepository => mushafPageRepository,
  getWordStudyRepository: (): SQLiteWordStudyRepository => wordStudyRepository,
  getWordStudyPackLifecycle: (): WordStudyPackLifecycle => wordStudyPackLifecycle,
  getWordStudyDatabaseProvider: (): ExpoWordStudyDatabaseProvider => wordStudyDatabaseProvider,
  getWordStudyPackCatalogClient: (): WordStudyPackCatalogClient => wordStudyPackCatalogClient,
  getWordAnalysis: (): GetWordAnalysis => getWordAnalysis,
  getVerseWordAnalyses: (): GetVerseWordAnalyses => getVerseWordAnalyses,
  listWordOccurrences: (): ListWordOccurrences => listWordOccurrences,
  getGrammarStudyRepository: (): SQLiteGrammarStudyRepository => grammarStudyRepository,
  getGrammarStudyDatabaseProvider: (): ExpoGrammarStudyDatabaseProvider =>
    grammarStudyDatabaseProvider,
  getVerseGrammar: (): GetVerseGrammar => getVerseGrammar,
};
