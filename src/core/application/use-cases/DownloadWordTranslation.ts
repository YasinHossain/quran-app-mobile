import type { DownloadProgress, DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITranslationDownloadRepository } from '@/src/domain/repositories/ITranslationDownloadRepository';
import type {
  ITranslationOfflineStore,
  OfflineVerseRowInput,
} from '@/src/domain/repositories/ITranslationOfflineStore';

const TOTAL_SURAHS = 114;
const DEFAULT_PER_PAGE = 50;
const CANCELED_ERROR_CODE = 'word_download_canceled';
const canceledLanguageCodes = new Set<string>();

class WordDownloadCanceledError extends Error {
  readonly code = CANCELED_ERROR_CODE;

  constructor(readonly languageCode: string) {
    super('Word translation download canceled');
    this.name = 'WordDownloadCanceledError';
  }
}

function throwIfCanceled(languageCode: string): void {
  if (!canceledLanguageCodes.has(languageCode)) return;
  throw new WordDownloadCanceledError(languageCode);
}

export function requestWordDownloadCancel(languageCode: string): void {
  const normalized = languageCode.trim().toLowerCase();
  if (!normalized) return;
  canceledLanguageCodes.add(normalized);
}

export function isWordDownloadCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { code?: unknown }).code === CANCELED_ERROR_CODE) return true;
  return error.name === 'WordDownloadCanceledError';
}

export class DownloadWordTranslationUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly translationOfflineStore: ITranslationOfflineStore,
    private readonly translationDownloadRepository: ITranslationDownloadRepository,
    private readonly logger?: ILogger
  ) {}

  async execute(languageCode: string): Promise<void> {
    const normalizedCode = languageCode.trim().toLowerCase();
    if (!normalizedCode) {
      throw new Error('languageCode must be non-empty');
    }

    canceledLanguageCodes.delete(normalizedCode);

    const content: DownloadableContent = {
      kind: 'word-translation',
      languageCode: normalizedCode,
    };

    const existing = await this.downloadIndexRepository.get(content);
    if (existing?.status === 'installed') return;

    let completedSurahs = 0;

    const toDownloadProgress = (completed: number): DownloadProgress => ({
      kind: 'items',
      completed: Math.min(Math.max(0, completed), TOTAL_SURAHS),
      total: TOTAL_SURAHS,
    });

    await this.downloadIndexRepository.upsert(content, {
      status: 'queued',
      progress: toDownloadProgress(0),
      error: null,
    });

    await this.downloadIndexRepository.upsert(content, {
      status: 'downloading',
      progress: toDownloadProgress(0),
      error: null,
    });

    try {
      for (let surahId = 1; surahId <= TOTAL_SURAHS; surahId += 1) {
        throwIfCanceled(normalizedCode);
        await this.downloadSurahWords({
          surahId,
          languageCode: normalizedCode,
        });

        throwIfCanceled(normalizedCode);
        completedSurahs = surahId;
        await this.downloadIndexRepository.upsert(content, {
          status: 'downloading',
          progress: toDownloadProgress(completedSurahs),
          error: null,
        });
      }

      throwIfCanceled(normalizedCode);
      await this.downloadIndexRepository.upsert(content, {
        status: 'installed',
        progress: null,
        error: null,
      });
    } catch (error) {
      if (isWordDownloadCanceledError(error)) {
        try {
          await this.translationOfflineStore.deleteWordTranslation();
        } catch (cleanupError) {
          this.logger?.warn(
            'Failed to clean up word translation after cancellation',
            { languageCode: normalizedCode },
            cleanupError as Error
          );
        }

        await this.downloadIndexRepository.remove(content);
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: toDownloadProgress(completedSurahs),
        error: errorMessage,
      });

      try {
        await this.translationOfflineStore.deleteWordTranslation();
      } catch (cleanupError) {
        this.logger?.warn(
          'Failed to clean up word translation after a download failure',
          { languageCode: normalizedCode },
          cleanupError as Error
        );
      }

      throw error;
    } finally {
      canceledLanguageCodes.delete(normalizedCode);
    }
  }

  private async downloadSurahWords(params: {
    surahId: number;
    languageCode: string;
  }): Promise<void> {
    const { surahId, languageCode } = params;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      throwIfCanceled(languageCode);
      const response = await this.translationDownloadRepository.getChapterVersesPage({
        chapterNumber: surahId,
        page,
        perPage: DEFAULT_PER_PAGE,
        wordLang: languageCode,
      });

      throwIfCanceled(languageCode);

      const verseRows: OfflineVerseRowInput[] = response.verses.map((verse) => ({
        verseKey: verse.verseKey,
        surahId,
        ayahNumber: verse.ayahNumber,
        arabicUthmani: verse.arabicUthmani,
        wordsJson: verse.wordsJson,
      }));

      await this.translationOfflineStore.upsertVersesAndTranslations({
        verses: verseRows,
        translations: [],
      });

      totalPages = Math.max(1, response.pagination?.totalPages ?? totalPages);
      page += 1;
    }
  }
}
