import type { DownloadProgress, DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IChapterVerseKeysRepository } from '@/src/domain/repositories/IChapterVerseKeysRepository';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITafsirRepository } from '@/src/domain/repositories/ITafsirRepository';

const REPORT_PROGRESS_EVERY_ITEMS = 5;

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
    private readonly tafsirRepository: ITafsirRepository,
    private readonly chapterVerseKeysRepository: IChapterVerseKeysRepository,
    private readonly logger?: ILogger
  ) {}

  async execute(params: { surahId: number; tafsirIds: number[] }): Promise<void> {
    const surahId = normalizePositiveInt(params.surahId);
    if (surahId <= 0) {
      throw new Error('surahId must be a positive integer');
    }

    const tafsirIds = normalizeUniqueIds(params.tafsirIds);
    if (tafsirIds.length === 0) {
      throw new Error('tafsirIds must include at least one positive integer');
    }

    let verseKeys: string[] = [];

    try {
      verseKeys = await this.chapterVerseKeysRepository.getChapterVerseKeys(surahId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      for (const tafsirId of tafsirIds) {
        const content: DownloadableContent = { kind: 'tafsir', scope: 'surah', surahId, tafsirId };
        await this.downloadIndexRepository.upsert(content, {
          status: 'failed',
          progress: null,
          error: errorMessage,
        });
      }

      throw error;
    }

    const totalVerses = verseKeys.length;
    if (totalVerses <= 0) {
      const message = `No verses found for surah ${surahId}`;
      for (const tafsirId of tafsirIds) {
        const content: DownloadableContent = { kind: 'tafsir', scope: 'surah', surahId, tafsirId };
        await this.downloadIndexRepository.upsert(content, {
          status: 'failed',
          progress: null,
          error: message,
        });
      }
      throw new Error(message);
    }

    const failures: Array<{ tafsirId: number; error: Error }> = [];

    for (const tafsirId of tafsirIds) {
      const content: DownloadableContent = { kind: 'tafsir', scope: 'surah', surahId, tafsirId };

      const existing = await this.downloadIndexRepository.get(content);
      if (existing?.status === 'installed') continue;

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

      let completedVerses = 0;
      let lastReportedCompletedVerses = 0;

      try {
        for (const verseKey of verseKeys) {
          await this.tafsirRepository.getTafsirByVerse(verseKey, tafsirId);
          completedVerses += 1;

          const shouldReportProgress =
            completedVerses === totalVerses ||
            completedVerses - lastReportedCompletedVerses >= REPORT_PROGRESS_EVERY_ITEMS;

          if (shouldReportProgress) {
            lastReportedCompletedVerses = completedVerses;
            await this.downloadIndexRepository.upsert(content, {
              status: 'downloading',
              progress: toItemsProgress(completedVerses, totalVerses),
              error: null,
            });
          }
        }

        await this.downloadIndexRepository.upsert(content, {
          status: 'installed',
          progress: null,
          error: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        await this.downloadIndexRepository.upsert(content, {
          status: 'failed',
          progress: toItemsProgress(completedVerses, totalVerses),
          error: errorMessage,
        });

        const errorObject = error instanceof Error ? error : new Error(errorMessage);
        failures.push({ tafsirId, error: errorObject });
        this.logger?.warn(
          'Failed to download surah tafsir',
          { surahId, tafsirId, completedVerses, totalVerses },
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

