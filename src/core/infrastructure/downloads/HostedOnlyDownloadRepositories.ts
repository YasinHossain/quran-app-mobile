import type {
  ChapterTranslationVersesPage,
  ITranslationDownloadRepository,
} from '@/src/core/domain/repositories/ITranslationDownloadRepository';
import type {
  ITafsirDownloadRepository,
  TafsirDownloadVerse,
} from '@/src/core/domain/repositories/ITafsirDownloadRepository';

const HOSTED_ONLY_MESSAGE =
  'This offline resource is not available on the configured download host. API fallback is disabled.';

export class HostedOnlyTranslationDownloadRepository implements ITranslationDownloadRepository {
  async getChapterVersesPage(
    _params: Parameters<ITranslationDownloadRepository['getChapterVersesPage']>[0]
  ): Promise<ChapterTranslationVersesPage> {
    throw new Error(HOSTED_ONLY_MESSAGE);
  }
}

export class HostedOnlyTafsirDownloadRepository implements ITafsirDownloadRepository {
  async getChapterTafsir(
    _params: Parameters<ITafsirDownloadRepository['getChapterTafsir']>[0]
  ): Promise<TafsirDownloadVerse[]> {
    throw new Error(HOSTED_ONLY_MESSAGE);
  }
}
