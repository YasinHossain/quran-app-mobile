import type { DownloadProgress, DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITranslationOfflineStore } from '@/src/domain/repositories/ITranslationOfflineStore';
import type { IWordTranslationPackRepository } from '@/src/core/domain/repositories/IWordTranslationPackRepository';

const TOTAL_SURAHS = 114;
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
    private readonly logger?: ILogger,
    private readonly wordTranslationPackRepository?: IWordTranslationPackRepository
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
      let lastPersistedPackPercent = -1;
      const installedFromPack = await this.wordTranslationPackRepository?.installPack({
        languageCode: normalizedCode,
        assertNotCanceled: () => {
          throwIfCanceled(normalizedCode);
        },
        onProgress: (progress) => {
          const normalizedPercent = Math.max(0, Math.min(100, progress.percent));
          const persistedPercent =
            normalizedPercent >= 100 ? 100 : Math.floor(normalizedPercent / 4) * 4;

          if (persistedPercent === lastPersistedPackPercent) return;
          lastPersistedPackPercent = persistedPercent;

          void this.downloadIndexRepository.upsert(content, {
            status: 'downloading',
            progress: { kind: 'percent', percent: persistedPercent },
            error: null,
          });
        },
      });

      if (installedFromPack) {
        throwIfCanceled(normalizedCode);
        await this.downloadIndexRepository.upsert(content, {
          status: 'installed',
          progress: null,
          error: null,
        });
        return;
      }

      throw new Error(
        `Offline word-by-word pack is not available for language "${normalizedCode}". Run npm run generate:word-translation-packs and publish dist/word-translation-packs before enabling this download.`
      );
    } catch (error) {
      if (isWordDownloadCanceledError(error)) {
        try {
          await this.translationOfflineStore.deleteWordTranslation(normalizedCode);
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
        await this.translationOfflineStore.deleteWordTranslation(normalizedCode);
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
}
