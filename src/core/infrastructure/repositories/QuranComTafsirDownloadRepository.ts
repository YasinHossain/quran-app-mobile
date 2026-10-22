import type {
  ITafsirDownloadRepository,
  TafsirDownloadVerse,
} from '@/src/core/domain/repositories/ITafsirDownloadRepository';

import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

type ApiChapterTafsir = {
  resource_id?: number;
  verse_key?: string;
  text?: string;
};

type ApiChapterTafsirResponse = {
  tafsirs?: ApiChapterTafsir[];
};

const DEFAULT_PER_PAGE = 300;

function toPositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

function normalizeTafsirVerses(
  tafsirs: ApiChapterTafsir[] | undefined,
  tafsirId: number
): TafsirDownloadVerse[] {
  return (tafsirs ?? [])
    .map((entry) => {
      const resourceId = toPositiveInt(Number(entry.resource_id ?? tafsirId));
      const verseKey = String(entry.verse_key ?? '').trim();
      const html = typeof entry.text === 'string' ? entry.text : String(entry.text ?? '');

      if (resourceId !== tafsirId || !verseKey) return null;
      return { verseKey, html };
    })
    .filter((entry): entry is TafsirDownloadVerse => entry !== null);
}

export class QuranComTafsirDownloadRepository implements ITafsirDownloadRepository {
  async getChapterTafsir(params: { tafsirId: number; surahId: number }): Promise<TafsirDownloadVerse[]> {
    const tafsirId = toPositiveInt(params.tafsirId);
    const surahId = toPositiveInt(params.surahId);

    if (tafsirId <= 0 || surahId <= 0) {
      throw new Error('tafsirId and surahId must be positive integers');
    }

    try {
      const data = await apiFetch<ApiChapterTafsirResponse>(
        `tafsirs/${tafsirId}/by_chapter/${surahId}`,
        {
          per_page: String(DEFAULT_PER_PAGE),
          page: '1',
        },
        'Failed to fetch tafsir chapter content'
      );

      return normalizeTafsirVerses(data.tafsirs, tafsirId);
    } catch (error) {
      logger.warn(
        'Primary tafsir chapter API failed, trying fallback',
        { tafsirId, surahId },
        error as Error
      );
    }

    const fallbackUrl = `https://api.qurancdn.com/api/qdc/tafsirs/${tafsirId}/by_chapter/${surahId}`;
    const fallbackData = await apiFetch<ApiChapterTafsirResponse>(
      fallbackUrl,
      {
        per_page: String(DEFAULT_PER_PAGE),
        page: '1',
      },
      'Failed to fetch tafsir chapter content'
    );

    return normalizeTafsirVerses(fallbackData.tafsirs, tafsirId);
  }
}
