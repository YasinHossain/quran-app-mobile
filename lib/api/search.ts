/**
 * Comprehensive Search API (mobile)
 *
 * Ported from the web app (`../quran-app/lib/api/search.ts`) but adapted for React Native:
 * - Uses public APIs directly (QDC + Quran.com V4).
 * - No Next.js proxy routes or server-only environment configuration.
 */

// Relative so the offline-search node tests can compile this module.
import { normalizeNumeralsToAscii } from '../search/numerals';
import { rankSearchResults } from '../search/searchRanking';

// ============================================================================
// Types
// ============================================================================

export type SearchNavigationType =
  | 'surah'
  | 'ayah'
  | 'juz'
  | 'page'
  | 'search_page'
  | 'hizb'
  | 'rub_el_hizb'
  | 'range'
  | 'quran_range'
  | 'translation'
  | 'transliteration'
  | 'history';

export interface SearchNavigationResult {
  resultType: SearchNavigationType;
  key: string | number;
  name: string;
  isArabic?: boolean;
  isTransliteration?: boolean;
}

export interface SearchVerseResult {
  verseKey: string;
  verseId?: number | undefined;
  surahNumber: number;
  verseNumber: number;
  textArabic: string;
  highlightedTranslation: string;
  translationName: string;
  /** Uthmani text with `<em>` highlights, set by offline search for Arabic matches. */
  highlightedArabic?: string;
  /** Which text matched; offline results set it so cards highlight the right one. */
  matchSource?: 'arabic' | 'translation';
}

export interface SearchResponse {
  navigation: SearchNavigationResult[];
  verses: SearchVerseResult[];
  pagination: {
    currentPage: number;
    nextPage: number | null;
    totalPages: number;
    totalRecords: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const QDC_SEARCH_BASE_URL = 'https://api.qurancdn.com/api/qdc/';
const V4_SEARCH_BASE_URL = 'https://api.quran.com/api/v4/';
const SEARCH_CACHE_TTL_MS = 30_000;

// ============================================================================
// Low-level helpers
// ============================================================================

type CachedSearchResult = {
  expiresAt: number;
  value: SearchResponse;
};

const v4SearchCache = new Map<string, CachedSearchResult>();
const v4SearchInFlight = new Map<string, Promise<SearchResponse>>();
const qdcSearchCache = new Map<string, CachedSearchResult>();
const qdcSearchInFlight = new Map<string, Promise<SearchResponse>>();

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeQueryForCache(query: string): string {
  return query.trim();
}

function normalizeTranslationIdsForKey(translationIds: number[]): number[] {
  return Array.from(
    new Set(
      translationIds
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isFinite(id))
    )
  ).sort((a, b) => a - b);
}

function buildV4SearchCacheKey(query: string, size: number, page: number): string {
  const normalizedQuery = normalizeQueryForCache(query);
  return [normalizedQuery, size.toString(), page.toString()].join('|');
}

function buildQdcSearchCacheKey(
  query: string,
  size: number,
  page: number,
  translationIds: number[]
): string {
  const normalizedQuery = normalizeQueryForCache(query);
  const translationKey = normalizeTranslationIdsForKey(translationIds).join(',');
  return [normalizedQuery, size.toString(), page.toString(), translationKey].join('|');
}

function getCachedSearchResult(
  cache: Map<string, CachedSearchResult>,
  key: string
): SearchResponse | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedSearchResult(
  cache: Map<string, CachedSearchResult>,
  key: string,
  value: SearchResponse
): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

function decodeHtmlEntities(input: string): string {
  return (
    input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      // Numeric entities
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
        const codePoint = Number.parseInt(hex, 16);
        if (!Number.isFinite(codePoint)) return '';
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      })
      .replace(/&#(\d+);/g, (_, dec: string) => {
        const codePoint = Number.parseInt(dec, 10);
        if (!Number.isFinite(codePoint)) return '';
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      })
  );
}

