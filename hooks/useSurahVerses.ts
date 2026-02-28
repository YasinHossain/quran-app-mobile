import React from 'react';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import { useChapters } from '@/hooks/useChapters';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';

import type { VerseWord } from '@/types';

export type SurahVerse = {
  id?: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  translations?: Array<{ resource_id: number; resource_name?: string; text: string }>;
  words?: VerseWord[];
  translationTexts: string[];
  translationItems: Array<{ resourceId: number; resourceName?: string; text: string }>;
};

type ApiVersesResponse = {
  verses: Array<{
    id: number;
    verse_number: number;
    verse_key: string;
    text_uthmani?: string;
    translations?: Array<{ resource_id: number; resource_name?: string; text: string }>;
    words?: Array<{
      id: number;
      position?: number;
      char_type_name?: string;
      text_uthmani?: string;
      text?: string;
      translation?: { text?: string } | null;
    }>;
  }>;
  pagination: { current_page: number; total_pages: number; per_page: number };
};

type ApiWord = NonNullable<ApiVersesResponse['verses'][number]['words']>[number];

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function buildTranslationTexts(
  translations: Array<{ resource_id: number; resource_name?: string; text: string }> | undefined,
  translationIds: number[]
): string[] {
  return buildTranslationItems(translations, translationIds).map((t) => t.text);
}

function buildTranslationItems(
  translations: Array<{ resource_id: number; resource_name?: string; text: string }> | undefined,
  translationIds: number[]
): Array<{ resourceId: number; resourceName?: string; text: string }> {
  const incoming = translations ?? [];
  if (incoming.length === 0) return [];

  const byResourceId = new Map(incoming.map((t) => [t.resource_id, t]));
  const ordered = translationIds
    .map((id) => {
      const match = byResourceId.get(id);
      const text = typeof match?.text === 'string' ? stripHtml(match.text).trim() : '';
      if (!text) return null;

      const name =
        typeof match?.resource_name === 'string' ? match.resource_name.trim() : undefined;
      const base = { resourceId: id, text };
      return name ? { ...base, resourceName: name } : base;
    })
    .filter((t): t is { resourceId: number; resourceName?: string; text: string } => t !== null);

  if (ordered.length) return ordered;

  return incoming
    .map((t) => {
      const text = stripHtml(t.text ?? '').trim();
      if (!text) return null;
      const name = typeof t.resource_name === 'string' ? t.resource_name.trim() : undefined;
      const base = { resourceId: t.resource_id, text };
      return name ? { ...base, resourceName: name } : base;
    })
    .filter((t): t is { resourceId: number; resourceName?: string; text: string } => t !== null);
}

function buildVerseWords(words: ApiWord[] | undefined): VerseWord[] | undefined {
  if (!Array.isArray(words) || words.length === 0) return undefined;

  const normalized: VerseWord[] = [];
  for (const word of words) {
    if (!word || word.char_type_name === 'end') continue;

    const uthmani = (word.text_uthmani ?? word.text ?? '').trim();
    if (!uthmani) continue;

    normalized.push({
      id: word.id,
      uthmani,
      translationText: word.translation?.text,
      charTypeName: word.char_type_name,
      ...(typeof word.position === 'number' ? { position: word.position } : {}),
    });
  }

  return normalized.length ? normalized : undefined;
}

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('the internet connection appears to be offline') ||
    normalized.includes('networkerror')
  );
}

async function areTranslationsInstalled(translationIds: number[]): Promise<boolean> {
  const normalized = Array.from(
    new Set(
      (translationIds ?? [])
        .map((id) => (Number.isFinite(id) ? Math.trunc(id) : 0))
        .filter((id) => id > 0)
    )
  );

  if (normalized.length === 0) return false;

  const items = await container.getDownloadIndexRepository().list();
  const installed = new Set<number>();

  for (const item of items) {
    if (item.content.kind !== 'translation') continue;
    if (item.status !== 'installed') continue;
    installed.add(item.content.translationId);
  }

  return normalized.every((id) => installed.has(id));
}

