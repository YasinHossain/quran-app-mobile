/**
 * Mobile search orchestration.
 *
 * - Quick search (typing in the search box) is offline only: instant, and it works
 *   without a connection.
 * - Deep search (the full results screen) goes online first so every translation is
 *   searched, merges offline matches into the API's pool for better ranking, and falls
 *   back to offline results when the first page cannot be fetched.
 */

import {
  advancedSearch,
  analyzeQuery,
  getExactNavigationResult,
  type SearchNavigationResult,
  type SearchResponse,
  type SearchVerseResult,
} from '@/lib/api/search';
import {
  findSurahNameMatches,
  loadLocalSearchDisplay,
  loadQueryTermWeights,
  searchLocalIndex,
  type LocalSearchMatch,
  type SearchIndexReader,
  type SearchSqlParam,
} from '@/lib/search/localSearchEngine';
import { highlightSearchMatches, tokenizeSearchText } from '@/lib/search/searchText';
import { getAppDbAsync } from '@/src/core/infrastructure/db';
import { prepareSearchIndexAsync } from '@/src/core/infrastructure/search/prepareSearchIndex';
import { getBundledSaheehVerses } from '@/src/core/infrastructure/translations/bundledSaheehInternational';
import chapters from '../../src/data/chapters.en.json';
import translationsJson from '../../src/data/translations.json';

export type SearchSource = 'online' | 'offline';
export type SourcedSearchResponse = SearchResponse & { source: SearchSource };

const ONLINE_TIMEOUT_MS = 8_000;
// Offline matches merged into the online pool. The API contributes 50 of its own.
const LOCAL_MERGE_COUNT = 50;
const LOCAL_MATCH_CACHE_TTL_MS = 30_000;
const LOCAL_MATCH_CACHE_SIZE = 4;

const translationNames = new Map(
  (translationsJson as Array<{ id: number; name: string }>).map((entry) => [entry.id, entry.name])
);

const localMatchCache = new Map<string, { expiresAt: number; matches: LocalSearchMatch[] }>();
let bundledArabicByVerseKey: Map<string, string> | null = null;

function emptyResponse(source: SearchSource): SourcedSearchResponse {
  return {
    navigation: [],
    verses: [],
    pagination: { currentPage: 1, nextPage: null, totalPages: 0, totalRecords: 0 },
    source,
  };
}

async function getSearchReaderAsync(): Promise<SearchIndexReader> {
  const db = await getAppDbAsync();
  return {
    getAll<T>(sql: string, params: readonly SearchSqlParam[]): Promise<T[]> {
      return db.getAllAsync<T>(sql, [...params]);
    },
  };
}

// offline_verses only holds verses of installed translations. If every translation was
// removed, Arabic matches still need their Uthmani text, which ships with the app.
function getBundledArabicText(verseKey: string): string {
  bundledArabicByVerseKey ??= new Map(
    getBundledSaheehVerses().map((verse) => [verse.verseKey, verse.arabicUthmani])
  );
  return bundledArabicByVerseKey.get(verseKey) ?? '';
}

async function getLocalMatchesAsync(
  query: string,
  translationIds: readonly number[]
): Promise<LocalSearchMatch[]> {
  const cacheKey = `${[...translationIds].sort((a, b) => a - b).join(',')}|${query}`;
  const cached = localMatchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.matches;

  // Search whatever is indexed even if preparation failed; it logs its own error.
  await prepareSearchIndexAsync().catch(() => undefined);
  const matches = await searchLocalIndex(await getSearchReaderAsync(), query, {
    preferredTranslationIds: translationIds,
  });

  localMatchCache.delete(cacheKey);
  localMatchCache.set(cacheKey, { expiresAt: Date.now() + LOCAL_MATCH_CACHE_TTL_MS, matches });
  while (localMatchCache.size > LOCAL_MATCH_CACHE_SIZE) {
    localMatchCache.delete(localMatchCache.keys().next().value!);
  }
  return matches;
}

