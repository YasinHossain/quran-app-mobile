import type { DownloadProgress, DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITafsirOfflineStore } from '@/src/domain/repositories/ITafsirOfflineStore';
import type { ITafsirPackRepository } from '@/src/domain/repositories/ITafsirPackRepository';

import { DownloadTafsirSurahUseCase } from './DownloadTafsirSurah';

const TOTAL_SURAHS = 114;
const REQUEST_DELAY_MS = 200;
const CANCELED_ERROR_CODE = 'tafsir_download_canceled';
const canceledTafsirIds = new Set<number>();

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

class TafsirDownloadCanceledError extends Error {
  readonly code = CANCELED_ERROR_CODE;

  constructor(readonly tafsirId: number) {
    super('Tafsir download canceled');
    this.name = 'TafsirDownloadCanceledError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfCanceled(tafsirId: number): void {
  if (!canceledTafsirIds.has(tafsirId)) return;
  throw new TafsirDownloadCanceledError(tafsirId);
}

function toDownloadProgress(completedSurahs: number): DownloadProgress {
  return {
    kind: 'items',
    completed: Math.min(Math.max(0, completedSurahs), TOTAL_SURAHS),
    total: TOTAL_SURAHS,
  };
}

export function requestTafsirDownloadCancel(tafsirId: number): void {
  const normalizedTafsirId = normalizeId(tafsirId);
  if (normalizedTafsirId <= 0) return;
  canceledTafsirIds.add(normalizedTafsirId);
}

export function isTafsirDownloadCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { code?: unknown }).code === CANCELED_ERROR_CODE) return true;
  return error.name === 'TafsirDownloadCanceledError';
}

export class DownloadFullTafsirUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly downloadTafsirSurahUseCase: DownloadTafsirSurahUseCase,
    private readonly tafsirOfflineStore: ITafsirOfflineStore,
    private readonly logger?: ILogger,
    private readonly tafsirPackRepository?: ITafsirPackRepository
  ) {}

  async execute(tafsirId: number): Promise<void> {
    const normalizedTafsirId = normalizeId(tafsirId);
    if (normalizedTafsirId <= 0) {
      throw new Error('tafsirId must be a positive integer');
    }

    canceledTafsirIds.delete(normalizedTafsirId);

    const content: DownloadableContent = {
      kind: 'tafsir',
      tafsirId: normalizedTafsirId,
    };

    const existing = await this.downloadIndexRepository.get(content);
    if (existing?.status === 'installed') return;

    let completedSurahs = 0;

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
      const installedFromPack = await this.tafsirPackRepository?.installPack({
        tafsirId: normalizedTafsirId,
        assertNotCanceled: () => {
          throwIfCanceled(normalizedTafsirId);
        },
        onProgress: (progress) => {
          const normalizedPercent = Math.max(0, Math.min(100, progress.percent));
          const persistedPercent =
            normalizedPercent >= 100 ? 100 : Math.floor(normalizedPercent / 4) * 4;

          if (persistedPercent === lastPersistedPackPercent) return;
          lastPersistedPackPercent = persistedPercent;

          void this.downloadIndexRepository.upsert(content, {
            status: 'downloading',
            progress: {
              kind: 'percent',
              percent: persistedPercent,
            },
            error: null,
          });
        },
      });

      if (installedFromPack) {
        throwIfCanceled(normalizedTafsirId);
        await this.downloadIndexRepository.upsert(content, {
          status: 'installed',
          progress: null,
          error: null,
        });
        return;
      }

      await this.tafsirOfflineStore.deleteTafsir(normalizedTafsirId);

      for (let surahId = 1; surahId <= TOTAL_SURAHS; surahId += 1) {
        throwIfCanceled(normalizedTafsirId);
        await this.downloadTafsirSurahUseCase.execute({
          surahId,
          tafsirIds: [normalizedTafsirId],
          trackDownloadIndex: false,
          assertNotCanceled: () => {
            throwIfCanceled(normalizedTafsirId);
          },
        });

        throwIfCanceled(normalizedTafsirId);
        completedSurahs = surahId;
        await this.downloadIndexRepository.upsert(content, {
          status: 'downloading',
          progress: toDownloadProgress(completedSurahs),
          error: null,
        });

        if (surahId < TOTAL_SURAHS) {
          await sleep(REQUEST_DELAY_MS);
        }
      }

      throwIfCanceled(normalizedTafsirId);
      await this.downloadIndexRepository.upsert(content, {
        status: 'installed',
        progress: null,
        error: null,
      });
    } catch (error) {
      if (isTafsirDownloadCanceledError(error)) {
        try {
          await this.tafsirOfflineStore.deleteTafsir(normalizedTafsirId);
        } catch (cleanupError) {
          this.logger?.warn(
            'Failed to clean up tafsir after cancellation',
            { tafsirId: normalizedTafsirId },
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
        await this.tafsirOfflineStore.deleteTafsir(normalizedTafsirId);
      } catch (cleanupError) {
        this.logger?.warn(
          'Failed to clean up tafsir after a download failure',
          { tafsirId: normalizedTafsirId },
          cleanupError as Error
        );
      }

      throw error;
    } finally {
      canceledTafsirIds.delete(normalizedTafsirId);
    }
  }
}
