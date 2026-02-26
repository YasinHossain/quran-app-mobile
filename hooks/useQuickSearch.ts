import React from 'react';

import { analyzeQuery, quickSearch, type SearchNavigationResult, type SearchVerseResult } from '@/lib/api/search';

const MIN_TEXT_QUERY_LENGTH = 3;
const DEFAULT_DEBOUNCE_MS = 300;

export function useQuickSearch({
  query,
  translationIds,
  perPage = 10,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
}: {
  query: string;
  translationIds: number[];
  perPage?: number;
  debounceMs?: number;
  enabled?: boolean;
}): {
  isLoading: boolean;
  errorMessage: string | null;
  navigationResults: SearchNavigationResult[];
  verseResults: SearchVerseResult[];
} {
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [navigationResults, setNavigationResults] = React.useState<SearchNavigationResult[]>([]);
  const [verseResults, setVerseResults] = React.useState<SearchVerseResult[]>([]);

  const translationKey = React.useMemo(
    () => translationIds.filter((id) => Number.isFinite(id) && id > 0).join(','),
    [translationIds]
  );

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setErrorMessage(null);
      setNavigationResults([]);
      setVerseResults([]);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    abortRef.current?.abort();
    abortRef.current = null;

    const requestId = ++requestIdRef.current;
    const trimmed = query.trim();

    if (!trimmed) {
      setIsLoading(false);
      setErrorMessage(null);
      setNavigationResults([]);
      setVerseResults([]);
      return;
    }

    const parsed = analyzeQuery(trimmed);
    const isNavigationQuery = parsed.type === 'navigation' && parsed.navigationType;

    if (trimmed.length < MIN_TEXT_QUERY_LENGTH && !isNavigationQuery) {
      setIsLoading(false);
      setErrorMessage(null);
      setNavigationResults([]);
      setVerseResults([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await quickSearch(trimmed, {
            perPage,
            translationIds,
            signal: controller.signal,
          });
          if (requestIdRef.current !== requestId) return;
          setNavigationResults(results.navigation ?? []);
          setVerseResults(results.verses ?? []);
        } catch (error) {
          if (requestIdRef.current !== requestId) return;
          if ((error as { name?: string })?.name === 'AbortError') return;
          setNavigationResults([]);
          setVerseResults([]);
          setErrorMessage((error as Error).message);
        } finally {
          if (requestIdRef.current !== requestId) return;
          setIsLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [debounceMs, enabled, perPage, query, translationIds, translationKey]);

  return { isLoading, errorMessage, navigationResults, verseResults };
}
