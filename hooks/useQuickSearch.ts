import React from 'react';

import { analyzeQuery, type SearchNavigationResult, type SearchVerseResult } from '@/lib/api/search';
import { getSearchErrorMessage } from '@/lib/search/searchError';
import { searchOffline } from '@/lib/search/searchService';
import { isArabicQuery } from '@/lib/utils/searchHighlight';

const MIN_TEXT_QUERY_LENGTH = 3;
// Arabic words are often two or three letters, e.g. رب.
const MIN_ARABIC_QUERY_LENGTH = 2;
// Offline search takes milliseconds, so the debounce only coalesces fast typing.
const DEFAULT_DEBOUNCE_MS = 150;

/** Search-as-you-type over the offline index: the Arabic text and installed translations. */
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

    const minLength = isArabicQuery(trimmed) ? MIN_ARABIC_QUERY_LENGTH : MIN_TEXT_QUERY_LENGTH;
    if (trimmed.length < minLength && !isNavigationQuery) {
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
          const results = await searchOffline(trimmed, { page: 1, size: perPage, translationIds });
          if (requestIdRef.current !== requestId || controller.signal.aborted) return;
          setNavigationResults(results.navigation ?? []);
          setVerseResults(results.verses ?? []);
        } catch (error) {
          if (requestIdRef.current !== requestId) return;
          if ((error as { name?: string })?.name === 'AbortError') return;
          setNavigationResults([]);
          setVerseResults([]);
          setErrorMessage(getSearchErrorMessage(error));
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
