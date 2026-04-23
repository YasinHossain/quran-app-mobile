import type { DownloadProgress, DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITafsirDownloadRepository } from '@/src/domain/repositories/ITafsirDownloadRepository';
import type { ITafsirOfflineStore } from '@/src/domain/repositories/ITafsirOfflineStore';

const IMPORT_BATCH_SIZE = 250;

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const truncated = Math.trunc(value);
  return truncated > 0 ? truncated : 0;
}

function normalizeUniqueIds(value: number[]): number[] {
  const ids = Array.isArray(value) ? value : [];
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const id of ids) {
    const candidate = normalizePositiveInt(id);
    if (candidate <= 0) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }

  return normalized;
}

function toItemsProgress(completed: number, total: number): DownloadProgress {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safeCompleted = Math.min(Math.max(0, Math.trunc(completed)), safeTotal);

  return {
    kind: 'items',
    completed: safeCompleted,
    total: safeTotal,
  };
}

export class DownloadTafsirSurahUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly tafsirDownloadRepository: ITafsirDownloadRepository,
    private readonly tafsirOfflineStore: ITafsirOfflineStore,
    private readonly logger?: ILogger
  ) {}

  async execute(params: {
    surahId: number;
    tafsirIds: number[];
    trackDownloadIndex?: boolean;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<void> {
    const surahId = normalizePositiveInt(params.surahId);
    if (surahId <= 0) {
      throw new Error('surahId must be a positive integer');
    }

    const tafsirIds = normalizeUniqueIds(params.tafsirIds);
    if (tafsirIds.length === 0) {
      throw new Error('tafsirIds must include at least one positive integer');
    }

    const shouldTrackDownloadIndex = params.trackDownloadIndex !== false;
    const failures: Array<{ tafsirId: number; error: Error }> = [];

    for (const tafsirId of tafsirIds) {
      const content: DownloadableContent = { kind: 'tafsir', scope: 'surah', surahId, tafsirId };

      if (shouldTrackDownloadIndex) {
        const existing = await this.downloadIndexRepository.get(content);
        if (existing?.status === 'installed') continue;
      }

      let totalVerses = 0;
      let processedVerses = 0;

      try {
        params.assertNotCanceled?.();

        const verses = await this.tafsirDownloadRepository.getChapterTafsir({ tafsirId, surahId });
        totalVerses = verses.length;

        if (totalVerses <= 0) {
          throw new Error(`No tafsir content found for surah ${surahId}`);
        }

        if (shouldTrackDownloadIndex) {
          await this.downloadIndexRepository.upsert(content, {
            status: 'queued',
            progress: toItemsProgress(0, totalVerses),
            error: null,
          });

          await this.downloadIndexRepository.upsert(content, {
            status: 'downloading',
            progress: toItemsProgress(0, totalVerses),
            error: null,
          });
        }

        for (let start = 0; start < verses.length; start += IMPORT_BATCH_SIZE) {
          params.assertNotCanceled?.();

          const batch = verses.slice(start, start + IMPORT_BATCH_SIZE);
          await this.tafsirOfflineStore.upsertRows(
            batch.map((verse) => ({
              tafsirId,
              verseKey: verse.verseKey,
              html: verse.html,
            }))
          );

          processedVerses += batch.length;

          if (shouldTrackDownloadIndex) {
            await this.downloadIndexRepository.upsert(content, {
              status: 'downloading',
              progress: toItemsProgress(processedVerses, totalVerses),
              error: null,
            });
          }
        }

        params.assertNotCanceled?.();

        if (shouldTrackDownloadIndex) {
          await this.downloadIndexRepository.upsert(content, {
            status: 'installed',
            progress: null,
            error: null,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (shouldTrackDownloadIndex) {
          await this.downloadIndexRepository.upsert(content, {
            status: 'failed',
            progress: totalVerses > 0 ? toItemsProgress(processedVerses, totalVerses) : null,
            error: errorMessage,
          });
        }

        const errorObject = error instanceof Error ? error : new Error(errorMessage);
        failures.push({ tafsirId, error: errorObject });
        this.logger?.warn(
          'Failed to download surah tafsir',
          { surahId, tafsirId, processedVerses, totalVerses },
          errorObject
        );
      }
    }

    if (failures.length > 0) {
      const failingIds = failures.map((failure) => failure.tafsirId).join(', ');
      throw new Error(`Failed to download tafsir IDs [${failingIds}] for surah ${surahId}`);
    }
  }
}
