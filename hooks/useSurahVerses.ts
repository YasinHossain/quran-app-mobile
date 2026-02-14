import React from 'react';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import { loadChaptersFromStorage } from '@/lib/storage/chaptersStorage';
import { container } from '@/src/core/infrastructure/di/container';

type ApiChapterResponse = {
  chapter: SurahHeaderChapter;
};

export type SurahVerse = {
  id?: number;
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
  offlineNotInstalled: boolean;
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
  const [offlineNotInstalled, setOfflineNotInstalled] = React.useState(false);

  const pageRef = React.useRef(1);
  const totalPagesRef = React.useRef(1);
  const isLoadingMoreRef = React.useRef(false);
  const requestTokenRef = React.useRef(0);
  const dataSourceRef = React.useRef<'network' | 'offline'>('network');

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
  const translationsQuery = translationsKey ? `&translations=${encodeURIComponent(translationsKey)}` : '';

  const loadFirstPage = React.useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
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

        const [cachedChapter, translationsInstalled] = await Promise.all([
          loadChaptersFromStorage()
            .then((chapters) => chapters.find((c) => c.id === chapterNumber) ?? null)
            .catch(() => null),
          areTranslationsInstalled(resolvedTranslationIds).catch(() => false),
        ]);

        if (requestTokenRef.current !== token) return;

        if (cachedChapter) {
          setChapter(cachedChapter);
        }

        if (translationsInstalled) {
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
                translationTexts: buildTranslationTexts(translations, resolvedTranslationIds),
              };
            })
          );

          pageRef.current = 1;
          totalPagesRef.current = 1;
          return;
        }

        dataSourceRef.current = 'network';

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
        if (dataSourceRef.current === 'network' && isNetworkError(error)) {
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
    offlineNotInstalled,
    refresh,
    retry,
    loadMore,
  };
}
