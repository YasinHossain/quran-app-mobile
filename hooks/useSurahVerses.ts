import React from 'react';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import {
  DEFAULT_SURAH_VERSES_PER_PAGE,
  getOfflineSurahCached,
  getOfflineSurahPageCached,
  getOfflineSurahSnapshot,
  peekOfflineSurahCache,
  peekOfflineSurahPageCache,
} from '@/lib/surah/offlineSurahPageCache';
import { useChapters } from '@/hooks/useChapters';
import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';

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

function hasCompleteRequestedTranslations(
  offlineVerses: OfflineVerseWithTranslations[],
  translationIds: number[]
): boolean {
  if (offlineVerses.length === 0) return false;
  if (translationIds.length === 0) return true;

  return offlineVerses.every((verse) => {
    const availableTranslationIds = new Set(
      verse.translations
        .map((translation) =>
          Number.isFinite(translation.translationId) ? Math.trunc(translation.translationId) : 0
        )
        .filter((translationId) => translationId > 0)
    );

    return translationIds.every((translationId) => availableTranslationIds.has(translationId));
  });
}

function isCompleteOfflineVerseSet(params: {
  offlineVerses: OfflineVerseWithTranslations[];
  translationIds: number[];
  expectedVerseCount?: number;
}): boolean {
  if (params.offlineVerses.length === 0) return false;
  if (
    typeof params.expectedVerseCount === 'number' &&
    params.expectedVerseCount > 0 &&
    params.offlineVerses.length < params.expectedVerseCount
  ) {
    return false;
  }

  return hasCompleteRequestedTranslations(params.offlineVerses, params.translationIds);
}

function getExpectedPageVerseCount(params: {
  pageNumber: number;
  perPage: number;
  verseCount: number;
}): number | undefined {
  if (params.verseCount <= 0 || params.perPage <= 0 || params.pageNumber <= 0) {
    return undefined;
  }

  const startVerse = (params.pageNumber - 1) * params.perPage + 1;
  if (startVerse > params.verseCount) return 0;
  return Math.min(params.perPage, params.verseCount - startVerse + 1);
}

function normalizeOfflineVersePageData(
  offlineVerses: OfflineVerseWithTranslations[],
  translationIds: number[]
): SurahVerse[] {
  return offlineVerses.map((verse) => {
    const translations = verse.translations.map((item) => ({
      resource_id: item.translationId,
      text: item.text,
    }));

    return {
      verse_number: verse.ayahNumber,
      verse_key: verse.verseKey,
      text_uthmani: verse.arabicUthmani,
      translations,
      translationItems: buildTranslationItems(translations, translationIds),
      translationTexts: buildTranslationTexts(translations, translationIds),
    };
  });
}

function buildOfflinePagesByNumber(params: {
  offlineVerses: OfflineVerseWithTranslations[];
  translationIds: number[];
  perPage: number;
}): Record<number, SurahVerse[]> {
  const pages: Record<number, OfflineVerseWithTranslations[]> = {};

  for (const verse of params.offlineVerses) {
    const pageNumber = Math.max(1, Math.floor((verse.ayahNumber - 1) / params.perPage) + 1);
    if (!pages[pageNumber]) pages[pageNumber] = [];
    pages[pageNumber]!.push(verse);
  }

  const nextPages: Record<number, SurahVerse[]> = {};
  for (const [pageNumber, pageVerses] of Object.entries(pages)) {
    nextPages[Number(pageNumber)] = normalizeOfflineVersePageData(
      pageVerses.slice().sort((a, b) => a.ayahNumber - b.ayahNumber),
      params.translationIds
    );
  }

  return nextPages;
}

function getInitialOfflinePagesSnapshot(params: {
  enabled: boolean;
  chapterNumber: number;
  translationIds: number[];
  perPage: number;
  verseCount: number;
}): Record<number, SurahVerse[]> {
  if (!params.enabled) return {};
  if (!Number.isFinite(params.chapterNumber) || params.chapterNumber <= 0) return {};

  const cachedSurah = peekOfflineSurahCache({
    surahId: params.chapterNumber,
    translationIds: params.translationIds,
  });

  const offlineSurah =
    cachedSurah &&
    isCompleteOfflineVerseSet({
      offlineVerses: cachedSurah,
      translationIds: params.translationIds,
      expectedVerseCount: params.verseCount,
    })
      ? cachedSurah
      : getOfflineSurahSnapshot({
          surahId: params.chapterNumber,
          translationIds: params.translationIds,
          perPage: params.perPage,
          expectedVerseCount: params.verseCount,
        });

  if (!offlineSurah) {
    return {};
  }

  return buildOfflinePagesByNumber({
    offlineVerses: offlineSurah,
    translationIds: params.translationIds,
    perPage: params.perPage,
  });
}