function stripHtmlTags(html: string): string {
  let result = html;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  }
  return decodeHtmlEntities(result);
}

function createTimeoutSignal(
  timeoutMs: number,
  upstreamSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const handleUpstreamAbort = (): void => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', handleUpstreamAbort);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener('abort', handleUpstreamAbort);
    },
  };
}

async function fetchJson<T>(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number; errorPrefix?: string } = {}
): Promise<T> {
  const { timeoutMs = 12_000, signal, errorPrefix = 'Request failed' } = options;
  const { signal: timedSignal, cleanup } = createTimeoutSignal(timeoutMs, signal);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: timedSignal,
    });

    if (!res.ok) {
      throw new Error(`${errorPrefix} (${res.status})`);
    }

    return (await res.json()) as T;
  } finally {
    cleanup();
  }
}

function parseVerseKey(verseKey: string): { surahNumber: number; ayahNumber: number } {
  const [s, a] = verseKey.split(':');
  const surahNumber = Number.parseInt(String(s ?? ''), 10);
  const ayahNumber = Number.parseInt(String(a ?? ''), 10);
  return {
    surahNumber: Number.isFinite(surahNumber) ? surahNumber : 0,
    ayahNumber: Number.isFinite(ayahNumber) ? ayahNumber : 0,
  };
}

// ============================================================================
// Query parsing (navigation detection)
// ============================================================================

interface ParsedQuery {
  type: 'navigation' | 'text';
  navigationType?: SearchNavigationType;
  isExplicit?: boolean;
  value?: string | number;
  surah?: number;
  verse?: number;
}

// Words that introduce a reference number, per language. Matched in either order
// ("para 30", "৩০ পারা"), since Bangla readers often put the number first.
const NAVIGATION_KEYWORDS = {
  juz: ['juz', 'para', 'পারা', 'পাড়া', 'জুজ', 'জুয'],
  page: ['page', 'p', 'পৃষ্ঠা', 'পৃষ্টা', 'পেজ', 'পাতা'],
  surah: ['surah', 'sura', 'surat', 'chapter', 'সূরা', 'সুরা', 'সূরাহ', 'সুরাহ'],
} as const;

// Bangla ordinal and "number" markers that may follow the number: ১ম, ২য়, ৪র্থ, ১১তম, ৫ নং.
const NUMBER_SUFFIXES = ['ম', 'য়', 'র্থ', 'ষ্ঠ', 'তম', 'নং', 'নম্বর'];

// Bangla has two encodings for letters like য় and ড়; NFC gives both the same form.
function toAlternation(words: readonly string[]): string {
  return words.map((word) => word.normalize('NFC')).join('|');
}

function buildKeywordNumberPattern(keywords: readonly string[]): RegExp {
  const keyword = `(?:${toAlternation(keywords)})`;
  const suffix = `(?:\\s*(?:${toAlternation(NUMBER_SUFFIXES)}))?`;
  return new RegExp(`^(?:${keyword}\\s*(\\d{1,3})|(\\d{1,3})${suffix}\\s*${keyword})$`);
}

const JUZ_PATTERN = buildKeywordNumberPattern(NAVIGATION_KEYWORDS.juz);
const PAGE_PATTERN = buildKeywordNumberPattern(NAVIGATION_KEYWORDS.page);
const SURAH_PATTERN = buildKeywordNumberPattern(NAVIGATION_KEYWORDS.surah);

function matchKeywordNumber(query: string, pattern: RegExp): number | null {
  const match = query.match(pattern);
  const digits = match?.[1] ?? match?.[2];
  return digits ? parseInt(digits, 10) : null;
}

