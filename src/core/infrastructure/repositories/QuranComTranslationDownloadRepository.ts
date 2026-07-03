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
    code_v2?: string;
    page_number?: number;
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
    translationId?: number;
    page: number;
    perPage: number;
    wordLang?: string;
  }): Promise<ChapterTranslationVersesPage> {
    const chapterNumber = toPositiveInt(params.chapterNumber);
    const translationId = params.translationId ? toPositiveInt(params.translationId) : undefined;
    const page = Math.max(1, toPositiveInt(params.page));
    const perPage = Math.max(1, toPositiveInt(params.perPage));
    const wordLang = params.wordLang || 'en';

    const response = await apiFetch<ApiVersesResponse>(
      `/verses/by_chapter/${chapterNumber}`,
      {
        language: wordLang,
        words: 'true',
        word_fields: 'text_uthmani,char_type_name,position,code_v2,page_number',
        word_translation_language: wordLang,
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

        const rawWords = verse.words ?? [];
        const normalizedWords = rawWords
          .filter((w) => Boolean(w))
          .map((w) => {
            const uthmani = (w.text_uthmani ?? w.text ?? '').trim();
            return {
              id: w.id,
              uthmani,
              translationText: w.translation?.text || undefined,
              charTypeName: w.char_type_name || undefined,
              position: typeof w.position === 'number' ? w.position : undefined,
              codeV2: typeof w.code_v2 === 'string' && w.code_v2.trim() ? w.code_v2 : undefined,
              pageNumber:
                typeof w.page_number === 'number' && Number.isFinite(w.page_number)
                  ? w.page_number
                  : undefined,
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