export function useSurahVerses({
  chapterNumber,
  translationIds,
  wordLang = 'en',
  perPage = 30,
  enabled = true,
}: {
  chapterNumber: number;
  translationIds: number[];
  wordLang?: string;
  perPage?: number;
  enabled?: boolean;
}): {
  chapter: SurahHeaderChapter | null;
  verses: SurahVerse[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  offlineNotInstalled: boolean;
  refresh: () => void;
  retry: () => void;
  loadMore: () => void;
} {
  const { chapters } = useChapters();
  const [chapter, setChapter] = React.useState<SurahHeaderChapter | null>(null);
  const [verses, setVerses] = React.useState<SurahVerse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [offlineNotInstalled, setOfflineNotInstalled] = React.useState(false);

  const pageRef = React.useRef(1);
  const totalPagesRef = React.useRef(1);
  const isLoadingMoreRef = React.useRef(false);
  const requestTokenRef = React.useRef(0);
  const dataSourceRef = React.useRef<'network' | 'offline'>('network');

  const resolvedWordLang = React.useMemo(() => {
    const normalized = typeof wordLang === 'string' ? wordLang.trim().toLowerCase() : '';
    return normalized || 'en';
  }, [wordLang]);

  const resolvedTranslationIds = React.useMemo(
    () => {
      const ordered: number[] = [];
      const seen = new Set<number>();

      for (const id of translationIds ?? []) {
        if (!Number.isFinite(id)) continue;
        const normalized = Math.trunc(id);
        if (normalized <= 0) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        ordered.push(normalized);
      }

      return ordered;
    },
    [translationIds]
  );

  const translationsKey = resolvedTranslationIds.join(',');

  const loadFirstPage = React.useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (!enabled) return;
      if (!Number.isFinite(chapterNumber)) return;

      const token = ++requestTokenRef.current;
      setErrorMessage(null);
      setOfflineNotInstalled(false);
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
      pageRef.current = 1;
      totalPagesRef.current = 1;
      dataSourceRef.current = 'network';

      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);

      try {
        if (mode === 'initial') {
          setVerses([]);
        }

        const localChapter = chapters.find((c) => c.id === chapterNumber) ?? null;
        if (localChapter) {
          setChapter(localChapter);
        }

        dataSourceRef.current = 'network';

        const versesJson = await apiFetch<ApiVersesResponse>(
          `/verses/by_chapter/${chapterNumber}`,
          {
            language: resolvedWordLang,
            words: 'true',
            word_translation_language: resolvedWordLang,
            word_fields: 'text_uthmani,char_type_name,position',
            fields: 'text_uthmani',
            ...(translationsKey ? { translations: translationsKey } : {}),
            per_page: perPage.toString(),
            page: '1',
          },
          'Failed to load verses'
        );

        if (requestTokenRef.current !== token) return;

        setVerses(
          (versesJson.verses ?? []).map((verse) => ({
            ...verse,
            words: buildVerseWords(verse.words),
            translationItems: buildTranslationItems(verse.translations, resolvedTranslationIds),
            translationTexts: buildTranslationTexts(verse.translations, resolvedTranslationIds),
          }))
        );
        pageRef.current = versesJson.pagination?.current_page ?? 1;
        totalPagesRef.current = versesJson.pagination?.total_pages ?? 1;
      } catch (error) {
        if (requestTokenRef.current !== token) return;

        if (dataSourceRef.current === 'network' && isNetworkError(error)) {
          const translationsInstalled = await areTranslationsInstalled(resolvedTranslationIds).catch(
            () => false
          );
          if (requestTokenRef.current !== token) return;

          if (translationsInstalled) {
            try {
              dataSourceRef.current = 'offline';
              const offlineStore = container.getTranslationOfflineStore();
              const offlineVerses = await offlineStore.getSurahVersesWithTranslations(
                chapterNumber,
                resolvedTranslationIds
              );

              if (requestTokenRef.current !== token) return;

              setVerses(
                offlineVerses.map((verse) => {
                  const translations = verse.translations.map((t) => ({
                    resource_id: t.translationId,
                    text: t.text,
                  }));

                  return {
                    verse_number: verse.ayahNumber,
                    verse_key: verse.verseKey,
                    text_uthmani: verse.arabicUthmani,
                    translations,
                    translationItems: buildTranslationItems(translations, resolvedTranslationIds),
                    translationTexts: buildTranslationTexts(translations, resolvedTranslationIds),
                  };
                })
              );

              pageRef.current = 1;
              totalPagesRef.current = 1;
              setOfflineNotInstalled(false);
              setErrorMessage(null);
              return;
            } catch (offlineError) {
              setErrorMessage((offlineError as Error).message);
              return;
            }
          }

          setOfflineNotInstalled(true);
          setErrorMessage(null);
          return;
        }

        setErrorMessage((error as Error).message);
      } finally {
        if (requestTokenRef.current !== token) return;
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
      }
    },
    [chapterNumber, chapters, enabled, perPage, resolvedTranslationIds, resolvedWordLang, translationsKey]
  );

  React.useEffect(() => {
    if (!enabled) return;
    if (!Number.isFinite(chapterNumber)) {
      setChapter(null);
      setVerses([]);
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
      setErrorMessage(null);
      pageRef.current = 1;
      totalPagesRef.current = 1;
      isLoadingMoreRef.current = false;
      return;
    }

    void loadFirstPage('initial');
  }, [chapterNumber, enabled, loadFirstPage]);

  const refresh = React.useCallback(() => {
    void loadFirstPage('refresh');
  }, [loadFirstPage]);

  const retry = React.useCallback(() => {
    void loadFirstPage('initial');
  }, [loadFirstPage]);

  const loadMore = React.useCallback(() => {
    if (!enabled) return;
    if (!Number.isFinite(chapterNumber)) return;
    if (dataSourceRef.current !== 'network') return;
    if (isLoadingMoreRef.current) return;
    if (isLoading) return;
    if (pageRef.current >= totalPagesRef.current) return;

    const token = requestTokenRef.current;
    const nextPage = pageRef.current + 1;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setErrorMessage(null);

    async function run(): Promise<void> {
      try {
        const json = await apiFetch<ApiVersesResponse>(
          `/verses/by_chapter/${chapterNumber}`,
          {
            language: resolvedWordLang,
            words: 'true',
            word_translation_language: resolvedWordLang,
            word_fields: 'text_uthmani,char_type_name,position',
            fields: 'text_uthmani',
            ...(translationsKey ? { translations: translationsKey } : {}),
            per_page: perPage.toString(),
            page: nextPage.toString(),
          },
          'Failed to load verses'
        );

        if (requestTokenRef.current !== token) return;

        const preparedIncoming = (json.verses ?? []).map((verse) => ({
          ...verse,
          words: buildVerseWords(verse.words),
          translationItems: buildTranslationItems(verse.translations, resolvedTranslationIds),
          translationTexts: buildTranslationTexts(verse.translations, resolvedTranslationIds),
        }));

        setVerses((prev) => {
          if (preparedIncoming.length === 0) return prev;
          const existingKeys = new Set(prev.map((v) => v.verse_key));
          const deduped = preparedIncoming.filter((v) => !existingKeys.has(v.verse_key));
          return deduped.length ? [...prev, ...deduped] : prev;
        });

        pageRef.current = json.pagination?.current_page ?? nextPage;
        totalPagesRef.current = json.pagination?.total_pages ?? totalPagesRef.current;
      } catch (error) {
        if (requestTokenRef.current !== token) return;
        setErrorMessage((error as Error).message);
      } finally {
        if (requestTokenRef.current !== token) return;
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }

    void run();
  }, [chapterNumber, enabled, isLoading, perPage, resolvedTranslationIds, resolvedWordLang, translationsKey]);

  return {
    chapter,
    verses,
    isLoading,
    isRefreshing,
    isLoadingMore,
    errorMessage,
    offlineNotInstalled,
    refresh,
    retry,
    loadMore,
  };
}
