import type { DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITafsirOfflineStore } from '@/src/domain/repositories/ITafsirOfflineStore';

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

export class DeleteTafsirUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly tafsirOfflineStore: ITafsirOfflineStore,
    private readonly logger?: ILogger
  ) {}

  async execute(tafsirId: number): Promise<void> {
    const normalizedTafsirId = normalizeId(tafsirId);
    if (normalizedTafsirId <= 0) {
      throw new Error('tafsirId must be a positive integer');
    }

    const content: DownloadableContent = {
      kind: 'tafsir',
      tafsirId: normalizedTafsirId,
    };

    await this.downloadIndexRepository.upsert(content, {
      status: 'deleting',
      progress: null,
      error: null,
    });

    try {
      await this.tafsirOfflineStore.deleteTafsir(normalizedTafsirId);

      const items = await this.downloadIndexRepository.list();
      const removals = items
        .filter((item) => item.content.kind === 'tafsir' && item.content.tafsirId === normalizedTafsirId)
        .map((item) => this.downloadIndexRepository.remove(item.content));

      await Promise.all(removals);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger?.warn('Failed to delete offline tafsir', { tafsirId: normalizedTafsirId }, error as Error);
      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: errorMessage,
      });

      throw error;
    }
  }
}
