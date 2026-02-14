import type { DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITranslationOfflineStore } from '@/src/domain/repositories/ITranslationOfflineStore';

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

export class DeleteTranslationUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly translationOfflineStore: ITranslationOfflineStore,
    private readonly logger?: ILogger
  ) {}

  async execute(translationId: number): Promise<void> {
    const normalizedTranslationId = normalizeId(translationId);
    if (normalizedTranslationId <= 0) {
      throw new Error('translationId must be a positive integer');
    }

    const content: DownloadableContent = {
      kind: 'translation',
      translationId: normalizedTranslationId,
    };

    await this.downloadIndexRepository.upsert(content, {
      status: 'deleting',
      progress: null,
      error: null,
    });

    try {
      await this.translationOfflineStore.deleteTranslation(normalizedTranslationId);
      await this.downloadIndexRepository.remove(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger?.warn('Failed to delete offline translation', { translationId: normalizedTranslationId }, error as Error);
      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: errorMessage,
      });

      throw error;
    }
  }
}