function getTranslationItemsSignature(verse: SurahVerse | undefined): string {
  return (verse?.translationItems ?? [])
    .map((translation) =>
      [
        translation.resourceId,
        translation.resourceName ?? '',
        translation.text,
      ].join(':')
    )
    .join('\u0000');
}

function getWordsSignature(verse: SurahVerse | undefined): string {
  return (verse?.words ?? [])
    .map((word) =>
      [
        word.id,
        word.position ?? '',
        word.charTypeName ?? '',
        word.uthmani,
        word.translationText ?? '',
      ].join(':')
    )
    .join('\u0000');
}

function arePageVersesEquivalent(current: SurahVerse[], incoming: SurahVerse[]): boolean {
  if (current.length !== incoming.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    const currentVerse = current[index];
    const incomingVerse = incoming[index];

    if (currentVerse?.verse_key !== incomingVerse?.verse_key) return false;
    if (currentVerse?.text_uthmani !== incomingVerse?.text_uthmani) return false;
    if (getWordsSignature(currentVerse) !== getWordsSignature(incomingVerse)) return false;
    if (getTranslationItemsSignature(currentVerse) !== getTranslationItemsSignature(incomingVerse)) {
      return false;
    }
  }

  return true;
}

function pagesBelongToChapter(
  pagesByNumber: Record<number, SurahVerse[]>,
  chapterNumber: number
): boolean {
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return false;
  const normalizedChapterNumber = Math.trunc(chapterNumber);

  for (const pageVerses of Object.values(pagesByNumber)) {
    const firstVerseKey = pageVerses[0]?.verse_key;
    if (!firstVerseKey) continue;
    const [chapterPart] = firstVerseKey.split(':');
    const pageChapterNumber = Number.parseInt(chapterPart ?? '', 10);
    return pageChapterNumber === normalizedChapterNumber;
  }

  return false;
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

export function useSurahVerses({
  chapterNumber,
  translationIds,
  wordLang = 'en',
  perPage = DEFAULT_SURAH_VERSES_PER_PAGE,
  includeWords = false,
  includeWordTranslations = false,
  initialVerseNumber,
  enabled = true,
}: {
  chapterNumber: number;
  translationIds: number[];
  wordLang?: string;
  perPage?: number;
  includeWords?: boolean;
  includeWordTranslations?: boolean;
  initialVerseNumber?: number;
  enabled?: boolean;
}): {
  chapter: SurahHeaderChapter | null;
  verseCount: number;
  pagesSignature: string;
  hasLoadedContent: boolean;
  getVerseByNumber: (verseNumber: number) => SurahVerse | undefined;
  ensureVerseRangeLoaded: (startVerse: number, endVerse: number, paddingPages?: number) => void;
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
  const chapter = React.useMemo(
    () => chapters.find((item) => item.id === chapterNumber) ?? null,
    [chapterNumber, chapters]
  );
  const verseCount = chapter?.verses_count ?? 0;
  const initialPagesByNumberRef = React.useRef<Record<number, SurahVerse[]> | null>(null);
  if (initialPagesByNumberRef.current === null) {
    initialPagesByNumberRef.current = getInitialOfflinePagesSnapshot({
      enabled,
      chapterNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      verseCount,
    });
  }
  const initialPagesByNumber = initialPagesByNumberRef.current;
  const initialHasLoadedContent = Object.keys(initialPagesByNumber).length > 0;

  const [isLoading, setIsLoading] = React.useState(!initialHasLoadedContent);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [offlineNotInstalled, setOfflineNotInstalled] = React.useState(false);
  const [pagesByNumber, setPagesByNumber] = React.useState<Record<number, SurahVerse[]>>(
    initialPagesByNumber
  );
  const [pendingPageCount, setPendingPageCount] = React.useState(0);

  const pagesByNumberRef = React.useRef<Record<number, SurahVerse[]>>(initialPagesByNumber);
  const totalPagesRef = React.useRef(
    verseCount > 0 && Number.isFinite(perPage) && perPage > 0
      ? Math.max(1, Math.ceil(verseCount / perPage))
      : 1
  );
  const requestTokenRef = React.useRef(0);
  const inFlightPagesRef = React.useRef(new Map<number, Promise<void>>());
  const dataSourceRef = React.useRef<'network' | 'offline'>(
    initialHasLoadedContent ? 'offline' : 'network'
  );
  const initialVerseNumberRef = React.useRef(initialVerseNumber);
  const pagesSignature = React.useMemo(
    () => Object.keys(pagesByNumber).sort((a, b) => Number(a) - Number(b)).join(','),
    [pagesByNumber]
  );
  const hasLoadedContent = React.useMemo(
    () => Object.keys(pagesByNumber).length > 0,
    [pagesByNumber]
  );
  const verseByNumber = React.useMemo(() => {
    const map = new Map<number, SurahVerse>();
    for (const pageVerses of Object.values(pagesByNumber)) {
      for (const verse of pageVerses) {
        map.set(verse.verse_number, verse);
      }
    }
    return map;
  }, [pagesByNumber]);

  React.useEffect(() => {
    pagesByNumberRef.current = pagesByNumber;
  }, [pagesByNumber]);

  React.useEffect(() => {
    initialVerseNumberRef.current = initialVerseNumber;
  }, [initialVerseNumber]);

  React.useEffect(() => {
    totalPagesRef.current =
      verseCount > 0 && Number.isFinite(perPage) && perPage > 0
        ? Math.max(1, Math.ceil(verseCount / perPage))
        : 1;
  }, [perPage, verseCount]);

  const normalizeVersePage = React.useCallback(
    (pageVerses: ApiVersesResponse['verses']): SurahVerse[] =>
      (pageVerses ?? []).map((verse) => ({
        id: verse.id,
        verse_number: verse.verse_number,
        verse_key: verse.verse_key,
        text_uthmani: verse.text_uthmani,
        translations: verse.translations,
        ...(includeWords ? { words: buildVerseWords(verse.words) } : {}),
        translationItems: buildTranslationItems(verse.translations, resolvedTranslationIds),
        translationTexts: buildTranslationTexts(verse.translations, resolvedTranslationIds),
      })),
    [includeWords, resolvedTranslationIds]
  );

  const setPageData = React.useCallback((pageNumber: number, pageVerses: SurahVerse[]) => {
    if (!pageVerses.length) return;

    setPagesByNumber((prev) => {
      const existing = prev[pageNumber];
      if (existing && arePageVersesEquivalent(existing, pageVerses)) {
        return prev;
      }

      const next = { ...prev, [pageNumber]: pageVerses };
      pagesByNumberRef.current = next;
      return next;
    });
  }, []);

  const normalizeOfflineVersePage = React.useCallback(
    (offlineVerses: OfflineVerseWithTranslations[]): SurahVerse[] =>
      normalizeOfflineVersePageData(offlineVerses, resolvedTranslationIds),
    [resolvedTranslationIds]
  );

  const setOfflineSurahData = React.useCallback(
    (offlineVerses: OfflineVerseWithTranslations[]): void => {
      if (!offlineVerses.length) return;

      const nextPages = buildOfflinePagesByNumber({
        offlineVerses,
        translationIds: resolvedTranslationIds,
        perPage,
      });

      if (Object.keys(nextPages).length === 0) return;

      pagesByNumberRef.current = nextPages;
      setPagesByNumber((previous) => {
        const previousPageNumbers = Object.keys(previous);
        const nextPageNumbers = Object.keys(nextPages);
        if (previousPageNumbers.length !== nextPageNumbers.length) {
          return nextPages;
        }

        for (const pageNumber of nextPageNumbers) {
          const numericPageNumber = Number(pageNumber);
          const previousPage = previous[numericPageNumber];
          const nextPage = nextPages[numericPageNumber];
          if (!previousPage || !nextPage || !arePageVersesEquivalent(previousPage, nextPage)) {
            return nextPages;
          }
        }

        return previous;
      });
    },
    [perPage, resolvedTranslationIds]
  );

  const loadOfflinePage = React.useCallback(
    async (pageNumber: number, token: number): Promise<boolean> => {
      if (!enabled) return false;
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return false;
      if (!Number.isFinite(pageNumber) || pageNumber <= 0) return false;
      if (verseCount > 0 && pageNumber > totalPagesRef.current) return false;
      const expectedVerseCount = getExpectedPageVerseCount({
        pageNumber,
        perPage,
        verseCount,
      });

      const cachedPage = peekOfflineSurahPageCache({
        surahId: chapterNumber,
        translationIds: resolvedTranslationIds,
        page: pageNumber,
        perPage,
      });

      if (
        cachedPage?.length &&
        isCompleteOfflineVerseSet({
          offlineVerses: cachedPage,
          translationIds: resolvedTranslationIds,
          expectedVerseCount,
        })
      ) {
        dataSourceRef.current = 'offline';
        setPageData(pageNumber, normalizeOfflineVersePage(cachedPage));
        setOfflineNotInstalled(false);
        setErrorMessage(null);
        return true;
      }

      const offlineVerses = await getOfflineSurahPageCached({
        surahId: chapterNumber,
        translationIds: resolvedTranslationIds,
        page: pageNumber,
        perPage,
        expectedVerseCount,
      });

      if (requestTokenRef.current !== token) return false;
      if (
        !isCompleteOfflineVerseSet({
          offlineVerses,
          translationIds: resolvedTranslationIds,
          expectedVerseCount,
        })
      ) {
        return false;
      }

      dataSourceRef.current = 'offline';
      setPageData(pageNumber, normalizeOfflineVersePage(offlineVerses));
      setOfflineNotInstalled(false);
      setErrorMessage(null);
      totalPagesRef.current =
        verseCount > 0 && Number.isFinite(perPage) && perPage > 0
          ? Math.max(1, Math.ceil(verseCount / perPage))
          : Math.max(pageNumber, totalPagesRef.current);
      return true;
    },
    [
      chapterNumber,
      enabled,
      normalizeOfflineVersePage,
      perPage,
      resolvedTranslationIds,
      setPageData,
      verseCount,
    ]
  );

  const loadOfflineFirstData = React.useCallback(async (token: number): Promise<boolean> => {
    if (!enabled) return false;
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return false;
    if (requestTokenRef.current !== token) return false;

    const cachedSurah = peekOfflineSurahCache({
      surahId: chapterNumber,
      translationIds: resolvedTranslationIds,
    });

    if (
      cachedSurah &&
      isCompleteOfflineVerseSet({
        offlineVerses: cachedSurah,
        translationIds: resolvedTranslationIds,
        expectedVerseCount: verseCount,
      })
    ) {
      dataSourceRef.current = 'offline';
      setOfflineSurahData(cachedSurah);
      setOfflineNotInstalled(false);
      setErrorMessage(null);
      return true;
    }

    const offlineVerses = await getOfflineSurahCached({
      surahId: chapterNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      expectedVerseCount: verseCount,
    });

    if (requestTokenRef.current !== token) return false;

    if (
      !isCompleteOfflineVerseSet({
        offlineVerses,
        translationIds: resolvedTranslationIds,
        expectedVerseCount: verseCount,
      })
    ) {
      return false;
    }

    dataSourceRef.current = 'offline';
    setOfflineSurahData(offlineVerses);
    setOfflineNotInstalled(false);
    setErrorMessage(null);
    return true;
  }, [
    chapterNumber,
    enabled,
    perPage,
    resolvedTranslationIds,
    setOfflineSurahData,
    verseCount,
  ]);

  const fetchPage = React.useCallback(
    async (pageNumber: number, token: number): Promise<void> => {
      if (!enabled) return;
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
      if (!Number.isFinite(pageNumber) || pageNumber <= 0) return;
      if (verseCount > 0 && pageNumber > totalPagesRef.current) return;
      if (pagesByNumberRef.current[pageNumber]) return;

      const existingRequest = inFlightPagesRef.current.get(pageNumber);
      if (existingRequest) {
        return existingRequest;
      }

      const request = (async () => {
        setPendingPageCount((current) => current + 1);

        try {
          if (dataSourceRef.current === 'offline') {
            const loadedOffline = await loadOfflinePage(pageNumber, token);
            if (loadedOffline) return;

            setOfflineNotInstalled(true);
            setErrorMessage(null);
            return;
          }

          const versesJson = await apiFetch<ApiVersesResponse>(
            `/verses/by_chapter/${chapterNumber}`,
            {
              language: resolvedWordLang,
              ...(includeWords
                ? { words: 'true', word_fields: 'text_uthmani,char_type_name,position' }
                : {}),
              ...(includeWords && includeWordTranslations
                ? { word_translation_language: resolvedWordLang }
                : {}),
              fields: 'text_uthmani',
              ...(translationsKey ? { translations: translationsKey } : {}),
              per_page: perPage.toString(),
              page: pageNumber.toString(),
            },
            'Failed to load verses'
          );

          if (requestTokenRef.current !== token) return;

          totalPagesRef.current = versesJson.pagination?.total_pages ?? totalPagesRef.current;
          setPageData(pageNumber, normalizeVersePage(versesJson.verses ?? []));
          setOfflineNotInstalled(false);
          setErrorMessage(null);
        } catch (error) {
          if (requestTokenRef.current !== token) return;

          if (dataSourceRef.current === 'network' && isNetworkError(error)) {
            try {
              const loadedOffline = await loadOfflinePage(pageNumber, token);
              if (requestTokenRef.current !== token) return;

              if (loadedOffline) {
                return;
              }
            } catch (offlineError) {
              setErrorMessage((offlineError as Error).message);
              return;
            }

            setOfflineNotInstalled(true);
            setErrorMessage(null);
            return;
          }

          setErrorMessage((error as Error).message);
        } finally {
          inFlightPagesRef.current.delete(pageNumber);
          setPendingPageCount((current) => Math.max(0, current - 1));
        }
      })();

      inFlightPagesRef.current.set(pageNumber, request);
      return request;
    },
    [
      chapterNumber,
      enabled,
      includeWordTranslations,
      includeWords,
      normalizeVersePage,
      loadOfflinePage,
      perPage,
      resolvedTranslationIds,
      resolvedWordLang,
      setPageData,
      translationsKey,
    ]
  );

  const ensureVerseRangeLoaded = React.useCallback(
    (startVerse: number, endVerse: number, paddingPages = 0) => {
      if (!enabled) return;
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
      if (verseCount <= 0) return;

      const normalizedStartVerse = Math.max(
        1,
        Math.min(verseCount, Math.floor(Math.min(startVerse, endVerse)))
      );
      const normalizedEndVerse = Math.max(
        normalizedStartVerse,
        Math.min(verseCount, Math.floor(Math.max(startVerse, endVerse)))
      );

      const startPage = Math.max(
        1,
        Math.floor((normalizedStartVerse - 1) / perPage) + 1 - Math.max(0, paddingPages)
      );
      const endPage = Math.min(
        totalPagesRef.current,
        Math.floor((normalizedEndVerse - 1) / perPage) + 1 + Math.max(0, paddingPages)
      );
      const token = requestTokenRef.current;

      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
        void fetchPage(pageNumber, token);
      }
    },
    [chapterNumber, enabled, fetchPage, perPage, verseCount]
  );

  const loadInitialWindow = React.useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (!enabled) return;
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;

      const token = ++requestTokenRef.current;
      inFlightPagesRef.current.clear();
      dataSourceRef.current = 'network';
      totalPagesRef.current =
        verseCount > 0 && Number.isFinite(perPage) && perPage > 0
          ? Math.max(1, Math.ceil(verseCount / perPage))
          : Number.MAX_SAFE_INTEGER;
      const warmOfflinePages = getInitialOfflinePagesSnapshot({
        enabled,
        chapterNumber,
        translationIds: resolvedTranslationIds,
        perPage,
        verseCount,
      });
      const hasWarmOfflinePages = Object.keys(warmOfflinePages).length > 0;

      if (hasWarmOfflinePages) {
        dataSourceRef.current = 'offline';
        pagesByNumberRef.current = warmOfflinePages;
        setPagesByNumber((previous) => {
          const previousPageNumbers = Object.keys(previous);
          const nextPageNumbers = Object.keys(warmOfflinePages);
          if (previousPageNumbers.length !== nextPageNumbers.length) return warmOfflinePages;

          for (const pageNumber of nextPageNumbers) {
            const numericPageNumber = Number(pageNumber);
            const previousPage = previous[numericPageNumber];
            const nextPage = warmOfflinePages[numericPageNumber];
            if (!previousPage || !nextPage || !arePageVersesEquivalent(previousPage, nextPage)) {
              return warmOfflinePages;
            }
          }

          return previous;
        });
        setPendingPageCount(0);
        setErrorMessage(null);
        setOfflineNotInstalled(false);
        setIsLoadingMore(false);
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
        return;
      }

      const canPreserveCurrentPages = pagesBelongToChapter(
        pagesByNumberRef.current,
        chapterNumber
      );

      setPendingPageCount(0);
      setErrorMessage(null);
      setOfflineNotInstalled(false);
      setIsLoadingMore(false);

      if (!canPreserveCurrentPages) {
        pagesByNumberRef.current = {};
        setPagesByNumber({});
      }

      if (mode === 'initial') setIsLoading(!canPreserveCurrentPages);
      if (mode === 'refresh') setIsRefreshing(true);

      try {
        const loadedOfflineFirst = await loadOfflineFirstData(token);
        if (requestTokenRef.current !== token) return;
        if (loadedOfflineFirst) return;

        if (canPreserveCurrentPages) {
          pagesByNumberRef.current = {};
          setPagesByNumber({});
          if (mode === 'initial') setIsLoading(true);
        }

        const requestedVerseNumber =
          typeof initialVerseNumberRef.current === 'number' &&
          Number.isFinite(initialVerseNumberRef.current) &&
          initialVerseNumberRef.current > 0
            ? Math.min(verseCount || initialVerseNumberRef.current, Math.floor(initialVerseNumberRef.current))
            : 1;
        const targetPage = Math.max(1, Math.floor((requestedVerseNumber - 1) / perPage) + 1);
        const initialPages =
          requestedVerseNumber > 1
            ? [
                Math.max(1, targetPage - 1),
                targetPage,
                verseCount > 0 ? Math.min(totalPagesRef.current, targetPage + 1) : targetPage + 1,
              ]
            : [1];
        const uniqueInitialPages = Array.from(new Set(initialPages)).filter(
          (pageNumber) =>
            pageNumber >= 1 && (verseCount > 0 ? pageNumber <= totalPagesRef.current : true)
        );

        await Promise.all(uniqueInitialPages.map((pageNumber) => fetchPage(pageNumber, token)));
      } finally {
        if (requestTokenRef.current !== token) return;
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
      }
    },
    [
      chapterNumber,
      enabled,
      fetchPage,
      loadOfflineFirstData,
      perPage,
      resolvedTranslationIds,
      verseCount,
    ]
  );

  React.useEffect(() => {
    if (!enabled) return;
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
      requestTokenRef.current += 1;
      inFlightPagesRef.current.clear();
      dataSourceRef.current = 'network';
      totalPagesRef.current = 1;
      pagesByNumberRef.current = {};
      setPagesByNumber({});
      setPendingPageCount(0);
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
      setErrorMessage(null);
      setOfflineNotInstalled(false);
      return;
    }

    void loadInitialWindow('initial');
  }, [
    chapterNumber,
    enabled,
    includeWordTranslations,
    includeWords,
    initialVerseNumber,
    loadInitialWindow,
    perPage,
    resolvedWordLang,
    translationsKey,
  ]);

  React.useEffect(() => {
    setIsLoadingMore(Boolean(!isLoading && !isRefreshing && pendingPageCount > 0));
  }, [isLoading, isRefreshing, pendingPageCount]);

  const refresh = React.useCallback(() => {
    void loadInitialWindow('refresh');
  }, [loadInitialWindow]);

  const retry = React.useCallback(() => {
    void loadInitialWindow('initial');
  }, [loadInitialWindow]);

  const getVerseByNumber = React.useCallback(
    (verseNumber: number) => verseByNumber.get(verseNumber),
    [verseByNumber]
  );

  const loadMore = React.useCallback(() => {
    const highestLoadedVerse = verseByNumber.size
      ? Math.max(...Array.from(verseByNumber.keys()))
      : 0;
    if (highestLoadedVerse <= 0) return;
    ensureVerseRangeLoaded(highestLoadedVerse + 1, highestLoadedVerse + perPage, 0);
  }, [ensureVerseRangeLoaded, perPage, verseByNumber]);

  return {
    chapter,
    verseCount,
    pagesSignature,
    hasLoadedContent,
    getVerseByNumber,
    ensureVerseRangeLoaded,
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