function parseQuery(query: string): ParsedQuery {
  const trimmed = normalizeNumeralsToAscii(query.trim().toLowerCase().normalize('NFC')).replace(
    /\s+/g,
    ' '
  );

  // Ayah pattern: "2:255" or "2-255" or "2.255"
  const ayahMatch = trimmed.match(/^(\d{1,3})[:.-](\d{1,3})$/);
  if (ayahMatch) {
    return {
      type: 'navigation',
      navigationType: 'ayah',
      isExplicit: true,
      surah: parseInt(ayahMatch[1]!, 10),
      verse: parseInt(ayahMatch[2]!, 10),
    };
  }

  // Juz pattern: "juz 1", "para 30", "পারা ১", "৩০ পারা"
  const juzNumber = matchKeywordNumber(trimmed, JUZ_PATTERN);
  if (juzNumber !== null) {
    return { type: 'navigation', navigationType: 'juz', isExplicit: true, value: juzNumber };
  }

  // Page pattern: "page 50", "p50", "পৃষ্ঠা ৫০"
  const pageNumber = matchKeywordNumber(trimmed, PAGE_PATTERN);
  if (pageNumber !== null) {
    return { type: 'navigation', navigationType: 'page', isExplicit: true, value: pageNumber };
  }

  // Surah pattern: "surah 36", "chapter 36", "সূরা ৩৬"
  const surahNumber = matchKeywordNumber(trimmed, SURAH_PATTERN);
  if (surahNumber !== null && surahNumber >= 1 && surahNumber <= 114) {
    return { type: 'navigation', navigationType: 'surah', isExplicit: true, value: surahNumber };
  }

  // Surah number only: "36", "1", "114"
  const surahNumberMatch = trimmed.match(/^(\d{1,3})$/);
  if (surahNumberMatch) {
    const num = parseInt(surahNumberMatch[1]!, 10);
    if (num >= 1 && num <= 114) {
      return {
        type: 'navigation',
        navigationType: 'surah',
        isExplicit: false,
        value: num,
      };
    }
  }

  // Default: text search
  return { type: 'text' };
}

function buildExactNavigationResult(parsed: ParsedQuery): SearchNavigationResult | null {
  if (parsed.type !== 'navigation' || !parsed.navigationType) return null;

  switch (parsed.navigationType) {
    case 'page': {
      const pageNumber = typeof parsed.value === 'number' ? parsed.value : Number(parsed.value);
      // The 15-line IndoPak print has the most pages; the page reader clamps to the selected one.
      if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 610) return null;
      return { resultType: 'page', key: pageNumber, name: `Page ${pageNumber}` };
    }
    case 'juz': {
      const juzNumber = typeof parsed.value === 'number' ? parsed.value : Number(parsed.value);
      if (!Number.isFinite(juzNumber) || juzNumber < 1 || juzNumber > 30) return null;
      return { resultType: 'juz', key: juzNumber, name: `Juz ${juzNumber}` };
    }
    case 'surah': {
      const surahNumber = typeof parsed.value === 'number' ? parsed.value : Number(parsed.value);
      if (!Number.isFinite(surahNumber) || surahNumber < 1 || surahNumber > 114) return null;
      return { resultType: 'surah', key: surahNumber, name: `Surah ${surahNumber}` };
    }
    case 'ayah': {
      const surahNumber = typeof parsed.surah === 'number' ? parsed.surah : Number(parsed.surah);
      const verseNumber = typeof parsed.verse === 'number' ? parsed.verse : Number(parsed.verse);
      if (!Number.isFinite(surahNumber) || surahNumber < 1 || surahNumber > 114) return null;
      if (!Number.isFinite(verseNumber) || verseNumber < 1) return null;
      return { resultType: 'ayah', key: `${surahNumber}:${verseNumber}`, name: `${surahNumber}:${verseNumber}` };
    }
    default:
      return null;
  }
}

/**
 * Analyze query and return parsed navigation intent.
 * Useful for client-side quick navigation before API call.
 */
export function analyzeQuery(query: string): ParsedQuery {
  return parseQuery(query);
}

// ============================================================================
// Public API fetchers
// ============================================================================

