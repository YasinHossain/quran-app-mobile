import type { DownloadProgress, DownloadableContent } from '@/src/domain/entities';
import type { ILogger } from '@/src/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';
import type { ITranslationDownloadRepository } from '@/src/domain/repositories/ITranslationDownloadRepository';
import type {
  ITranslationOfflineStore,
  OfflineTranslationRowInput,
  OfflineVerseRowInput,
} from '@/src/domain/repositories/ITranslationOfflineStore';

const TOTAL_SURAHS = 114;
const DEFAULT_PER_PAGE = 50;

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function toDownloadProgress(completedSurahs: number): DownloadProgress {
  return {
    kind: 'items',
    completed: Math.min(Math.max(0, completedSurahs), TOTAL_SURAHS),
    total: TOTAL_SURAHS,
  };
}

export class DownloadTranslationUseCase {
  constructor(
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly translationOfflineStore: ITranslationOfflineStore,
    private readonly translationDownloadRepository: ITranslationDownloadRepository,
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
      for (let surahId = 1; surahId <= TOTAL_SURAHS; surahId += 1) {
        await this.downloadSurahTranslation({
          surahId,
          translationId: normalizedTranslationId,
        });

        completedSurahs = surahId;
        await this.downloadIndexRepository.upsert(content, {
          status: 'downloading',
          progress: toDownloadProgress(completedSurahs),
          error: null,
        });
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
        progress: toDownloadProgress(completedSurahs),
        error: errorMessage,
      });

      try {
        await this.translationOfflineStore.deleteTranslation(normalizedTranslationId);
      } catch (cleanupError) {
        this.logger?.warn(
          'Failed to clean up translation after a download failure',
          { translationId: normalizedTranslationId },
          cleanupError as Error
        );
      }

      throw error;
    }
  }

  private async downloadSurahTranslation(params: {
    surahId: number;
    translationId: number;
  }): Promise<void> {
    const surahId = normalizeId(params.surahId);
    const translationId = normalizeId(params.translationId);

    if (surahId <= 0 || translationId <= 0) return;

    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await this.translationDownloadRepository.getChapterVersesPage({
        chapterNumber: surahId,
        translationId,
        page,
        perPage: DEFAULT_PER_PAGE,
      });

      const verseRows: OfflineVerseRowInput[] = response.verses.map((verse) => ({
        verseKey: verse.verseKey,
        surahId,
        ayahNumber: verse.ayahNumber,
        arabicUthmani: verse.arabicUthmani,
      }));

      const translationRows: OfflineTranslationRowInput[] = response.verses.map((verse) => ({
        translationId,
        verseKey: verse.verseKey,
        text: stripHtml(verse.translationText ?? ''),
      }));

      await this.translationOfflineStore.upsertVersesAndTranslations({
        verses: verseRows,
        translations: translationRows,
      });

      totalPages = Math.max(1, response.pagination?.totalPages ?? totalPages);
      page += 1;
    }
  }
}

