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

const downloadIndexRepository = new DownloadIndexRepository();
const tafsirRepository = new TafsirRepository();
const translationOfflineStore = new TranslationOfflineStore();
const tafsirOfflineStore = new TafsirOfflineStore();
const translationDownloadRepository = new QuranComTranslationDownloadRepository();
const tafsirDownloadRepository = new QuranComTafsirDownloadRepository();
const translationPackRepository = new HostedTranslationPackRepository(translationOfflineStore, logger);
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

export const container = {
  getDownloadIndexRepository: (): DownloadIndexRepository => downloadIndexRepository,
  getTafsirRepository: (): TafsirRepository => tafsirRepository,
  getTranslationOfflineStore: (): TranslationOfflineStore => translationOfflineStore,
  getTafsirOfflineStore: (): TafsirOfflineStore => tafsirOfflineStore,
  getTranslationDownloadRepository: (): QuranComTranslationDownloadRepository =>
    translationDownloadRepository,
  getTafsirDownloadRepository: (): QuranComTafsirDownloadRepository => tafsirDownloadRepository,
  getTranslationPackRepository: (): HostedTranslationPackRepository => translationPackRepository,
  getTafsirPackRepository: (): HostedTafsirPackRepository => tafsirPackRepository,
  getChapterVerseKeysRepository: (): QuranComChapterVerseKeysRepository => chapterVerseKeysRepository,
  getAudioDownloadManager: (): AudioDownloadManager => audioDownloadManager,
  getMushafPackInstallRegistry: (): MushafPackInstallRegistry => mushafPackInstallRegistry,
  getMushafPackCatalogClient: (): MushafPackCatalogClient => mushafPackCatalogClient,
  getMushafPackFileStore: (): MushafPackFileStore => mushafPackFileStore,
  getMushafPackInstaller: (): MushafPackInstaller => mushafPackInstaller,
  getMushafPageRepository: (): LocalMushafPageRepository => mushafPageRepository,
};