interface QdcApiNavigationResult {
  result_type: string;
  name: string;
  key: string | number;
  isArabic?: boolean;
  isTransliteration?: boolean;
}

interface QdcApiWord {
  char_type: string;
  text: string;
}

interface QdcApiTranslation {
  text: string;
  resource_id: number;
  resource_name: string;
  language_name: string;
}

interface QdcApiVerseResult {
  verse_key: string;
  verse_id?: number;
  words?: QdcApiWord[];
  translations?: QdcApiTranslation[];
}

interface QdcApiSearchResponse {
  result: {
    navigation: QdcApiNavigationResult[];
    verses: QdcApiVerseResult[];
  };
  pagination: {
    per_page: number;
    current_page: number;
    next_page: number | null;
    total_pages: number;
    total_records: number;
  };
}

async function fetchQdcSearch(
  query: string,
  {
    size,
    page,
    translationIds,
    signal,
  }: {
    size: number;
    page: number;
    translationIds: number[];
    signal?: AbortSignal;
  }
): Promise<SearchResponse> {
  const normalizedTranslationIds = normalizeTranslationIdsForKey(translationIds);
  const translationsParam = (normalizedTranslationIds.length ? normalizedTranslationIds : [20]).join(',');
  const cacheKey = buildQdcSearchCacheKey(query, size, page, normalizedTranslationIds);

  const cached = getCachedSearchResult(qdcSearchCache, cacheKey);
  if (cached) return cached;

  if (!signal) {
    const inFlight = qdcSearchInFlight.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const request = (async (): Promise<SearchResponse> => {
    const url = new URL('search', ensureTrailingSlash(QDC_SEARCH_BASE_URL));
    url.searchParams.set('q', query.trim());
    url.searchParams.set('size', size.toString());
    url.searchParams.set('page', page.toString());
    url.searchParams.set('translations', translationsParam);

    const data = await fetchJson<QdcApiSearchResponse>(url.toString(), {
      signal,
      errorPrefix: 'Search failed',
    });

    const navigation: SearchNavigationResult[] = (data.result.navigation ?? []).map((nav) => ({
      resultType: nav.result_type as SearchNavigationType,
      key: nav.key,
      name: nav.name,
      ...(nav.isArabic ? { isArabic: true } : {}),
      ...(nav.isTransliteration ? { isTransliteration: true } : {}),
    }));

    const verses: SearchVerseResult[] = (data.result.verses ?? []).map((verse) => {
      const { surahNumber, ayahNumber } = parseVerseKey(verse.verse_key);
      const arabicText = (verse.words ?? [])
        .filter((w) => w.char_type === 'word')
        .map((w) => w.text)
        .join(' ');

      const translations = verse.translations ?? [];
      const bestTranslation = translations[0];

      return {
        verseKey: verse.verse_key,
        verseId: verse.verse_id,
        surahNumber,
        verseNumber: ayahNumber,
        textArabic: arabicText,
        highlightedTranslation: bestTranslation?.text ?? '',
        translationName: bestTranslation?.resource_name ?? '',
      };
    });

    const result: SearchResponse = {
      navigation,
      verses,
      pagination: {
        currentPage: data.pagination.current_page,
        nextPage: data.pagination.next_page,
        totalPages: data.pagination.total_pages,
        totalRecords: data.pagination.total_records,
      },
    };

    setCachedSearchResult(qdcSearchCache, cacheKey, result);
    return result;
  })();

  if (!signal) qdcSearchInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (!signal) qdcSearchInFlight.delete(cacheKey);
  }
}

// V4 API Search (searches across ALL translations)

interface V4ApiTranslation {
  text: string;
  resource_id: number;
  name: string;
  language_name: string;
}

interface V4ApiWord {
  char_type: string;
  text: string;
}

interface V4ApiSearchResult {
  verse_key: string;
  verse_id: number;
  text: string;
  highlighted: string | null;
  words: V4ApiWord[];
  translations: V4ApiTranslation[];
}

