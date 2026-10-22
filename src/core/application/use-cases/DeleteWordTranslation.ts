import type { DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITranslationOfflineStore } from '@/src/domain/repositories/ITranslationOfflineStore';

export class DeleteWordTranslationUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly translationOfflineStore: ITranslationOfflineStore,
    private readonly logger?: ILogger
  ) {}

  async execute(languageCode: string): Promise<void> {
    const normalizedCode = languageCode.trim().toLowerCase();
    if (!normalizedCode) {
      throw new Error('languageCode must be non-empty');
    }

    const content: DownloadableContent = {
      kind: 'word-translation',
      languageCode: normalizedCode,
    };

    await this.downloadIndexRepository.upsert(content, {
      status: 'deleting',
      progress: null,
      error: null,
    });

    try {
      await this.translationOfflineStore.deleteWordTranslation(normalizedCode);
      await this.downloadIndexRepository.remove(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        'Failed to delete word translation',
        { languageCode: normalizedCode },
        error as Error
      );
      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        error: errorMessage,
      });
      throw error;
    }
  }
}
