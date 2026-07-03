import React from 'react';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import {
  preloadTajweedGlyphRunFontsAsync,
} from '@/components/surah/TajweedNativeText';
import {
  DEFAULT_SURAH_VERSES_PER_PAGE,
  getOfflineSurahCached,
  getOfflineSurahPageCached,
  getOfflineSurahSnapshot,
  peekCachedTajweedGlyphRuns,
  peekOfflineSurahCache,
  peekOfflineSurahPageCache,
} from '@/lib/surah/offlineSurahPageCache';
import { useChapters } from '@/hooks/useChapters';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import {
  getExactPackPageFontFamily,
  getExactPackPageFontRelativePath,
} from '@/src/core/infrastructure/mushaf/downloadablePacks';

import type { MushafVerse, VerseWord } from '@/types';

export type SurahVerse = {
  id?: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  tajweedGlyphRuns?: Array<{
    fontFamily: string;
    fontFileUri: string;
    glyphs: string[];
  }>;
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
      code_v2?: string;
      page_number?: number;
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
    if (!word) continue;

    const uthmani = (word.text_uthmani ?? word.text ?? '').trim();
    if (!uthmani) continue;

    normalized.push({
      id: word.id,
      uthmani,
      translationText: word.translation?.text,
      charTypeName: word.char_type_name,
      ...(typeof word.position === 'number' ? { position: word.position } : {}),
      ...(typeof word.code_v2 === 'string' && word.code_v2.trim()
        ? { codeV2: word.code_v2 }
        : {}),
      ...(typeof word.page_number === 'number' && Number.isFinite(word.page_number)
        ? { pageNumber: word.page_number }
        : {}),
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

function offlineVerseHasTajweedGlyphMetadata(verse: OfflineVerseWithTranslations): boolean {
  if (!verse.wordsJson) return false;

  try {
    const words = JSON.parse(verse.wordsJson) as VerseWord[];
    return (
      Array.isArray(words) &&
      words.some(
        (word) =>
          typeof word?.codeV2 === 'string' &&
          word.codeV2.trim().length > 0 &&
          typeof word.pageNumber === 'number' &&
          Number.isFinite(word.pageNumber) &&
          word.pageNumber > 0
      )
    );
  } catch {
    return false;
  }
}

function hasCompleteTajweedGlyphMetadata(
  offlineVerses: OfflineVerseWithTranslations[]
): boolean {
  return (
    offlineVerses.length > 0 &&
    offlineVerses.every((verse) => offlineVerseHasTajweedGlyphMetadata(verse))
  );
}

function isCompleteOfflineVerseSet(params: {
  offlineVerses: OfflineVerseWithTranslations[];
  translationIds: number[];
  expectedVerseCount?: number;
  requireTajweedGlyphs?: boolean;
}): boolean {
  if (params.offlineVerses.length === 0) return false;
  if (
    typeof params.expectedVerseCount === 'number' &&
    params.expectedVerseCount > 0 &&
    params.offlineVerses.length < params.expectedVerseCount
  ) {
    return false;
  }

  if (params.requireTajweedGlyphs && !hasCompleteTajweedGlyphMetadata(params.offlineVerses)) {
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

    let words: VerseWord[] | undefined;
    if (verse.wordsJson) {
      try {
        words = JSON.parse(verse.wordsJson);
      } catch {
        words = undefined;
      }
    }

    const translationItems = buildTranslationItems(translations, translationIds);
    const translationTexts = buildTranslationTexts(translations, translationIds);

    // CRITICAL: Prime the memory cache for all loaded/fetched offline verses.
    // This prevents layout flickers and skeletons when transitioning or swiping targets on the Tafsir screen.
    primeVerseDetailsCache({
      verseKey: verse.verseKey,
      arabicText: verse.arabicUthmani,
      translationIds,
      translationTexts,
    });

    return {
      verse_number: verse.ayahNumber,
      verse_key: verse.verseKey,
      text_uthmani: verse.arabicUthmani,
      tajweedGlyphRuns: peekCachedTajweedGlyphRuns(verse.verseKey) ?? buildTajweedGlyphRunsFromWords(words),
      translations,
      translationItems,
      translationTexts,
      words,
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

function getTajweedGlyphRunsFromPages(
  pagesByNumber: Record<number, SurahVerse[]>
): NonNullable<SurahVerse['tajweedGlyphRuns']> {
  return Object.values(pagesByNumber).flatMap((pageVerses) =>
    pageVerses.flatMap((verse) => verse.tajweedGlyphRuns ?? [])
  );
}

function getTajweedGlyphRunsFromVerses(
  verses: SurahVerse[]
): NonNullable<SurahVerse['tajweedGlyphRuns']> {
  return verses.flatMap((verse) => verse.tajweedGlyphRuns ?? []);
}

function hasTajweedGlyphRuns(verses: SurahVerse[]): boolean {
  return verses.some((verse) => Array.isArray(verse.tajweedGlyphRuns) && verse.tajweedGlyphRuns.length > 0);
}

function mushafWordsToVerseWords(words: MushafVerse['words']): VerseWord[] {
  return words
    .map((word, index) => ({
      id: typeof word.id === 'number' ? word.id : index + 1,
      ...(typeof word.position === 'number' ? { position: word.position } : {}),
      ...(typeof word.charType === 'string' ? { charTypeName: word.charType } : {}),
      uthmani: word.textUthmani ?? word.textQpcHafs ?? word.textIndopak ?? '',
      ...(typeof word.codeV2 === 'string' ? { codeV2: word.codeV2 } : {}),
      ...(typeof word.pageNumber === 'number' ? { pageNumber: word.pageNumber } : {}),
    }))
    .filter((word) => word.uthmani.trim().length > 0);
}

async function enrichVersesWithLocalTajweedGlyphs(verses: SurahVerse[]): Promise<SurahVerse[]> {
  if (verses.length === 0 || hasTajweedGlyphRuns(verses)) {
    return verses;
  }

  const repository = container.getMushafPageRepository();
  const firstVerseKey = verses[0]?.verse_key;
  const lastVerseKey = verses[verses.length - 1]?.verse_key ?? firstVerseKey;
  if (!firstVerseKey || !lastVerseKey) return verses;

  const [firstPageNumber, lastPageNumber] = await Promise.all([
    repository.findPageForVerse({
      packId: TAJWEED_MUSHAF_ID,
      verseKey: firstVerseKey,
    }),
    repository.findPageForVerse({
      packId: TAJWEED_MUSHAF_ID,
      verseKey: lastVerseKey,
    }),
  ]);

  if (!firstPageNumber || !lastPageNumber) return verses;

  const startPageNumber = Math.min(firstPageNumber, lastPageNumber);
  const endPageNumber = Math.max(firstPageNumber, lastPageNumber);
  const mushafVersesByKey = new Map<string, MushafVerse>();

  await Promise.all(
    Array.from(
      { length: endPageNumber - startPageNumber + 1 },
      (_value, index) => startPageNumber + index
    ).map(async (pageNumber) => {
      const pageData = await repository.getPage({
        packId: TAJWEED_MUSHAF_ID,
        pageNumber,
      });
      for (const mushafVerse of pageData.verses) {
        mushafVersesByKey.set(mushafVerse.verseKey, mushafVerse);
      }
    })
  );

  const enriched: SurahVerse[] = [];
  let didEnrich = false;

  for (const verse of verses) {
    const mushafVerse = mushafVersesByKey.get(verse.verse_key);
    const tajweedGlyphRuns = buildTajweedGlyphRunsFromWords(
      mushafVerse ? mushafWordsToVerseWords(mushafVerse.words) : verse.words
    );

    if (tajweedGlyphRuns?.length) {
      didEnrich = true;
      enriched.push({
        ...verse,
        tajweedGlyphRuns,
      });
      continue;
    }

    enriched.push(verse);
  }

  return didEnrich ? enriched : verses;
}

function getInitialOfflinePagesSnapshot(params: {
  enabled: boolean;
  chapterNumber: number;
  translationIds: number[];
  perPage: number;
  verseCount: number;
  requireTajweedGlyphs?: boolean;
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
      requireTajweedGlyphs: false,
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

  const pages = buildOfflinePagesByNumber({
    offlineVerses: offlineSurah,
    translationIds: params.translationIds,
    perPage: params.perPage,
  });

  return pages;
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
        word.codeV2 ?? '',
        word.pageNumber ?? '',
        word.translationText ?? '',
      ].join(':')
    )
    .join('\u0000');
}

function getTajweedGlyphRunsSignature(verse: SurahVerse | undefined): string {
  return (verse?.tajweedGlyphRuns ?? [])
    .map((run) => [run.fontFamily, run.fontFileUri, run.glyphs.join('')].join(':'))
    .join('\u0000');
}

function arePageVersesEquivalent(current: SurahVerse[], incoming: SurahVerse[]): boolean {
  if (current.length !== incoming.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    const currentVerse = current[index];
    const incomingVerse = incoming[index];

    if (currentVerse?.verse_key !== incomingVerse?.verse_key) return false;
    if (currentVerse?.text_uthmani !== incomingVerse?.text_uthmani) return false;
    if (getTajweedGlyphRunsSignature(currentVerse) !== getTajweedGlyphRunsSignature(incomingVerse)) return false;
    if (getWordsSignature(currentVerse) !== getWordsSignature(incomingVerse)) return false;
    if (getTranslationItemsSignature(currentVerse) !== getTranslationItemsSignature(incomingVerse)) {
      return false;
    }
  }

  return true;
}

let activeTajweedPackVersionSnapshot = findMushafOption(TAJWEED_MUSHAF_ID)?.version ?? 'v4-ttf';

function getTajweedFontAssetForPage(
  pageNumber: number
): Pick<NonNullable<SurahVerse['tajweedGlyphRuns']>[number], 'fontFamily' | 'fontFileUri'> | null {
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;
  const normalizedPageNumber = Math.trunc(pageNumber);
  const fontRelativePath = getExactPackPageFontRelativePath(
    TAJWEED_MUSHAF_ID,
    normalizedPageNumber
  );
  if (!fontRelativePath) return null;

  return {
    fontFamily: getExactPackPageFontFamily(normalizedPageNumber, 'v4'),
    fontFileUri: container
      .getMushafPackFileStore()
      .getInstalledFileUri(
        TAJWEED_MUSHAF_ID,
        activeTajweedPackVersionSnapshot,
        fontRelativePath
      ),
  };
}

function buildTajweedGlyphRunsFromWords(
  words: VerseWord[] | undefined
): NonNullable<SurahVerse['tajweedGlyphRuns']> | undefined {
  if (!Array.isArray(words) || words.length === 0) return undefined;

  const orderedWords = words
    .slice()
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  type PendingGlyphRun = NonNullable<SurahVerse['tajweedGlyphRuns']>[number] & {
    pageNumber: number;
  };
  const glyphRuns: PendingGlyphRun[] = [];
  let currentRun:
    | PendingGlyphRun
    | null = null;

  for (const word of orderedWords) {
    const glyph = word.codeV2?.trim();
    if (!glyph) continue;
    const pageNumber = word.pageNumber;
    if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber) || pageNumber <= 0) {
      continue;
    }

    const normalizedPageNumber = Math.trunc(pageNumber);
    if (!currentRun || currentRun.pageNumber !== normalizedPageNumber) {
      const fontAsset = getTajweedFontAssetForPage(normalizedPageNumber);
      if (!fontAsset) continue;

      currentRun = {
        ...fontAsset,
        pageNumber: normalizedPageNumber,
        glyphs: [],
      };
      glyphRuns.push(currentRun);
    }

    currentRun.glyphs.push(glyph);
  }

  return glyphRuns.length
    ? glyphRuns.map(({ pageNumber: _pageNumber, ...glyphRun }) => glyphRun)
    : undefined;
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
  tajweed = false,
  tajweedTheme = 'light',
  tajweedTextColor,
  initialVerseNumber,
  enabled = true,
}: {
  chapterNumber: number;
  translationIds: number[];
  wordLang?: string;
  perPage?: number;
  includeWords?: boolean;
  includeWordTranslations?: boolean;
  tajweed?: boolean;
  tajweedTheme?: 'light' | 'dark';
  tajweedTextColor?: string;
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
  const initialPagesByNumber = React.useMemo(() => {
    const pages = getInitialOfflinePagesSnapshot({
      enabled,
      chapterNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      verseCount,
      requireTajweedGlyphs: false,
    });
    return pages;
  }, [
    enabled,
    chapterNumber,
    translationsKey,
    perPage,
    tajweed,
    tajweedTextColor,
    tajweedTheme,
    verseCount,
  ]);

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

  const [prevChapterNumber, setPrevChapterNumber] = React.useState(chapterNumber);
  const [prevTranslationsKey, setPrevTranslationsKey] = React.useState(translationsKey);
  const [prevIncludeWords, setPrevIncludeWords] = React.useState(includeWords);
  const [prevIncludeWordTranslations, setPrevIncludeWordTranslations] = React.useState(includeWordTranslations);
  const [prevTajweed, setPrevTajweed] = React.useState(tajweed);

  if (
    chapterNumber !== prevChapterNumber ||
    translationsKey !== prevTranslationsKey ||
    includeWords !== prevIncludeWords ||
    includeWordTranslations !== prevIncludeWordTranslations ||
    tajweed !== prevTajweed
  ) {
    setPrevChapterNumber(chapterNumber);
    setPrevTranslationsKey(translationsKey);
    setPrevIncludeWords(includeWords);
    setPrevIncludeWordTranslations(includeWordTranslations);
    setPrevTajweed(tajweed);

    const warmOfflinePages = getInitialOfflinePagesSnapshot({
      enabled,
      chapterNumber,
      translationIds: resolvedTranslationIds,
      perPage,
      verseCount,
      requireTajweedGlyphs: false,
    });
    const visibleWarmOfflinePages = warmOfflinePages;
    const hasWarmOfflinePages = Object.keys(visibleWarmOfflinePages).length > 0;
    const shouldBeLoading = !hasWarmOfflinePages;

    setPagesByNumber(visibleWarmOfflinePages);
    pagesByNumberRef.current = visibleWarmOfflinePages;
    setIsLoading(shouldBeLoading);
    setPendingPageCount(0);
    setErrorMessage(null);
    setOfflineNotInstalled(false);
    setIsRefreshing(false);
    setIsLoadingMore(false);
    dataSourceRef.current = hasWarmOfflinePages ? 'offline' : 'network';
    inFlightPagesRef.current.clear();
  }
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
    if (!tajweed) return;
    const glyphRuns = Object.values(pagesByNumberRef.current).flatMap((pageVerses) =>
      pageVerses.flatMap((verse) => verse.tajweedGlyphRuns ?? [])
    );
    if (glyphRuns.length === 0) return;

    void preloadTajweedGlyphRunFontsAsync(glyphRuns, {
      resolvedTheme: tajweedTheme,
      ...(tajweedTextColor ? { textColor: tajweedTextColor } : {}),
    }).catch(() => {});
  }, [pagesSignature, tajweed, tajweedTextColor, tajweedTheme]);

  React.useEffect(() => {
    totalPagesRef.current =
      verseCount > 0 && Number.isFinite(perPage) && perPage > 0
        ? Math.max(1, Math.ceil(verseCount / perPage))
        : 1;
  }, [perPage, verseCount]);

  const preloadTajweedFontsForGlyphRuns = React.useCallback(
    async (glyphRuns: NonNullable<SurahVerse['tajweedGlyphRuns']>): Promise<void> => {
      if (!tajweed || glyphRuns.length === 0) return;

      await preloadTajweedGlyphRunFontsAsync(glyphRuns, {
        resolvedTheme: tajweedTheme,
        ...(tajweedTextColor ? { textColor: tajweedTextColor } : {}),
      });
    },
    [tajweed, tajweedTextColor, tajweedTheme]
  );

  const preloadTajweedFontsForVerses = React.useCallback(
    async (verses: SurahVerse[]): Promise<void> => {
      await preloadTajweedFontsForGlyphRuns(getTajweedGlyphRunsFromVerses(verses));
    },
    [preloadTajweedFontsForGlyphRuns]
  );

  const normalizeVersePage = React.useCallback(
    (pageVerses: ApiVersesResponse['verses']): SurahVerse[] =>
      (pageVerses ?? []).map((verse) => {
        const translationItems = buildTranslationItems(verse.translations, resolvedTranslationIds);
        const translationTexts = buildTranslationTexts(verse.translations, resolvedTranslationIds);
        const words = buildVerseWords(verse.words);
        
        // CRITICAL: Prime the memory cache for all network-fetched verses.
        // This prevents skeletons and flickering when swiping pages/verses on the Tafsir screen.
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
          tajweedGlyphRuns: buildTajweedGlyphRunsFromWords(words),
          translations: verse.translations,
          words,
          translationItems,
          translationTexts,
        };
      }),
    [resolvedTranslationIds]
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

  const scheduleTajweedEnhancement = React.useCallback(
    (pageNumber: number, pageVerses: SurahVerse[], token: number): void => {
      if (!tajweed) return;

      if (hasTajweedGlyphRuns(pageVerses)) {
        void preloadTajweedFontsForVerses(pageVerses).catch(() => {});
        return;
      }

      void enrichVersesWithLocalTajweedGlyphs(pageVerses)
        .then(async (enrichedVerses) => {
          await preloadTajweedFontsForVerses(enrichedVerses);
          if (requestTokenRef.current === token) {
            setPageData(pageNumber, enrichedVerses);
          }
        })
        .catch(() => {});
    },
    [preloadTajweedFontsForVerses, setPageData, tajweed]
  );

  const normalizeOfflineVersePage = React.useCallback(
    (offlineVerses: OfflineVerseWithTranslations[]): SurahVerse[] =>
      normalizeOfflineVersePageData(offlineVerses, resolvedTranslationIds),
    [resolvedTranslationIds]
  );

  const setOfflineSurahData = React.useCallback(
    (offlineVerses: OfflineVerseWithTranslations[]): void => {
      if (!offlineVerses.length) return;

      const builtPages = buildOfflinePagesByNumber({
        offlineVerses,
        translationIds: resolvedTranslationIds,
        perPage,
      });
      const nextPages = builtPages;

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
          requireTajweedGlyphs: false,
        })
      ) {
        dataSourceRef.current = 'offline';
        const pageVerses = normalizeOfflineVersePage(cachedPage);
        if (requestTokenRef.current !== token) return false;
        setPageData(pageNumber, pageVerses);
        scheduleTajweedEnhancement(pageNumber, pageVerses, token);
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
          requireTajweedGlyphs: false,
        })
      ) {
        return false;
      }

      dataSourceRef.current = 'offline';
      const pageVerses = normalizeOfflineVersePage(offlineVerses);
      if (requestTokenRef.current !== token) return false;
      setPageData(pageNumber, pageVerses);
      scheduleTajweedEnhancement(pageNumber, pageVerses, token);
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
      scheduleTajweedEnhancement,
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
        requireTajweedGlyphs: false,
      })
    ) {
      dataSourceRef.current = 'offline';
      const nextPages = buildOfflinePagesByNumber({
        offlineVerses: cachedSurah,
        translationIds: resolvedTranslationIds,
        perPage,
      });
      if (requestTokenRef.current !== token) return false;
      setOfflineSurahData(cachedSurah);
      for (const [pageNumber, pageVerses] of Object.entries(nextPages)) {
        scheduleTajweedEnhancement(Number(pageNumber), pageVerses, token);
      }
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
        requireTajweedGlyphs: false,
      })
    ) {
      return false;
    }

    dataSourceRef.current = 'offline';
    const nextPages = buildOfflinePagesByNumber({
      offlineVerses,
      translationIds: resolvedTranslationIds,
      perPage,
    });
    if (requestTokenRef.current !== token) return false;
    setOfflineSurahData(offlineVerses);
    for (const [pageNumber, pageVerses] of Object.entries(nextPages)) {
      scheduleTajweedEnhancement(Number(pageNumber), pageVerses, token);
    }
    setOfflineNotInstalled(false);
    setErrorMessage(null);
    return true;
  }, [
    chapterNumber,
    enabled,
    perPage,
    resolvedTranslationIds,
    scheduleTajweedEnhancement,
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
              words: includeWords ? 'true' : 'false',
              fields: 'text_uthmani',
              ...(includeWords
                ? {
                    word_fields: tajweed
                      ? 'text_uthmani,char_type_name,position,code_v2,page_number'
                      : 'text_uthmani,char_type_name,position',
                  }
                : {}),
              ...(includeWordTranslations
                ? { word_translation_language: resolvedWordLang }
                : {}),
              ...(translationsKey ? { translations: translationsKey } : {}),
              per_page: perPage.toString(),
              page: pageNumber.toString(),
            },
            'Failed to load verses'
          );

          if (requestTokenRef.current !== token) return;

          totalPagesRef.current = versesJson.pagination?.total_pages ?? totalPagesRef.current;
          const pageVerses = normalizeVersePage(versesJson.verses ?? []);
          await preloadTajweedFontsForVerses(pageVerses);
          if (requestTokenRef.current !== token) return;
          setPageData(pageNumber, pageVerses);
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
      preloadTajweedFontsForVerses,
      resolvedTranslationIds,
      resolvedWordLang,
      setPageData,
      tajweed,
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
        requireTajweedGlyphs: false,
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
        for (const [pageNumber, pageVerses] of Object.entries(warmOfflinePages)) {
          scheduleTajweedEnhancement(Number(pageNumber), pageVerses, token);
        }
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

        if (canPreserveCurrentPages && !hasWarmOfflinePages) {
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
      includeWords,
      tajweed,
      loadOfflineFirstData,
      perPage,
      resolvedTranslationIds,
      scheduleTajweedEnhancement,
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