interface V4ApiSearchResponse {
  search: {
    query: string;
    total_results: number;
    current_page: number;
    total_pages: number;
    results: V4ApiSearchResult[];
  };
}

async function fetchV4Search(
  query: string,
  size: number = 10,
  page: number = 1,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const cacheKey = buildV4SearchCacheKey(query, size, page);
  const cached = getCachedSearchResult(v4SearchCache, cacheKey);
  if (cached) return cached;

  if (!signal) {
    const inFlight = v4SearchInFlight.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const request = (async (): Promise<SearchResponse> => {
    const url = new URL('search', ensureTrailingSlash(V4_SEARCH_BASE_URL));
    url.searchParams.set('q', query.trim());
    url.searchParams.set('size', size.toString());
    url.searchParams.set('page', page.toString());

    const data = await fetchJson<V4ApiSearchResponse>(url.toString(), {
      signal,
      errorPrefix: 'V4 Search failed',
    });

    const verses: SearchVerseResult[] = (data.search.results ?? []).map((result) => {
      const { surahNumber, ayahNumber } = parseVerseKey(result.verse_key);
      const arabicText = (result.words ?? [])
        .filter((w) => w.char_type === 'word')
        .map((w) => w.text)
        .join(' ');
      const translation = result.translations?.[0];

      return {
        verseKey: result.verse_key,
        verseId: result.verse_id,
        surahNumber,
        verseNumber: ayahNumber,
        textArabic: arabicText || result.text,
        highlightedTranslation: translation?.text ?? '',
        translationName: translation?.name ?? '',
      };
    });

    const response: SearchResponse = {
      navigation: [],
      verses,
      pagination: {
        currentPage: data.search.current_page,
        nextPage: data.search.current_page < data.search.total_pages ? data.search.current_page + 1 : null,
        totalPages: data.search.total_pages,
        totalRecords: data.search.total_results,
      },
    };

    setCachedSearchResult(v4SearchCache, cacheKey, response);
    return response;
  })();

  if (!signal) v4SearchInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (!signal) v4SearchInFlight.delete(cacheKey);
  }
}

// ============================================================================
// Ranking
// ============================================================================

/**
 * Re-ranks API results with the scorer shared by offline search, so online and offline
 * lists order verses the same way.
 */
function rankVersesForQuery(
  verses: SearchVerseResult[],
  query: string,
  termWeights?: readonly number[]
): SearchVerseResult[] {
  const arabicQuery = isArabicScriptQuery(query);
  return rankSearchResults(
    verses,
    query,
    (verse) =>
      stripHtmlTags(arabicQuery ? verse.highlightedArabic ?? verse.textArabic : verse.highlightedTranslation),
    { termWeights }
  );
}

function isArabicScriptQuery(query: string): boolean {
  const letters = query.replace(/[\s\p{P}\p{N}]/gu, '');
  const arabicLetters = letters.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  return letters.length > 0 && arabicLetters / letters.length > 0.5;
}

/** Interleaves two ranked lists and drops repeated verses, keeping the first copy. */
function interleaveUniqueVerses(
  first: SearchVerseResult[],
  second: SearchVerseResult[]
): SearchVerseResult[] {
  const seen = new Set<string>();
  const merged: SearchVerseResult[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    for (const verse of [first[index], second[index]]) {
      if (!verse || seen.has(verse.verseKey)) continue;
      seen.add(verse.verseKey);
      merged.push(verse);
    }
  }
  return merged;
}

