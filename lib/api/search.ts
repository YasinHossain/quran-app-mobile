/**
 * Comprehensive Search API (mobile)
 *
 * Ported from the web app (`../quran-app/lib/api/search.ts`) but adapted for React Native:
 * - Uses public APIs directly (QDC + Quran.com V4).
 * - No Next.js proxy routes or server-only environment configuration.
 */

// ============================================================================
// Types
// ============================================================================

export enum SearchMode {
  Quick = 'quick',
  Advanced = 'advanced',
}

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

const quickSearchCache = new Map<string, CachedSearchResult>();
const quickSearchInFlight = new Map<string, Promise<SearchResponse>>();
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

function buildQuickSearchCacheKey(query: string, perPage: number, translationIds: number[]): string {
  const normalizedQuery = normalizeQueryForCache(query);
  const translationKey = normalizeTranslationIdsForKey(translationIds).join(',');
  return [SearchMode.Quick, perPage.toString(), translationKey, normalizedQuery].join('|');
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

function normalizeNumeralsToAscii(input: string): string {
  return input.replace(/[\u0660-\u0669\u06F0-\u06F9\u09E6-\u09EF\u0966-\u096F]/g, (digit) => {
    const codePoint = digit.codePointAt(0);
    if (codePoint === undefined) return digit;

    // Arabic-Indic digits
    if (codePoint >= 0x0660 && codePoint <= 0x0669) {
      return String(codePoint - 0x0660);
    }

    // Eastern Arabic-Indic digits
    if (codePoint >= 0x06f0 && codePoint <= 0x06f9) {
      return String(codePoint - 0x06f0);
    }

    // Bengali digits
    if (codePoint >= 0x09e6 && codePoint <= 0x09ef) {
      return String(codePoint - 0x09e6);
    }

    // Devanagari digits
    if (codePoint >= 0x0966 && codePoint <= 0x096f) {
      return String(codePoint - 0x0966);
    }

    return digit;
  });
}

function parseQuery(query: string): ParsedQuery {
  const trimmed = normalizeNumeralsToAscii(query.trim().toLowerCase()).replace(/\s+/g, ' ');

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

  // Juz pattern: "juz 1", "juz1", "juz 30"
  const juzMatch = trimmed.match(/^juz\s*(\d{1,2})$/);
  if (juzMatch) {
    return {
      type: 'navigation',
      navigationType: 'juz',
      isExplicit: true,
      value: parseInt(juzMatch[1]!, 10),
    };
  }

  // Page pattern: "page 50", "page50", "p 50", "p50"
  const pageMatch = trimmed.match(/^(?:page|p)\s*(\d{1,3})$/);
  if (pageMatch) {
    return {
      type: 'navigation',
      navigationType: 'page',
      isExplicit: true,
      value: parseInt(pageMatch[1]!, 10),
    };
  }

  // Surah pattern: "surah 36", "sura 36", "surat 36", "chapter 36"
  const surahMatch = trimmed.match(/^(?:surah|sura|surat|chapter)\s*(\d{1,3})$/);
  if (surahMatch) {
    const num = parseInt(surahMatch[1]!, 10);
    if (num >= 1 && num <= 114) {
      return {
        type: 'navigation',
        navigationType: 'surah',
        isExplicit: true,
        value: num,
      };
    }
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
      if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 604) return null;
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
// Scoring helpers (fallback ranking)
// ============================================================================

function normalizeForSearch(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function generateNgrams(words: string[], n: number): string[] {
  const ngrams: string[] = [];
  if (words.length < n) return ngrams;
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function filterAndSortByExactPhrase(
  verses: SearchVerseResult[],
  query: string,
  maxResults: number
): SearchVerseResult[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return verses.slice(0, maxResults);

  const allQueryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  const significantWords = allQueryWords.filter((w) => w.length > 2);
  const bigrams = generateNgrams(allQueryWords, 2);
  const trigrams = generateNgrams(allQueryWords, 3);

  const scored = verses.map((verse) => {
    const rawText = stripHtmlTags(verse.highlightedTranslation ?? '');
    const text = normalizeForSearch(rawText);
    const textWords = text.split(/\s+/).filter(Boolean);

    const hasExactPhrase = normalizedQuery.length > 0 && text.includes(normalizedQuery);
    const exactPhraseScore = hasExactPhrase ? 1000 : 0;

    let positionScore = 0;
    if (hasExactPhrase) {
      const position = text.indexOf(normalizedQuery);
      const relativePosition = text.length ? position / text.length : 1;
      positionScore = Math.max(0, 100 * (1 - relativePosition * 2));
    }

    let ngramScore = 0;
    for (const trigram of trigrams) if (text.includes(trigram)) ngramScore += 150;
    for (const bigram of bigrams) if (text.includes(bigram)) ngramScore += 75;

    const matchedSignificantWords = significantWords.filter((word) =>
      textWords.some((tw) => tw.includes(word) || word.includes(tw))
    ).length;
    const matchRatio = significantWords.length ? matchedSignificantWords / significantWords.length : 0;
    const matchRatioScore = matchRatio * 200;

    const highlightCount = (verse.highlightedTranslation.match(/<em>/gi) ?? []).length;
    const highlightScore = highlightCount * 10;

    const totalScore = exactPhraseScore + positionScore + ngramScore + matchRatioScore + highlightScore;

    return { verse, score: totalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.verse);
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
 * Quick search for autocomplete/dropdown.
 *
 * Uses both V4 and QDC APIs then ranks the preview to keep it relevant.
 */
export async function quickSearch(
  query: string,
  options: {
    perPage?: number;
    translationIds?: number[];
    signal?: AbortSignal;
  } = {}
): Promise<SearchResponse> {
  const { perPage = 10, translationIds = [20], signal } = options;

  const cacheKey = buildQuickSearchCacheKey(query, perPage, translationIds);
  const cached = getCachedSearchResult(quickSearchCache, cacheKey);
  if (cached) return cached;

  if (!signal) {
    const inFlight = quickSearchInFlight.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const request = (async (): Promise<SearchResponse> => {
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

    const expandedTranslationIds = [...translationIds];
    const isEnglish = /^[a-zA-Z0-9\s\p{P}]+$/u.test(query);
    if (isEnglish) {
      const popularIds = [131, 85, 22, 20];
      for (const id of popularIds) {
        if (!expandedTranslationIds.includes(id)) expandedTranslationIds.push(id);
      }
    }

    const fetchSize = 150;
    const [v4Result, qdcResult] = await Promise.allSettled([
      fetchV4Search(query, fetchSize, 1, signal),
      fetchQdcSearch(query, { size: perPage, page: 1, translationIds: expandedTranslationIds, signal }),
    ]);

    const v4Results = v4Result.status === 'fulfilled' ? v4Result.value : null;
    const qdcResults = qdcResult.status === 'fulfilled' ? qdcResult.value : null;

    if (!v4Results && qdcResults) {
      return {
        ...qdcResults,
        navigation: sortNavigationByExactMatch(qdcResults.navigation, query),
      };
    }

    if (!v4Results) {
      const error = v4Result.status === 'rejected' ? v4Result.reason : new Error('V4 search failed');
      throw error instanceof Error ? error : new Error('Quick search failed');
    }

    const combinedVerses = [...v4Results.verses];
    if (qdcResults?.verses) {
      const normalizedQuery = normalizeForSearch(query);
      for (const verse of qdcResults.verses) {
        const existingIdx = combinedVerses.findIndex((v) => v.verseKey === verse.verseKey);
        if (existingIdx !== -1) {
          if (normalizeForSearch(stripHtmlTags(verse.highlightedTranslation)).includes(normalizedQuery)) {
            combinedVerses[existingIdx] = verse;
          }
        } else {
          combinedVerses.push(verse);
        }
      }
    }

    const filteredVerses = filterAndSortByExactPhrase(combinedVerses, query, perPage);
    const navigation = sortNavigationByExactMatch(qdcResults?.navigation ?? [], query);

    const result: SearchResponse = {
      navigation,
      verses: filteredVerses,
      pagination: {
        ...v4Results.pagination,
        totalRecords: v4Results.pagination.totalRecords,
      },
    };

    setCachedSearchResult(quickSearchCache, cacheKey, result);
    return result;
  })();

  if (!signal) quickSearchInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (!signal) quickSearchInFlight.delete(cacheKey);
  }
}

/**
 * Advanced search for the full results list (paged).
 */
export async function advancedSearch(
  query: string,
  options: {
    page?: number;
    size?: number;
    translationIds?: number[];
    signal?: AbortSignal;
  } = {}
): Promise<SearchResponse> {
  const { page = 1, size = 10, translationIds = [20], signal } = options;

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
    const sortedPool = filterAndSortByExactPhrase(bestMatchPool.verses, query, bestMatchPool.verses.length);

    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;

    let versesToReturn: SearchVerseResult[] = [];
    if (endIndex <= sortedPool.length) {
      versesToReturn = sortedPool.slice(startIndex, endIndex);
    } else {
      const standardPage = await fetchV4Search(query, size, page, signal);
      versesToReturn = standardPage.verses;
    }

    const qdcResults = await fetchQdcSearch(query, {
      size: 5,
      page: 1,
      translationIds,
      signal,
    });

    return {
      navigation: sortNavigationByExactMatch(qdcResults.navigation, query),
      verses: versesToReturn,
      pagination: {
        currentPage: page,
        nextPage: page < bestMatchPool.pagination.totalPages ? page + 1 : null,
        totalPages: bestMatchPool.pagination.totalPages,
        totalRecords: bestMatchPool.pagination.totalRecords,
      },
    };
  } catch {
    return fetchQdcSearch(query, { size, page, translationIds, signal });
  }
}
