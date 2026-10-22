import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import type { IChapterVerseKeysRepository } from '@/src/domain/repositories/IChapterVerseKeysRepository';

type ApiVerse = {
  verse_key: string;
};

type ApiVersesResponse = {
  verses: ApiVerse[];
  pagination: { current_page: number; total_pages: number; per_page: number };
};

const DEFAULT_PER_PAGE = 50;

function toPositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const truncated = Math.trunc(value);
  return truncated > 0 ? truncated : 0;
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export class QuranComChapterVerseKeysRepository implements IChapterVerseKeysRepository {
  async getChapterVerseKeys(chapterNumber: number): Promise<string[]> {
    const normalizedChapterNumber = toPositiveInt(chapterNumber);
    if (normalizedChapterNumber <= 0) return [];

    const collected: string[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await apiFetch<ApiVersesResponse>(
        `/verses/by_chapter/${normalizedChapterNumber}`,
        {
          language: 'en',
          words: 'false',
          per_page: String(DEFAULT_PER_PAGE),
          page: String(page),
        },
        'Failed to load chapter verses'
      );

      collected.push(...(response.verses ?? []).map((verse) => verse.verse_key ?? ''));
      totalPages = Math.max(1, response.pagination?.total_pages ?? totalPages);
      page += 1;
    }

    return dedupePreserveOrder(collected);
  }
}