function sortNavigationByExactMatch(
  navigation: SearchNavigationResult[],
  query: string
): SearchNavigationResult[] {
  if (!navigation.length) return navigation;

  const queryNumbers = normalizeNumeralsToAscii(query).match(/\d+/g);
  if (!queryNumbers || queryNumbers.length === 0) return navigation;

  const queryNumber = queryNumbers[0]!;
  const queryNumberInt = parseInt(queryNumber, 10);

  const scored = navigation.map((nav) => {
    const navKeyNumber = parseInt(String(nav.key), 10);
    const navNameNumbers = nav.name.match(/\d+/g);
    const navNameNumberInt = navNameNumbers ? parseInt(navNameNumbers[0]!, 10) : null;

    let score = 0;

    // Exact match on key or name number
    if (Number.isFinite(navKeyNumber) && navKeyNumber === queryNumberInt) score += 100;
    if (navNameNumberInt !== null && navNameNumberInt === queryNumberInt) score += 90;

    // Starts with (e.g., 3 -> 30)
    if (String(nav.key).startsWith(queryNumber)) score += 10;

    return { nav, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.nav);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Navigation result for a reference the user typed (2:255, juz 30, page 50, 36),
 * resolved without the network.
 */
export function getExactNavigationResult(query: string): SearchNavigationResult | null {
  return buildExactNavigationResult(parseQuery(query));
}

/**
 * Advanced search for the full results list (paged).
 *
 * `localCandidates` are offline matches from the user's installed translations. They join
 * the API's best-match pool before ranking, because the offline index ranks the whole
 * Quran while the API returns only its own top results. `termWeights` (from the offline
 * index) let rare query words count more than common ones when ranking the pool.
 */
export async function advancedSearch(
  query: string,
  options: {
    page?: number;
    size?: number;
    translationIds?: number[];
    signal?: AbortSignal;
    localCandidates?: SearchVerseResult[];
    termWeights?: readonly number[];
  } = {}
): Promise<SearchResponse> {
  const {
    page = 1,
    size = 10,
    translationIds = [20],
    signal,
    localCandidates = [],
    termWeights,
  } = options;

  const trimmed = query.trim();
  if (!trimmed) {
    return {
      navigation: [],
      verses: [],
      pagination: { currentPage: 1, nextPage: null, totalPages: 0, totalRecords: 0 },
    };
  }

  const parsed = parseQuery(query);
  if (parsed.type === 'navigation' && parsed.isExplicit) {
    const exactNavigation = buildExactNavigationResult(parsed);
    if (exactNavigation) {
      return {
        navigation: [exactNavigation],
        verses: [],
        pagination: { currentPage: 1, nextPage: null, totalPages: 1, totalRecords: 0 },
      };
    }
  }

  try {
    const sortWindowSize = 50;
    const bestMatchPool = await fetchV4Search(query, sortWindowSize, 1, signal);
    // Local copies come first so a verse found both ways shows the reader's translation.
    const sortedPool = rankVersesForQuery(
      interleaveUniqueVerses(localCandidates, bestMatchPool.verses),
      query,
      termWeights
    );

    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    // Pages past the ranked pool continue with the API pages the pool did not cover.
    const poolPages = Math.ceil(sortedPool.length / size);
    const apiPagesInPool = Math.floor(sortWindowSize / size);

    let versesToReturn: SearchVerseResult[] = [];
    if (startIndex < sortedPool.length) {
      versesToReturn = sortedPool.slice(startIndex, endIndex);
    } else {
      const standardPage = await fetchV4Search(query, size, page - poolPages + apiPagesInPool, signal);
      versesToReturn = standardPage.verses;
    }

    const qdcResults = await fetchQdcSearch(query, {
      size: 5,
      page: 1,
      translationIds,
      signal,
    });

    const totalPages = Math.max(
      poolPages,
      poolPages + Math.ceil(bestMatchPool.pagination.totalRecords / size) - apiPagesInPool
    );
    return {
      navigation: sortNavigationByExactMatch(qdcResults.navigation, query),
      verses: versesToReturn,
      pagination: {
        currentPage: page,
        nextPage: page < totalPages ? page + 1 : null,
        totalPages,
        totalRecords: Math.max(bestMatchPool.pagination.totalRecords, sortedPool.length),
      },
    };
  } catch {
    return fetchQdcSearch(query, { size, page, translationIds, signal });
  }
}
