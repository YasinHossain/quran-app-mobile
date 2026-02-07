import React from 'react';

import { advancedSearch, type SearchNavigationResult, type SearchVerseResult } from '@/lib/api/search';

const DEFAULT_PAGE_SIZE = 10;

export function usePaginatedSearch({
  query,
  translationIds,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  query: string;
  translationIds: number[];
  pageSize?: number;
}): {
  navigationResults: SearchNavigationResult[];
  verses: SearchVerseResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  totalResults: number;
  hasNextPage: boolean;
  loadMore: () => void;
  refresh: () => void;
} {
  const [navigationResults, setNavigationResults] = React.useState<SearchNavigationResult[]>([]);
  const [verses, setVerses] = React.useState<SearchVerseResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [totalResults, setTotalResults] = React.useState(0);
  const pageRef = React.useRef(1);
  const totalPagesRef = React.useRef(1);
  const requestIdRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const translationKey = React.useMemo(
    () => translationIds.filter((id) => Number.isFinite(id) && id > 0).join(','),
    [translationIds]
  );

  const runFetch = React.useCallback(
    async (mode: 'initial' | 'refresh' | 'more'): Promise<void> => {
      const trimmed = query.trim();
      const requestId = ++requestIdRef.current;

      abortRef.current?.abort();
      abortRef.current = null;

      if (!trimmed) {
        setNavigationResults([]);
        setVerses([]);
        setIsLoading(false);
        setIsLoadingMore(false);
        setErrorMessage(null);
        setTotalResults(0);
        pageRef.current = 1;
        totalPagesRef.current = 1;
        return;
      }

      if (mode === 'more') setIsLoadingMore(true);
      else setIsLoading(true);
      if (mode !== 'more') setErrorMessage(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const page = mode === 'more' ? pageRef.current + 1 : 1;

      try {
        const result = await advancedSearch(trimmed, {
          page,
          size: pageSize,
          translationIds,
          signal: controller.signal,
        });

        if (requestIdRef.current !== requestId) return;

        setNavigationResults(result.navigation ?? []);
        setTotalResults(result.pagination?.totalRecords ?? 0);
        totalPagesRef.current = result.pagination?.totalPages ?? 1;
        pageRef.current = result.pagination?.currentPage ?? page;

        if (mode === 'more') {
          setVerses((prev) => {
            const existing = new Set(prev.map((v) => v.verseKey));
            const incoming = (result.verses ?? []).filter((v) => !existing.has(v.verseKey));
            return incoming.length ? [...prev, ...incoming] : prev;
          });
        } else {
          setVerses(result.verses ?? []);
        }
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        if ((error as { name?: string })?.name === 'AbortError') return;
        if (mode !== 'more') {
          setVerses([]);
          setNavigationResults([]);
        }
        setErrorMessage((error as Error).message);
      } finally {
        if (requestIdRef.current !== requestId) return;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [pageSize, query, translationIds, translationKey]
  );

  React.useEffect(() => {
    pageRef.current = 1;
    totalPagesRef.current = 1;
    void runFetch('initial');
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [runFetch]);

  const hasNextPage = pageRef.current < totalPagesRef.current;

  const loadMore = React.useCallback(() => {
    if (isLoading || isLoadingMore) return;
    if (!query.trim()) return;
    if (!hasNextPage) return;
    void runFetch('more');
  }, [hasNextPage, isLoading, isLoadingMore, query, runFetch]);

  const refresh = React.useCallback(() => {
    void runFetch('refresh');
  }, [runFetch]);

  return {
    navigationResults,
    verses,
    isLoading,
    isLoadingMore,
    errorMessage,
    totalResults,
    hasNextPage,
    loadMore,
    refresh,
  };
}

