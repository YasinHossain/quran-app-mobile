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
  words?: Array<{
    id: number;
    position?: number;
    char_type_name?: string;
    text_uthmani?: string;
    text?: string;
    translation?: { text?: string } | null;
  }>;
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
    translationId: number;
    page: number;
    perPage: number;
  }): Promise<ChapterTranslationVersesPage> {
    const chapterNumber = toPositiveInt(params.chapterNumber);
    const translationId = toPositiveInt(params.translationId);
    const page = Math.max(1, toPositiveInt(params.page));
    const perPage = Math.max(1, toPositiveInt(params.perPage));

    const response = await apiFetch<ApiVersesResponse>(
      `/verses/by_chapter/${chapterNumber}`,
      {
        language: 'en',
        words: 'true',
        word_fields: 'text_uthmani,char_type_name,position',
        word_translation_language: 'en',
        translations: String(translationId),
        fields: 'text_uthmani',
        per_page: String(perPage),
        page: String(page),
      },
      'Failed to download translation verses'
    );

    const verses = (response.verses ?? [])
      .map((verse) => {
        const translations = verse.translations ?? [];
        const matching = translations.find((t) => t.resource_id === translationId);
        const text = matching?.text ?? translations[0]?.text ?? '';

        const rawWords = verse.words ?? [];
        const normalizedWords = rawWords
          .filter((w) => w && w.char_type_name !== 'end')
          .map((w) => {
            const uthmani = (w.text_uthmani ?? w.text ?? '').trim();
            return {
              id: w.id,
              uthmani,
              translationText: w.translation?.text || undefined,
              charTypeName: w.char_type_name || undefined,
              position: typeof w.position === 'number' ? w.position : undefined,
            };
          })
          .filter((w) => w.uthmani.length > 0);

        const wordsJson = normalizedWords.length ? JSON.stringify(normalizedWords) : undefined;

        return {
          verseKey: verse.verse_key,
          ayahNumber: verse.verse_number,
          arabicUthmani: verse.text_uthmani ?? '',
          translationText: text,
          wordsJson,
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