async function toVerseResultsAsync(
  matches: readonly LocalSearchMatch[],
  query: string,
  translationIds: readonly number[]
): Promise<SearchVerseResult[]> {
  if (matches.length === 0) return [];

  const queryTokens = tokenizeSearchText(query);
  const display = await loadLocalSearchDisplay(
    await getSearchReaderAsync(),
    matches,
    translationIds,
    getBundledArabicText
  );

  return matches.map((match) => {
    const entry = display.get(match.verseKey);
    const arabicText = entry?.arabicText ?? '';
    const translationId = entry?.translationId ?? null;
    return {
      verseKey: match.verseKey,
      verseId: match.verseId,
      surahNumber: match.surahNumber,
      verseNumber: match.verseNumber,
      textArabic: arabicText,
      highlightedTranslation: highlightSearchMatches(entry?.translationText ?? '', queryTokens),
      translationName: translationId !== null ? translationNames.get(translationId) ?? '' : '',
      ...(match.source === 'arabic'
        ? { highlightedArabic: highlightSearchMatches(arabicText, queryTokens) }
        : {}),
      matchSource: match.source,
    };
  });
}

function getLocalNavigation(query: string): SearchNavigationResult[] {
  const results: SearchNavigationResult[] = [];
  const exact = getExactNavigationResult(query);
  if (exact) results.push(exact);

  for (const match of findSurahNameMatches(query, chapters)) {
    if (results.some((result) => result.resultType === 'surah' && Number(result.key) === match.surahId)) {
      continue;
    }
    results.push({ resultType: 'surah', key: match.surahId, name: match.name });
  }
  return results;
}

/** Paged search over the offline index (installed translations and the Arabic text). */
export async function searchOffline(
  query: string,
  options: { page?: number; size?: number; translationIds: readonly number[] }
): Promise<SourcedSearchResponse> {
  const { page = 1, size = 10, translationIds } = options;
  const trimmed = query.trim();
  if (!trimmed) return emptyResponse('offline');

  const navigation = getLocalNavigation(trimmed);
  const parsed = analyzeQuery(trimmed);
  if (parsed.type === 'navigation' && parsed.isExplicit && navigation.length > 0) {
    return {
      navigation,
      verses: [],
      pagination: { currentPage: 1, nextPage: null, totalPages: 1, totalRecords: 0 },
      source: 'offline',
    };
  }

  const matches = await getLocalMatchesAsync(trimmed, translationIds);
  const start = (page - 1) * size;
  const verses = await toVerseResultsAsync(matches.slice(start, start + size), trimmed, translationIds);
  const totalPages = Math.ceil(matches.length / size);

  return {
    navigation,
    verses,
    pagination: {
      currentPage: page,
      nextPage: page < totalPages ? page + 1 : null,
      totalPages,
      totalRecords: matches.length,
    },
    source: 'offline',
  };
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Full results search: online first, offline when the first page cannot be fetched.
 * Later pages never switch source, so a list is not mixed mid-scroll; their errors are
 * thrown for the caller to offer a retry.
 */
export async function deepSearch(
  query: string,
  options: { page?: number; size?: number; translationIds: readonly number[]; signal?: AbortSignal }
): Promise<SourcedSearchResponse> {
  const { page = 1, size = 10, translationIds, signal } = options;
  const trimmed = query.trim();
  if (!trimmed) return emptyResponse('online');

  let localCandidates: SearchVerseResult[] = [];
  let termWeights: number[] | undefined;
  try {
    localCandidates = (
      await searchOffline(trimmed, { page: 1, size: LOCAL_MERGE_COUNT, translationIds })
    ).verses;
    termWeights = await loadQueryTermWeights(await getSearchReaderAsync(), trimmed);
  } catch {
    // Online results stand on their own when the offline index is unavailable.
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS);
  const abortFromCaller = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  try {
    const online = await advancedSearch(trimmed, {
      page,
      size,
      translationIds: [...translationIds],
      signal: controller.signal,
      localCandidates,
      termWeights,
    });
    return { ...online, source: 'online' };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (page > 1) {
      throw isAbortError(error) ? new Error('Search timed out. Check your connection and try again.') : error;
    }
    return searchOffline(trimmed, { page, size, translationIds });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
