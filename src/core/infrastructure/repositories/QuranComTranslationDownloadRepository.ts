import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import type {
  ChapterTranslationVersesPage,
  ITranslationDownloadRepository,
} from '@/src/domain/repositories/ITranslationDownloadRepository';

type ApiVerse = {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  translations?: Array<{ resource_id: number; text: string }>;
};

type ApiVersesResponse = {
  verses: ApiVerse[];
  pagination: { current_page: number; total_pages: number; per_page: number };
};

function toPositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const truncated = Math.trunc(value);
  return truncated > 0 ? truncated : 0;
}

export class QuranComTranslationDownloadRepository implements ITranslationDownloadRepository {
  async getChapterVersesPage(params: {
    chapterNumber: number;
    translationId?: number;
    page: number;
    perPage: number;
    wordLang?: string;
  }): Promise<ChapterTranslationVersesPage> {
    const chapterNumber = toPositiveInt(params.chapterNumber);
    const translationId = params.translationId ? toPositiveInt(params.translationId) : undefined;
    const page = Math.max(1, toPositiveInt(params.page));
    const perPage = Math.max(1, toPositiveInt(params.perPage));
    const response = await apiFetch<ApiVersesResponse>(
      `/verses/by_chapter/${chapterNumber}`,
      {
        // A verse translation and a word-by-word language are independent downloads.
        // Word data is installed only through HostedWordTranslationPackRepository.
        language: 'en',
        words: 'false',
        ...(translationId ? { translations: String(translationId) } : {}),
        fields: 'text_uthmani',
        per_page: String(perPage),
        page: String(page),
      },
      'Failed to download translation verses'
    );

    const verses = (response.verses ?? [])
      .map((verse) => {
        const translations = verse.translations ?? [];
        const matching = translationId ? translations.find((t) => t.resource_id === translationId) : undefined;
        const text = matching?.text ?? translations[0]?.text ?? '';

        return {
          verseKey: verse.verse_key,
          ayahNumber: verse.verse_number,
          arabicUthmani: verse.text_uthmani ?? '',
          translationText: text,
        };
      })
      .filter((verse) => verse.verseKey && verse.ayahNumber > 0);

    return {
      verses,
      pagination: {
        currentPage: response.pagination?.current_page ?? page,
        totalPages: response.pagination?.total_pages ?? page,
        perPage: response.pagination?.per_page ?? perPage,
      },
    };
  }
}
