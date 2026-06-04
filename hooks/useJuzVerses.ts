import React from 'react';

import { useChapters } from '@/hooks/useChapters';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import juzData from '../src/data/juz.json';
import {
  DEFAULT_JUZ_VERSES_PER_PAGE,
  getOfflineJuzCached,
  getOfflineJuzPageCached,
  getOfflineJuzSnapshot,
  peekOfflineJuzCache,
  peekOfflineJuzPageCache,
} from '@/lib/juz/offlineJuzPageCache';
import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';

import type { VerseWord } from '@/types';

export type JuzVerse = {
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

function getJuzVerseCount(
  juzNumber: number,
  chapters: Array<{ id: number; verses_count: number }>
): number {
  const juz = (juzData as any[]).find((j: any) => j.number === juzNumber);
  if (!juz) return 0;

  if (juz.startSurahId === juz.endSurahId) {
    return juz.endAyah - juz.startAyah + 1;
  }

  let count = 0;
  const startSurah = chapters.find((c) => c.id === juz.startSurahId);
  if (startSurah) {
    count += startSurah.verses_count - juz.startAyah + 1;
  }

  for (let id = juz.startSurahId + 1; id < juz.endSurahId; id += 1) {
    const ch = chapters.find((c) => c.id === id);
    if (ch) {
      count += ch.verses_count;
    }
  }

  count += juz.endAyah;
  return count;
}

export function getJuzVerseKeys(
  juzNumber: number,
  chapters: Array<{ id: number; verses_count: number }>
): string[] {
  const juz = (juzData as any[]).find((j: any) => j.number === juzNumber);
  if (!juz) return [];

  const keys: string[] = [];
  if (juz.startSurahId === juz.endSurahId) {
    for (let ayah = juz.startAyah; ayah <= juz.endAyah; ayah += 1) {
      keys.push(`${juz.startSurahId}:${ayah}`);
    }
    return keys;
  }

  const startSurah = chapters.find((c) => c.id === juz.startSurahId);
  if (startSurah) {
    for (let ayah = juz.startAyah; ayah <= startSurah.verses_count; ayah += 1) {
      keys.push(`${juz.startSurahId}:${ayah}`);
    }
  }

  for (let id = juz.startSurahId + 1; id < juz.endSurahId; id += 1) {
    const ch = chapters.find((c) => c.id === id);
    if (ch) {
      for (let ayah = 1; ayah <= ch.verses_count; ayah += 1) {
        keys.push(`${id}:${ayah}`);
      }
    }
  }

  for (let ayah = 1; ayah <= juz.endAyah; ayah += 1) {
    keys.push(`${juz.endSurahId}:${ayah}`);
  }

  return keys;
}

function normalizeTranslationIds(translationIds: number[]): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();

  for (const id of translationIds ?? []) {
    if (!Number.isFinite(id)) continue;
    const normalized = Math.trunc(id);
    if (normalized <= 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
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

function getInitialOfflineJuzPagesSnapshot(params: {
  enabled: boolean;
  juzNumber: number;
  translationIds: number[];
  perPage: number;
  verseCount: number;
}): Record<number, JuzVerse[]> {
  if (!params.enabled) return {};
  if (!Number.isFinite(params.juzNumber) || params.juzNumber <= 0) return {};

  const snapshot = getOfflineJuzSnapshot({
    juzId: params.juzNumber,
    translationIds: params.translationIds,
    perPage: params.perPage,
    expectedVerseCount: params.verseCount,
  });
  if (!snapshot) return {};

  const pages: Record<number, OfflineVerseWithTranslations[]> = {};
  for (const verse of snapshot) {
    const pageNumber = Math.max(1, Math.floor((verse.ayahNumber - 1) / params.perPage) + 1);
    if (!pages[pageNumber]) pages[pageNumber] = [];
    pages[pageNumber].push(verse);
  }

  const nextPages: Record<number, JuzVerse[]> = {};
  for (const [pageNumber, pageVerses] of Object.entries(pages)) {
    nextPages[Number(pageNumber)] = pageVerses
      .slice()
      .sort((a, b) => a.ayahNumber - b.ayahNumber)
      .map((verse) => {
        const translations = verse.translations.map((item) => ({
          resource_id: item.translationId,
          text: item.text,
        }));
        const translationItems = buildTranslationItems(translations, params.translationIds);
        const translationTexts = buildTranslationTexts(translations, params.translationIds);

        primeVerseDetailsCache({
          verseKey: verse.verseKey,
          arabicText: verse.arabicUthmani,
          translationIds: params.translationIds,
          translationTexts,
        });

        let words: VerseWord[] | undefined;
        if (verse.wordsJson) {
          try {
            words = JSON.parse(verse.wordsJson);
          } catch {
            words = undefined;
          }
        }

        return {
          id: undefined,
          verse_number: verse.ayahNumber,
          verse_key: verse.verseKey,
          text_uthmani: verse.arabicUthmani,
          translations,
          translationItems,
          translationTexts,
          words,
        };
      });
  }

  return nextPages;
}

export function useJuzVerses({
  juzNumber,
  translationIds,
  wordLang = 'en',
  perPage = DEFAULT_JUZ_VERSES_PER_PAGE,
  enabled = true,
}: {
  juzNumber: number;
  translationIds: number[];
  wordLang?: string;
  perPage?: number;
  enabled?: boolean;
}): {
  verseCount: number;
  pagesSignature: string;
  hasLoadedContent: boolean;
  getVerseByKey: (verseKey: string) => JuzVerse | undefined;
  ensureVerseRangeLoaded: (startIdx: number, endIdx: number) => void;
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
    () => normalizeTranslationIds(translationIds),
    [translationIds]
  );

  const translationsKey = resolvedTranslationIds.join(',');
  const verseCount = React.useMemo(
    () => getJuzVerseCount(juzNumber, chapters),
    [juzNumber, chapters]
  );

  const initialPagesByNumber = React.useMemo(() => {
    return getInitialOfflineJuzPagesSnapshot({
      enabled,
      juzNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      verseCount,
    });
  }, [enabled, juzNumber, translationsKey, perPage, verseCount, resolvedTranslationIds]);

  const initialHasLoadedContent = Object.keys(initialPagesByNumber).length > 0;

  const [isLoading, setIsLoading] = React.useState(!initialHasLoadedContent);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [offlineNotInstalled, setOfflineNotInstalled] = React.useState(false);
  const [pagesByNumber, setPagesByNumber] = React.useState<Record<number, JuzVerse[]>>(
    initialPagesByNumber
  );

  const pagesByNumberRef = React.useRef<Record<number, JuzVerse[]>>(initialPagesByNumber);
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

  const [prevJuzNumber, setPrevJuzNumber] = React.useState(juzNumber);
  const [prevTranslationsKey, setPrevTranslationsKey] = React.useState(translationsKey);

  if (juzNumber !== prevJuzNumber || translationsKey !== prevTranslationsKey) {
    setPrevJuzNumber(juzNumber);
    setPrevTranslationsKey(translationsKey);

    const warmOfflinePages = getInitialOfflineJuzPagesSnapshot({
      enabled,
      juzNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      verseCount,
    });
    const hasWarmOfflinePages = Object.keys(warmOfflinePages).length > 0;
    const shouldBeLoading = !hasWarmOfflinePages;

    setPagesByNumber(warmOfflinePages);
    pagesByNumberRef.current = warmOfflinePages;
    setIsLoading(shouldBeLoading);
    setErrorMessage(null);
    setOfflineNotInstalled(false);
    setIsRefreshing(false);
    setIsLoadingMore(false);
    dataSourceRef.current = hasWarmOfflinePages ? 'offline' : 'network';
    inFlightPagesRef.current.clear();
  }

  const pagesSignature = React.useMemo(
    () => Object.keys(pagesByNumber).sort((a, b) => Number(a) - Number(b)).join(','),
    [pagesByNumber]
  );
  const hasLoadedContent = React.useMemo(
    () => Object.keys(pagesByNumber).length > 0,
    [pagesByNumber]
  );

  const verseByKeyMap = React.useMemo(() => {
    const map = new Map<string, JuzVerse>();
    for (const pageVerses of Object.values(pagesByNumber)) {
      for (const verse of pageVerses) {
        map.set(verse.verse_key, verse);
      }
    }
    return map;
  }, [pagesByNumber]);

  React.useEffect(() => {
    pagesByNumberRef.current = pagesByNumber;
  }, [pagesByNumber]);

  React.useEffect(() => {
    totalPagesRef.current =
      verseCount > 0 && Number.isFinite(perPage) && perPage > 0
        ? Math.max(1, Math.ceil(verseCount / perPage))
        : 1;
  }, [perPage, verseCount]);

  const normalizeVersePage = React.useCallback(
    (pageVerses: ApiVersesResponse['verses']): JuzVerse[] =>
      (pageVerses ?? []).map((verse) => {
        const translationItems = buildTranslationItems(verse.translations, resolvedTranslationIds);
        const translationTexts = buildTranslationTexts(verse.translations, resolvedTranslationIds);

        primeVerseDetailsCache({
          verseKey: verse.verse_key,
          arabicText: verse.text_uthmani,
          translationIds: resolvedTranslationIds,
          translationTexts,
        });
        return {
          id: verse.id,
          verse_number: verse.verse_number,
          verse_key: verse.verse_key,
          text_uthmani: verse.text_uthmani,
          translations: verse.translations,
          translationItems,
          translationTexts,
        };
      }),
    [resolvedTranslationIds]
  );

  const setPageData = React.useCallback((pageNumber: number, pageVerses: JuzVerse[]) => {
    if (!pageVerses.length) return;

    setPagesByNumber((prev) => {
      const next = { ...prev, [pageNumber]: pageVerses };
      pagesByNumberRef.current = next;
      return next;
    });
  }, []);

  const loadOfflinePage = React.useCallback(
    async (pageNumber: number, token: number): Promise<boolean> => {
      if (!enabled) return false;
      if (!Number.isFinite(juzNumber) || juzNumber <= 0) return false;
      if (!Number.isFinite(pageNumber) || pageNumber <= 0) return false;
      if (verseCount > 0 && pageNumber > totalPagesRef.current) return false;

      const expectedVerseCount = getExpectedPageVerseCount({
        pageNumber,
        perPage,
        verseCount,
      });

      const cachedPage = peekOfflineJuzPageCache({
        juzId: juzNumber,
        translationIds: resolvedTranslationIds,
        page: pageNumber,
        perPage,
      });

      if (cachedPage?.length) {
        const normalized = cachedPage.map((verse) => {
          const translations = verse.translations.map((item) => ({
            resource_id: item.translationId,
            text: item.text,
          }));
          const translationItems = buildTranslationItems(translations, resolvedTranslationIds);
          const translationTexts = buildTranslationTexts(translations, resolvedTranslationIds);

          primeVerseDetailsCache({
            verseKey: verse.verseKey,
            arabicText: verse.arabicUthmani,
            translationIds: resolvedTranslationIds,
            translationTexts,
          });

          let words: VerseWord[] | undefined;
          if (verse.wordsJson) {
            try {
              words = JSON.parse(verse.wordsJson);
            } catch {
              words = undefined;
            }
          }

          return {
            verse_number: verse.ayahNumber,
            verse_key: verse.verseKey,
            text_uthmani: verse.arabicUthmani,
            translations,
            translationItems,
            translationTexts,
            words,
          };
        });

        dataSourceRef.current = 'offline';
        setPageData(pageNumber, normalized);
        setOfflineNotInstalled(false);
        setErrorMessage(null);
        return true;
      }

      const offlineVerses = await getOfflineJuzPageCached({
        juzId: juzNumber,
        translationIds: resolvedTranslationIds,
        page: pageNumber,
        perPage,
        expectedVerseCount,
      });

      if (requestTokenRef.current !== token) return false;
      if (offlineVerses.length === 0 || (expectedVerseCount && offlineVerses.length < expectedVerseCount)) {
        return false;
      }

      const normalized = offlineVerses.map((verse) => {
        const translations = verse.translations.map((item) => ({
          resource_id: item.translationId,
          text: item.text,
        }));
        const translationItems = buildTranslationItems(translations, resolvedTranslationIds);
        const translationTexts = buildTranslationTexts(translations, resolvedTranslationIds);

        primeVerseDetailsCache({
          verseKey: verse.verseKey,
          arabicText: verse.arabicUthmani,
          translationIds: resolvedTranslationIds,
          translationTexts,
        });

        let words: VerseWord[] | undefined;
        if (verse.wordsJson) {
          try {
            words = JSON.parse(verse.wordsJson);
          } catch {
            words = undefined;
          }
        }

        return {
          verse_number: verse.ayahNumber,
          verse_key: verse.verseKey,
          text_uthmani: verse.arabicUthmani,
          translations,
          translationItems,
          translationTexts,
          words,
        };
      });

      dataSourceRef.current = 'offline';
      setPageData(pageNumber, normalized);
      setOfflineNotInstalled(false);
      setErrorMessage(null);
      return true;
    },
    [juzNumber, enabled, perPage, resolvedTranslationIds, setPageData, verseCount]
  );

  const loadOfflineFirstData = React.useCallback(async (token: number): Promise<boolean> => {
    if (!enabled) return false;
    if (!Number.isFinite(juzNumber) || juzNumber <= 0) return false;
    if (requestTokenRef.current !== token) return false;

    const cachedJuz = peekOfflineJuzCache({
      juzId: juzNumber,
      translationIds: resolvedTranslationIds,
    });

    if (
      cachedJuz &&
      cachedJuz.length >= verseCount
    ) {
      const pages: Record<number, OfflineVerseWithTranslations[]> = {};
      for (const verse of cachedJuz) {
        const pageNumber = Math.max(1, Math.floor((verse.ayahNumber - 1) / perPage) + 1);
        if (!pages[pageNumber]) pages[pageNumber] = [];
        pages[pageNumber].push(verse);
      }

      const nextPages: Record<number, JuzVerse[]> = {};
      for (const [pageNumber, pageVerses] of Object.entries(pages)) {
        nextPages[Number(pageNumber)] = pageVerses
          .slice()
          .sort((a, b) => a.ayahNumber - b.ayahNumber)
          .map((verse) => {
            const translations = verse.translations.map((item) => ({
              resource_id: item.translationId,
              text: item.text,
            }));
            const translationItems = buildTranslationItems(translations, resolvedTranslationIds);
            const translationTexts = buildTranslationTexts(translations, resolvedTranslationIds);

            primeVerseDetailsCache({
              verseKey: verse.verseKey,
              arabicText: verse.arabicUthmani,
              translationIds: resolvedTranslationIds,
              translationTexts,
            });

            let words: VerseWord[] | undefined;
            if (verse.wordsJson) {
              try {
                words = JSON.parse(verse.wordsJson);
              } catch {
                words = undefined;
              }
            }

            return {
              verse_number: verse.ayahNumber,
              verse_key: verse.verseKey,
              text_uthmani: verse.arabicUthmani,
              translations,
              translationItems,
              translationTexts,
              words,
            };
          });
      }

      dataSourceRef.current = 'offline';
      setPagesByNumber(nextPages);
      pagesByNumberRef.current = nextPages;
      setOfflineNotInstalled(false);
      setErrorMessage(null);
      return true;
    }

    const offlineVerses = await getOfflineJuzCached({
      juzId: juzNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      expectedVerseCount: verseCount,
    });

    if (requestTokenRef.current !== token) return false;

    if (
      offlineVerses.length === 0 ||
      (verseCount > 0 && offlineVerses.length < verseCount)
    ) {
      return false;
    }

    const pages: Record<number, OfflineVerseWithTranslations[]> = {};
    for (const verse of offlineVerses) {
      const pageNumber = Math.max(1, Math.floor((verse.ayahNumber - 1) / perPage) + 1);
      if (!pages[pageNumber]) pages[pageNumber] = [];
      pages[pageNumber].push(verse);
    }

    const nextPages: Record<number, JuzVerse[]> = {};
    for (const [pageNumber, pageVerses] of Object.entries(pages)) {
      nextPages[Number(pageNumber)] = pageVerses
        .slice()
        .sort((a, b) => a.ayahNumber - b.ayahNumber)
        .map((verse) => {
          const translations = verse.translations.map((item) => ({
            resource_id: item.translationId,
            text: item.text,
          }));
          const translationItems = buildTranslationItems(translations, resolvedTranslationIds);
          const translationTexts = buildTranslationTexts(translations, resolvedTranslationIds);

          primeVerseDetailsCache({
            verseKey: verse.verseKey,
            arabicText: verse.arabicUthmani,
            translationIds: resolvedTranslationIds,
            translationTexts,
          });

          let words: VerseWord[] | undefined;
          if (verse.wordsJson) {
            try {
              words = JSON.parse(verse.wordsJson);
            } catch {
              words = undefined;
            }
          }

          return {
            verse_number: verse.ayahNumber,
            verse_key: verse.verseKey,
            text_uthmani: verse.arabicUthmani,
            translations,
            translationItems,
            translationTexts,
            words,
          };
        });
    }

    dataSourceRef.current = 'offline';
    setPagesByNumber(nextPages);
    pagesByNumberRef.current = nextPages;
    setOfflineNotInstalled(false);
    setErrorMessage(null);
    return true;
  }, [juzNumber, enabled, perPage, resolvedTranslationIds, verseCount]);

  const fetchPage = React.useCallback(
    async (pageNumber: number, token: number): Promise<void> => {
      if (!enabled) return;
      if (!Number.isFinite(juzNumber) || juzNumber <= 0) return;
      if (!Number.isFinite(pageNumber) || pageNumber <= 0) return;
      if (verseCount > 0 && pageNumber > totalPagesRef.current) return;
      if (pagesByNumberRef.current[pageNumber]) return;

      const existingRequest = inFlightPagesRef.current.get(pageNumber);
      if (existingRequest) {
        return existingRequest;
      }

      const request = (async () => {
        try {
          if (dataSourceRef.current === 'offline') {
            const loadedOffline = await loadOfflinePage(pageNumber, token);
            if (loadedOffline) return;

            setOfflineNotInstalled(true);
            setErrorMessage(null);
            return;
          }

          const versesJson = await apiFetch<ApiVersesResponse>(
            `/verses/by_juz/${juzNumber}`,
            {
              language: resolvedWordLang,
              words: 'false',
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
            } catch {
              // Ignore
            }
          }

          setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
          inFlightPagesRef.current.delete(pageNumber);
        }
      })();

      inFlightPagesRef.current.set(pageNumber, request);
      return request;
    },
    [
      juzNumber,
      enabled,
      perPage,
      resolvedWordLang,
      translationsKey,
      resolvedTranslationIds,
      normalizeVersePage,
      loadOfflinePage,
      setPageData,
      verseCount,
    ]
  );

  const ensureVerseRangeLoaded = React.useCallback(
    (startIdx: number, endIdx: number) => {
      if (!enabled) return;
      if (verseCount <= 0) return;

      const token = requestTokenRef.current;
      const startPageNumber = Math.max(1, Math.floor(startIdx / perPage) + 1);
      const endPageNumber = Math.max(
        startPageNumber,
        Math.floor(Math.min(endIdx, verseCount - 1) / perPage) + 1
      );

      for (let pageNumber = startPageNumber; pageNumber <= endPageNumber; pageNumber += 1) {
        if (!pagesByNumberRef.current[pageNumber]) {
          void fetchPage(pageNumber, token);
        }
      }
    },
    [enabled, perPage, fetchPage, verseCount]
  );

  const loadInitialWindow = React.useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (!enabled) return;
      if (!Number.isFinite(juzNumber) || juzNumber <= 0) return;

      const token = ++requestTokenRef.current;
      inFlightPagesRef.current.clear();

      const warmOfflinePages = getInitialOfflineJuzPagesSnapshot({
        enabled,
        juzNumber,
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
            if (!previousPage || !nextPage) return warmOfflinePages;
            if (previousPage.length !== nextPage.length) return warmOfflinePages;
          }

          return previous;
        });
        setErrorMessage(null);
        setOfflineNotInstalled(false);
        setIsLoadingMore(false);
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
        return;
      }

      setErrorMessage(null);
      setOfflineNotInstalled(false);
      setIsLoadingMore(false);

      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);

      try {
        const loadedOfflineFirst = await loadOfflineFirstData(token);
        if (requestTokenRef.current !== token) return;
        if (loadedOfflineFirst) return;

        await fetchPage(1, token);
      } finally {
        if (requestTokenRef.current !== token) return;
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
      }
    },
    [
      juzNumber,
      enabled,
      perPage,
      resolvedTranslationIds,
      verseCount,
      loadOfflineFirstData,
      fetchPage,
    ]
  );

  React.useEffect(() => {
    void loadInitialWindow('initial');
  }, [loadInitialWindow]);

  const refresh = React.useCallback(() => {
    void loadInitialWindow('refresh');
  }, [loadInitialWindow]);

  const retry = React.useCallback(() => {
    void loadInitialWindow('initial');
  }, [loadInitialWindow]);

  const loadMore = React.useCallback(() => {
    if (isLoading || isLoadingMore || errorMessage) return;

    const loadedPages = Object.keys(pagesByNumberRef.current).map(Number);
    if (loadedPages.length === 0) return;

    const nextPage = Math.max(...loadedPages) + 1;
    if (nextPage > totalPagesRef.current) return;

    setIsLoadingMore(true);
    fetchPage(nextPage, requestTokenRef.current)
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [isLoading, isLoadingMore, errorMessage, fetchPage]);

  const getVerseByKey = React.useCallback(
    (verseKey: string) => verseByKeyMap.get(verseKey),
    [verseByKeyMap]
  );

  return {
    verseCount,
    pagesSignature,
    hasLoadedContent,
    getVerseByKey,
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
