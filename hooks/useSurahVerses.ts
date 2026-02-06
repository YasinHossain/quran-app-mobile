import React from 'react';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';

type ApiChapterResponse = {
  chapter: SurahHeaderChapter;
};

export type SurahVerse = {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  translations?: Array<{ resource_id: number; text: string }>;
  translationTexts: string[];
};

type ApiVersesResponse = {
  verses: Array<{
    id: number;
    verse_number: number;
    verse_key: string;
    text_uthmani?: string;
    translations?: Array<{ resource_id: number; text: string }>;
  }>;
  pagination: { current_page: number; total_pages: number; per_page: number };
};

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
  translations: Array<{ resource_id: number; text: string }> | undefined,
  translationIds: number[]
): string[] {
  const incoming = translations ?? [];
  if (incoming.length === 0) return [];

  const byResourceId = new Map(incoming.map((t) => [t.resource_id, t.text]));
  const ordered = translationIds
    .map((id) => byResourceId.get(id))
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map(stripHtml)
    .filter(Boolean);

  if (ordered.length) return ordered;

  return incoming
    .map((t) => stripHtml(t.text ?? ''))
    .filter((text) => text.length > 0);
}

export function useSurahVerses({
  chapterNumber,
  translationIds,
  perPage = 30,
}: {
  chapterNumber: number;
  translationIds: number[];
  perPage?: number;
}): {
  chapter: SurahHeaderChapter | null;
  verses: SurahVerse[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  refresh: () => void;
  retry: () => void;
  loadMore: () => void;
} {
  const [chapter, setChapter] = React.useState<SurahHeaderChapter | null>(null);
  const [verses, setVerses] = React.useState<SurahVerse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const pageRef = React.useRef(1);
  const totalPagesRef = React.useRef(1);
  const isLoadingMoreRef = React.useRef(false);
  const requestTokenRef = React.useRef(0);

  const resolvedTranslationIds = React.useMemo(
    () => translationIds.filter((id) => Number.isFinite(id) && id > 0),
    [translationIds]
  );

  const translationsKey = resolvedTranslationIds.join(',');
  const translationsQuery = translationsKey ? `&translations=${encodeURIComponent(translationsKey)}` : '';

  const loadFirstPage = React.useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (!Number.isFinite(chapterNumber)) return;

      const token = ++requestTokenRef.current;
      setErrorMessage(null);
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
      pageRef.current = 1;
      totalPagesRef.current = 1;

      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);

      try {
        const [chapterResponse, versesResponse] = await Promise.all([
          fetch(`https://api.quran.com/api/v4/chapters/${chapterNumber}?language=en`),
          fetch(
            `https://api.quran.com/api/v4/verses/by_chapter/${chapterNumber}?language=en&words=false${translationsQuery}&fields=text_uthmani&per_page=${perPage}&page=1`
          ),
        ]);

        if (!chapterResponse.ok) {
          throw new Error(`Failed to load chapter (${chapterResponse.status})`);
        }
        if (!versesResponse.ok) {
          throw new Error(`Failed to load verses (${versesResponse.status})`);
        }

        const chapterJson = (await chapterResponse.json()) as ApiChapterResponse;
        const versesJson = (await versesResponse.json()) as ApiVersesResponse;

        if (requestTokenRef.current !== token) return;

        setChapter(chapterJson.chapter);
        setVerses(
          (versesJson.verses ?? []).map((verse) => ({
            ...verse,
            translationTexts: buildTranslationTexts(verse.translations, resolvedTranslationIds),
          }))
        );
        pageRef.current = versesJson.pagination?.current_page ?? 1;
        totalPagesRef.current = versesJson.pagination?.total_pages ?? 1;
      } catch (error) {
        if (requestTokenRef.current !== token) return;
        setErrorMessage((error as Error).message);
      } finally {
        if (requestTokenRef.current !== token) return;
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
      }
    },
    [chapterNumber, perPage, resolvedTranslationIds, translationsQuery]
  );

  React.useEffect(() => {
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
  }, [chapterNumber, loadFirstPage]);

  const refresh = React.useCallback(() => {
    void loadFirstPage('refresh');
  }, [loadFirstPage]);

  const retry = React.useCallback(() => {
    void loadFirstPage('initial');
  }, [loadFirstPage]);

  const loadMore = React.useCallback(() => {
    if (!Number.isFinite(chapterNumber)) return;
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
        const response = await fetch(
          `https://api.quran.com/api/v4/verses/by_chapter/${chapterNumber}?language=en&words=false${translationsQuery}&fields=text_uthmani&per_page=${perPage}&page=${nextPage}`
        );

        if (!response.ok) {
          throw new Error(`Failed to load verses (${response.status})`);
        }

        const json = (await response.json()) as ApiVersesResponse;
        if (requestTokenRef.current !== token) return;

        const preparedIncoming = (json.verses ?? []).map((verse) => ({
          ...verse,
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
  }, [chapterNumber, isLoading, perPage, resolvedTranslationIds, translationsQuery]);

  return {
    chapter,
    verses,
    isLoading,
    isRefreshing,
    isLoadingMore,
    errorMessage,
    refresh,
    retry,
    loadMore,
  };
}
