import React from 'react';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import {
  areTajweedGlyphRunFontsLoaded,
  preloadTajweedGlyphRunFontsAsync,
} from '@/components/surah/TajweedNativeText';
import { TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import {
  DEFAULT_SURAH_VERSES_PER_PAGE,
  getOfflineSurahCached,
  getOfflineSurahPageCached,
  getOfflineSurahSnapshot,
  peekCachedTajweedGlyphRuns,
  peekOfflineSurahCache,
  peekOfflineSurahPageCache,
} from '@/lib/surah/offlineSurahPageCache';
import {
  getNetworkSurahTranslationCached,
  peekNetworkSurahTranslationSnapshot,
} from '@/lib/surah/surahTranslationNetworkCache';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import { getBundledMushafPack } from '@/src/core/infrastructure/mushaf/bundledPacks';
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
type ApiVerse = ApiVersesResponse['verses'][number];

const FULL_SURAH_NETWORK_FAST_PATH_TIMEOUT_MS = 650;

let bundledVerseWordsByKey: Map<string, VerseWord[]> | null = null;
let bundledSurahVersesByChapter: Map<number, OfflineVerseWithTranslations[]> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseChapterNumberFromVerseKey(verseKey: string): number {
  const [chapterPart] = verseKey.split(':');
  const parsed = Number.parseInt(chapterPart ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function getBundledVerseWordsByKey(): Map<string, VerseWord[]> {
  if (bundledVerseWordsByKey) return bundledVerseWordsByKey;

  const map = new Map<string, VerseWord[]>();
  const pack = getBundledMushafPack('unicode-uthmani-v1');
  const pages = pack?.payload.pages ?? {};

  for (const pageVerses of Object.values(pages)) {
    for (const verse of pageVerses) {
      const words = mushafWordsToVerseWords(verse.words);
      if (words.length > 0) {
        map.set(verse.verseKey, words);
      }
    }
  }

  bundledVerseWordsByKey = map;
  return map;
}

function getBundledVerseWords(verseKey: string): VerseWord[] | undefined {
  return getBundledVerseWordsByKey().get(verseKey.trim());
}

function getBundledSurahVersesByChapter(): Map<number, OfflineVerseWithTranslations[]> {
  if (bundledSurahVersesByChapter) return bundledSurahVersesByChapter;

  const map = new Map<number, OfflineVerseWithTranslations[]>();
  const pack = getBundledMushafPack('unicode-uthmani-v1');
  const pages = pack?.payload.pages ?? {};

  for (const pageVerses of Object.values(pages)) {
    for (const verse of pageVerses) {
      const chapterNumber = parseChapterNumberFromVerseKey(verse.verseKey);
      if (chapterNumber <= 0) continue;

      const row: OfflineVerseWithTranslations = {
        verseKey: verse.verseKey,
        surahId: chapterNumber,
        ayahNumber: Number.parseInt(verse.verseKey.split(':')[1] ?? '', 10) || 0,
        arabicUthmani: verse.textUthmani ?? '',
        wordsJson: JSON.stringify(mushafWordsToVerseWords(verse.words)),
        translations: [],
      };

      const existing = map.get(chapterNumber);
      if (existing) {
        existing.push(row);
      } else {
        map.set(chapterNumber, [row]);
      }
    }
  }

  for (const verses of map.values()) {
    verses.sort((left, right) => left.ayahNumber - right.ayahNumber);
  }

  bundledSurahVersesByChapter = map;
  return map;
}

function getBundledSurahVerses(chapterNumber: number): OfflineVerseWithTranslations[] {
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return [];
  return getBundledSurahVersesByChapter().get(Math.trunc(chapterNumber)) ?? [];
}

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

function offlineVerseHasWordTranslations(verse: OfflineVerseWithTranslations): boolean {
  if (!verse.wordsJson) return false;

  try {
    const words = JSON.parse(verse.wordsJson) as VerseWord[];
    return (
      Array.isArray(words) &&
      words.some(
        (word) =>
          typeof word?.translationText === 'string' &&
          word.translationText.trim().length > 0
      )
    );
  } catch {
    return false;
  }
}

function hasCompleteWordTranslations(
  offlineVerses: OfflineVerseWithTranslations[]
): boolean {
  return (
    offlineVerses.length > 0 &&
    offlineVerses.every((verse) => offlineVerseHasWordTranslations(verse))
  );
}

function verseHasRequestedWordData(
  verse: SurahVerse,
  options: {
    includeWords: boolean;
    includeWordTranslations: boolean;
  }
): boolean {
  if (!options.includeWords && !options.includeWordTranslations) return true;
  const words = verse.words ?? [];
  if (!Array.isArray(words) || words.length === 0) return false;
  if (!options.includeWordTranslations) return true;

  return words.some(
    (word) =>
      typeof word.translationText === 'string' &&
      word.translationText.trim().length > 0
  );
}

function pageHasRequestedWordData(
  pageVerses: SurahVerse[],
  options: {
    includeWords: boolean;
    includeWordTranslations: boolean;
  }
): boolean {
  if (!options.includeWords && !options.includeWordTranslations) return true;
  if (!pageVerses.length) return false;
  return pageVerses.every((verse) => verseHasRequestedWordData(verse, options));
}

function isCompleteOfflineVerseSet(params: {
  offlineVerses: OfflineVerseWithTranslations[];
  translationIds: number[];
  expectedVerseCount?: number;
  requireTajweedGlyphs?: boolean;
  requireWordTranslations?: boolean;
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

  if (params.requireWordTranslations && !hasCompleteWordTranslations(params.offlineVerses)) {
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
  translationIds: number[],
  options: {
    includeTajweedGlyphs: boolean;
    includeWords: boolean;
  }
): SurahVerse[] {
  return offlineVerses.map((verse) => {
    const translations = verse.translations.map((item) => ({
      resource_id: item.translationId,
      text: item.text,
    }));

    const shouldParseWords = options.includeWords || options.includeTajweedGlyphs;
    let words: VerseWord[] | undefined;
    if (shouldParseWords && verse.wordsJson) {
      try {
        words = JSON.parse(verse.wordsJson);
      } catch {
        words = undefined;
      }
    }

    if (shouldParseWords && (!Array.isArray(words) || words.length === 0)) {
      words = getBundledVerseWords(verse.verseKey);
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
      tajweedGlyphRuns: options.includeTajweedGlyphs
        ? peekCachedTajweedGlyphRuns(verse.verseKey) ?? buildTajweedGlyphRunsFromWords(words)
        : undefined,
      translations,
      translationItems,
      translationTexts,
      words: options.includeWords ? words : undefined,
    };
  });
}

function buildOfflinePagesByNumber(params: {
  offlineVerses: OfflineVerseWithTranslations[];
  includeTajweedGlyphs: boolean;
  includeWords: boolean;
  translationIds: number[];
  wordLang: string;
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
      params.translationIds,
      {
        includeTajweedGlyphs: params.includeTajweedGlyphs,
        includeWords: params.includeWords,
      }
    );
  }

  return nextPages;
}

function buildSurahVersePagesByNumber(
  verses: SurahVerse[],
  perPage: number
): Record<number, SurahVerse[]> {
  const resolvedPerPage =
    Number.isFinite(perPage) && perPage > 0 ? Math.trunc(perPage) : DEFAULT_SURAH_VERSES_PER_PAGE;
  const pages: Record<number, SurahVerse[]> = {};

  for (const verse of verses) {
    if (!Number.isFinite(verse.verse_number) || verse.verse_number <= 0) continue;
    const pageNumber = Math.max(1, Math.floor((verse.verse_number - 1) / resolvedPerPage) + 1);
    if (!pages[pageNumber]) pages[pageNumber] = [];
    pages[pageNumber]!.push(verse);
  }

  for (const pageVerses of Object.values(pages)) {
    pageVerses.sort((left, right) => left.verse_number - right.verse_number);
  }

  return pages;
}

function getTajweedGlyphRunsFromPages(
  pagesByNumber: Record<number, SurahVerse[]>
): NonNullable<SurahVerse['tajweedGlyphRuns']> {
  return Object.values(pagesByNumber).flatMap((pageVerses) =>
    pageVerses.flatMap((verse) => verse.tajweedGlyphRuns ?? [])
  );
}

function getTajweedReadyPagesForImmediateRender(
  pagesByNumber: Record<number, SurahVerse[]>,
  options: {
    deferGlyphRunsUntilFontsReady: boolean;
    tajweed: boolean;
    tajweedTheme: 'light' | 'dark';
    tajweedTextColor?: string;
  }
): Record<number, SurahVerse[]> {
  if (!options.tajweed) return pagesByNumber;
  if (!options.deferGlyphRunsUntilFontsReady) return pagesByNumber;
  if (Object.keys(pagesByNumber).length === 0) return pagesByNumber;

  const glyphRuns = getTajweedGlyphRunsFromPages(pagesByNumber);
  if (glyphRuns.length === 0) {
    // No glyph runs available — return pages as-is so text_uthmani renders.
    return pagesByNumber;
  }

  if (
    areTajweedGlyphRunFontsLoaded(glyphRuns, {
      resolvedTheme: options.tajweedTheme,
      ...(options.tajweedTextColor ? { textColor: options.tajweedTextColor } : {}),
    })
  ) {
    return pagesByNumber;
  }

  // Fonts not loaded yet — strip tajweedGlyphRuns so verses render
  // immediately with plain Arabic text. Tajweed will be applied once
  // fonts finish loading via the async enhancement pipeline.
  const stripped: Record<number, SurahVerse[]> = {};
  for (const [pageNumber, verses] of Object.entries(pagesByNumber)) {
    stripped[Number(pageNumber)] = verses.map((verse) => ({
      ...verse,
      tajweedGlyphRuns: undefined,
    }));
  }
  return stripped;
}

function getTajweedGlyphRunsFromVerses(
  verses: SurahVerse[]
): NonNullable<SurahVerse['tajweedGlyphRuns']> {
  return verses.flatMap((verse) => verse.tajweedGlyphRuns ?? []);
}

function hasTajweedGlyphRuns(verses: SurahVerse[]): boolean {
  return (
    verses.length > 0 &&
    verses.every(
      (verse) => Array.isArray(verse.tajweedGlyphRuns) && verse.tajweedGlyphRuns.length > 0
    )
  );
}

function getInitialPageWindowNumbers(params: {
  initialVerseNumber?: number;
  perPage: number;
  totalPages: number;
}): number[] {
  const targetPage =
    typeof params.initialVerseNumber === 'number' &&
      Number.isFinite(params.initialVerseNumber) &&
      params.initialVerseNumber > 0 &&
      params.perPage > 0
      ? Math.max(1, Math.floor((params.initialVerseNumber - 1) / params.perPage) + 1)
      : 1;
  const maxPage =
    Number.isFinite(params.totalPages) && params.totalPages > 0
      ? params.totalPages
      : targetPage + 1;

  return Array.from(new Set([Math.max(1, targetPage - 1), targetPage, targetPage + 1])).filter(
    (pageNumber) => pageNumber >= 1 && pageNumber <= maxPage
  );
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
  includeTajweedGlyphs: boolean;
  includeWords: boolean;
  includeWordTranslations: boolean;
  translationIds: number[];
  wordLang: string;
  perPage: number;
  verseCount: number;
  requireTajweedGlyphs?: boolean;
}): Record<number, SurahVerse[]> {
  if (!params.enabled) return {};
  if (!Number.isFinite(params.chapterNumber) || params.chapterNumber <= 0) return {};

  const cachedSurah = peekOfflineSurahCache({
    surahId: params.chapterNumber,
    translationIds: params.translationIds,
    wordLang: params.wordLang,
  });

  const candidateOfflineSurah =
    cachedSurah &&
      isCompleteOfflineVerseSet({
        offlineVerses: cachedSurah,
        translationIds: params.translationIds,
        expectedVerseCount: params.verseCount,
        requireTajweedGlyphs: false,
        requireWordTranslations: params.includeWordTranslations,
      })
      ? cachedSurah
      : getOfflineSurahSnapshot({
        surahId: params.chapterNumber,
        translationIds: params.translationIds,
        wordLang: params.wordLang,
        perPage: params.perPage,
        expectedVerseCount: params.verseCount,
      });
  const offlineSurah =
    candidateOfflineSurah &&
      isCompleteOfflineVerseSet({
        offlineVerses: candidateOfflineSurah,
        translationIds: params.translationIds,
        expectedVerseCount: params.verseCount,
        requireTajweedGlyphs: false,
        requireWordTranslations: params.includeWordTranslations,
      })
      ? candidateOfflineSurah
      : null;

  const resolvedOfflineSurah =
    offlineSurah ??
    (params.translationIds.length === 0 && !params.includeWordTranslations
      ? getBundledSurahVerses(params.chapterNumber)
      : null);

  if (!resolvedOfflineSurah) {
    return {};
  }

  const pages = buildOfflinePagesByNumber({
    offlineVerses: resolvedOfflineSurah,
    includeTajweedGlyphs: params.includeTajweedGlyphs,
    includeWords: params.includeWords,
    translationIds: params.translationIds,
    wordLang: params.wordLang,
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
  deferTajweedGlyphRunsUntilFontsReady = true,
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
  deferTajweedGlyphRunsUntilFontsReady?: boolean;
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
      includeTajweedGlyphs: tajweed,
      includeWords,
      includeWordTranslations,
      translationIds: resolvedTranslationIds,
      wordLang: resolvedWordLang,
      perPage,
      verseCount,
      requireTajweedGlyphs: false,
    });

    return getTajweedReadyPagesForImmediateRender(pages, {
      deferGlyphRunsUntilFontsReady: deferTajweedGlyphRunsUntilFontsReady,
      tajweed,
      tajweedTheme,
      ...(tajweedTextColor ? { tajweedTextColor } : {}),
    });
  }, [
    enabled,
    chapterNumber,
    translationsKey,
    perPage,
    deferTajweedGlyphRunsUntilFontsReady,
    tajweed,
    tajweedTextColor,
    tajweedTheme,
    verseCount,
    includeWords,
    includeWordTranslations,
    resolvedWordLang,
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
  const inFlightTajweedEnhancementsRef = React.useRef(new Set<string>());

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
      includeTajweedGlyphs: tajweed,
      includeWords,
      includeWordTranslations,
      translationIds: resolvedTranslationIds,
      wordLang: resolvedWordLang,
      perPage,
      verseCount,
      requireTajweedGlyphs: false,
    });
    const visibleWarmOfflinePages = getTajweedReadyPagesForImmediateRender(warmOfflinePages, {
      deferGlyphRunsUntilFontsReady: deferTajweedGlyphRunsUntilFontsReady,
      tajweed,
      tajweedTheme,
      ...(tajweedTextColor ? { tajweedTextColor } : {}),
    });
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
    () =>
      Object.keys(pagesByNumber)
        .sort((a, b) => Number(a) - Number(b))
        .map((pageNumber) => {
          const pageVerses = pagesByNumber[Number(pageNumber)] ?? [];
          const verseSignature = pageVerses
            .map((verse) =>
              [
                verse.verse_key,
                verse.text_uthmani ?? '',
                getTajweedGlyphRunsSignature(verse),
              ].join('|')
            )
            .join('\u0001');
          return `${pageNumber}:${verseSignature}`;
        })
        .join('\u0002'),
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
    }).catch(() => { });
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

  const prepareTajweedPagesForRender = React.useCallback(
    async (
      pages: Record<number, SurahVerse[]>,
      pageNumbers: number[]
    ): Promise<Record<number, SurahVerse[]>> => {
      if (!tajweed || pageNumbers.length === 0) return pages;

      const requestedGlyphRuns = pageNumbers.flatMap((pageNumber) =>
        pages[pageNumber]?.flatMap((verse) => verse.tajweedGlyphRuns ?? []) ?? []
      );
      if (requestedGlyphRuns.length > 0 && !deferTajweedGlyphRunsUntilFontsReady) {
        void preloadTajweedFontsForGlyphRuns(requestedGlyphRuns).catch(() => {});
        return pages;
      }
      if (
        requestedGlyphRuns.length > 0 &&
        areTajweedGlyphRunFontsLoaded(requestedGlyphRuns, {
          resolvedTheme: tajweedTheme,
          ...(tajweedTextColor ? { textColor: tajweedTextColor } : {}),
        })
      ) {
        return pages;
      }

      let nextPages = pages;

      await Promise.all(
        pageNumbers.map(async (pageNumber) => {
          const pageVerses = pages[pageNumber];
          if (!pageVerses?.length) return;

          const enrichedVerses = await enrichVersesWithLocalTajweedGlyphs(pageVerses);
          if (deferTajweedGlyphRunsUntilFontsReady) {
            await preloadTajweedFontsForVerses(enrichedVerses);
          } else {
            void preloadTajweedFontsForVerses(enrichedVerses).catch(() => {});
          }

          if (!arePageVersesEquivalent(pageVerses, enrichedVerses)) {
            nextPages = { ...nextPages, [pageNumber]: enrichedVerses };
          }
        })
      );

      return nextPages;
    },
    [
      deferTajweedGlyphRunsUntilFontsReady,
      preloadTajweedFontsForGlyphRuns,
      preloadTajweedFontsForVerses,
      tajweed,
      tajweedTextColor,
      tajweedTheme,
    ]
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
          tajweedGlyphRuns: tajweed ? buildTajweedGlyphRunsFromWords(words) : undefined,
          translations: verse.translations,
          words,
          translationItems,
          translationTexts,
        };
      }),
    [resolvedTranslationIds, tajweed]
  );

  const setNetworkSurahData = React.useCallback(
    (surahVerses: SurahVerse[]): void => {
      if (!surahVerses.length) return;

      const nextPages = buildSurahVersePagesByNumber(surahVerses, perPage);
      if (Object.keys(nextPages).length === 0) return;

      pagesByNumberRef.current = nextPages;
      totalPagesRef.current =
        verseCount > 0 && Number.isFinite(perPage) && perPage > 0
          ? Math.max(1, Math.ceil(verseCount / perPage))
          : Math.max(1, Object.keys(nextPages).length);

      setPagesByNumber((previous) => {
        const previousPageNumbers = Object.keys(previous);
        const nextPageNumbers = Object.keys(nextPages);
        if (previousPageNumbers.length !== nextPageNumbers.length) return nextPages;

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
    [perPage, verseCount]
  );

  const fetchFullNetworkSurah = React.useCallback(
    async (token: number, options?: { silentErrors?: boolean }): Promise<boolean> => {
      if (!enabled) return false;
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return false;
      if (includeWords || tajweed) return false;

      setPendingPageCount((current) => current + 1);

      try {
        const cachedNetworkVerses =
          peekNetworkSurahTranslationSnapshot({
            surahId: chapterNumber,
            translationIds: resolvedTranslationIds,
            wordLang: resolvedWordLang,
          }) ??
          (await getNetworkSurahTranslationCached({
            surahId: chapterNumber,
            translationIds: resolvedTranslationIds,
            wordLang: resolvedWordLang,
          }));

        if (requestTokenRef.current !== token) return false;

        const surahVerses = normalizeVersePage(cachedNetworkVerses as ApiVerse[]);
        if (!surahVerses.length) return false;

        dataSourceRef.current = 'network';
        setNetworkSurahData(surahVerses);
        setOfflineNotInstalled(false);
        setErrorMessage(null);
        return true;
      } catch (error) {
        if (requestTokenRef.current !== token) return false;
        if (options?.silentErrors) return false;

        if (isNetworkError(error)) {
          setOfflineNotInstalled(true);
          setErrorMessage(null);
          return false;
        }

        setErrorMessage((error as Error).message);
        return false;
      } finally {
        setPendingPageCount((current) => Math.max(0, current - 1));
      }
    },
    [
      chapterNumber,
      enabled,
      includeWords,
      normalizeVersePage,
      resolvedTranslationIds,
      resolvedWordLang,
      setNetworkSurahData,
      tajweed,
      translationsKey,
    ]
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
        void preloadTajweedFontsForVerses(pageVerses).catch(() => { });
        return;
      }

      const enhancementKey = `${token}:${pageNumber}`;
      if (inFlightTajweedEnhancementsRef.current.has(enhancementKey)) return;
      inFlightTajweedEnhancementsRef.current.add(enhancementKey);

      void enrichVersesWithLocalTajweedGlyphs(pageVerses)
        .then(async (enrichedVerses) => {
          await preloadTajweedFontsForVerses(enrichedVerses);
          if (requestTokenRef.current === token) {
            setPageData(pageNumber, enrichedVerses);
          }
        })
        .catch(() => { })
        .finally(() => {
          inFlightTajweedEnhancementsRef.current.delete(enhancementKey);
        });
    },
    [preloadTajweedFontsForVerses, setPageData, tajweed]
  );

  const normalizeOfflineVersePage = React.useCallback(
    (offlineVerses: OfflineVerseWithTranslations[]): SurahVerse[] =>
      normalizeOfflineVersePageData(offlineVerses, resolvedTranslationIds, {
        includeTajweedGlyphs: tajweed,
        includeWords,
      }),
    [includeWords, resolvedTranslationIds, tajweed]
  );

  const setOfflineSurahData = React.useCallback(
    (
      offlineVerses: OfflineVerseWithTranslations[],
      preparedPages?: Record<number, SurahVerse[]>
    ): void => {
      if (!offlineVerses.length) return;

      const builtPages =
        preparedPages ??
        buildOfflinePagesByNumber({
          offlineVerses,
          includeTajweedGlyphs: tajweed,
          includeWords,
          translationIds: resolvedTranslationIds,
          wordLang: resolvedWordLang,
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
    [includeWords, perPage, resolvedTranslationIds, resolvedWordLang, tajweed]
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
        wordLang: resolvedWordLang,
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
          requireWordTranslations: includeWordTranslations,
        })
      ) {
        dataSourceRef.current = 'offline';
        const pageVerses = normalizeOfflineVersePage(cachedPage);
        const preparedPages = await prepareTajweedPagesForRender(
          { [pageNumber]: pageVerses },
          [pageNumber]
        );
        const preparedPageVerses = preparedPages[pageNumber] ?? pageVerses;
        if (requestTokenRef.current !== token) return false;
        setPageData(pageNumber, preparedPageVerses);
        scheduleTajweedEnhancement(pageNumber, preparedPageVerses, token);
        setOfflineNotInstalled(false);
        setErrorMessage(null);
        return true;
      }

      const offlineVerses = await getOfflineSurahPageCached({
        surahId: chapterNumber,
        translationIds: resolvedTranslationIds,
        wordLang: resolvedWordLang,
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
          requireWordTranslations: includeWordTranslations,
        })
      ) {
        return false;
      }

      dataSourceRef.current = 'offline';
      const pageVerses = normalizeOfflineVersePage(offlineVerses);
      const preparedPages = await prepareTajweedPagesForRender(
        { [pageNumber]: pageVerses },
        [pageNumber]
      );
      const preparedPageVerses = preparedPages[pageNumber] ?? pageVerses;
      if (requestTokenRef.current !== token) return false;
      setPageData(pageNumber, preparedPageVerses);
      scheduleTajweedEnhancement(pageNumber, preparedPageVerses, token);
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
      includeWordTranslations,
      normalizeOfflineVersePage,
      perPage,
      prepareTajweedPagesForRender,
      resolvedTranslationIds,
      resolvedWordLang,
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
      wordLang: resolvedWordLang,
    });

    if (
      cachedSurah &&
      isCompleteOfflineVerseSet({
        offlineVerses: cachedSurah,
        translationIds: resolvedTranslationIds,
        expectedVerseCount: verseCount,
        requireTajweedGlyphs: false,
        requireWordTranslations: includeWordTranslations,
      })
    ) {
      dataSourceRef.current = 'offline';
      const nextPages = buildOfflinePagesByNumber({
        offlineVerses: cachedSurah,
        includeTajweedGlyphs: tajweed,
        includeWords,
        translationIds: resolvedTranslationIds,
        wordLang: resolvedWordLang,
        perPage,
      });
      const initialWindowPageNumbers = getInitialPageWindowNumbers({
        initialVerseNumber: initialVerseNumberRef.current,
        perPage,
        totalPages: totalPagesRef.current,
      });
      const preparedPages = await prepareTajweedPagesForRender(nextPages, initialWindowPageNumbers);
      if (requestTokenRef.current !== token) return false;
      setOfflineSurahData(cachedSurah, preparedPages);
      for (const pageNumber of initialWindowPageNumbers) {
        const pageVerses = preparedPages[pageNumber];
        if (pageVerses) {
          scheduleTajweedEnhancement(pageNumber, pageVerses, token);
        }
      }
      setOfflineNotInstalled(false);
      setErrorMessage(null);
      return true;
    }

    const offlineVerses = await getOfflineSurahCached({
      surahId: chapterNumber,
      translationIds: resolvedTranslationIds,
      wordLang: resolvedWordLang,
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
        requireWordTranslations: includeWordTranslations,
      })
    ) {
      return false;
    }

    dataSourceRef.current = 'offline';
    const nextPages = buildOfflinePagesByNumber({
      offlineVerses,
      includeTajweedGlyphs: tajweed,
      includeWords,
      translationIds: resolvedTranslationIds,
      wordLang: resolvedWordLang,
      perPage,
    });
    const initialWindowPageNumbers = getInitialPageWindowNumbers({
      initialVerseNumber: initialVerseNumberRef.current,
      perPage,
      totalPages: totalPagesRef.current,
    });
    const preparedPages = await prepareTajweedPagesForRender(nextPages, initialWindowPageNumbers);
    if (requestTokenRef.current !== token) return false;
    setOfflineSurahData(offlineVerses, preparedPages);
    for (const pageNumber of initialWindowPageNumbers) {
      const pageVerses = preparedPages[pageNumber];
      if (pageVerses) {
        scheduleTajweedEnhancement(pageNumber, pageVerses, token);
      }
    }
    setOfflineNotInstalled(false);
    setErrorMessage(null);
    return true;
  }, [
    chapterNumber,
    enabled,
    includeWordTranslations,
    includeWords,
    perPage,
    prepareTajweedPagesForRender,
    resolvedTranslationIds,
    resolvedWordLang,
    scheduleTajweedEnhancement,
    setOfflineSurahData,
    tajweed,
    verseCount,
  ]);

  const fetchPage = React.useCallback(
    async (pageNumber: number, token: number): Promise<void> => {
      if (!enabled) return;
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
      if (!Number.isFinite(pageNumber) || pageNumber <= 0) return;
      if (verseCount > 0 && pageNumber > totalPagesRef.current) return;
      const existingPage = pagesByNumberRef.current[pageNumber];
      if (
        existingPage &&
        pageHasRequestedWordData(existingPage, {
          includeWords,
          includeWordTranslations,
        })
      ) {
        scheduleTajweedEnhancement(pageNumber, existingPage, token);
        return;
      }

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
      scheduleTajweedEnhancement,
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
        includeTajweedGlyphs: tajweed,
        includeWords,
        includeWordTranslations,
        translationIds: resolvedTranslationIds,
        wordLang: resolvedWordLang,
        perPage,
        verseCount,
        requireTajweedGlyphs: false,
      });
      const initialWindowPageNumbers = getInitialPageWindowNumbers({
        initialVerseNumber: initialVerseNumberRef.current,
        perPage,
        totalPages: totalPagesRef.current,
      });
      const preparedWarmOfflinePages =
        mode === 'initial'
          ? warmOfflinePages
          : await prepareTajweedPagesForRender(warmOfflinePages, initialWindowPageNumbers);
      if (requestTokenRef.current !== token) return;
      const hasWarmOfflinePages = Object.keys(preparedWarmOfflinePages).length > 0;

      if (hasWarmOfflinePages) {
        dataSourceRef.current = 'offline';
        pagesByNumberRef.current = preparedWarmOfflinePages;
        setPagesByNumber((previous) => {
          const previousPageNumbers = Object.keys(previous);
          const nextPageNumbers = Object.keys(preparedWarmOfflinePages);
          if (previousPageNumbers.length !== nextPageNumbers.length) return preparedWarmOfflinePages;

          for (const pageNumber of nextPageNumbers) {
            const numericPageNumber = Number(pageNumber);
            const previousPage = previous[numericPageNumber];
            const nextPage = preparedWarmOfflinePages[numericPageNumber];
            if (!previousPage || !nextPage || !arePageVersesEquivalent(previousPage, nextPage)) {
              return preparedWarmOfflinePages;
            }
          }

          return previous;
        });
        for (const pageNumber of initialWindowPageNumbers) {
          const pageVerses = preparedWarmOfflinePages[pageNumber];
          if (pageVerses) {
            scheduleTajweedEnhancement(pageNumber, pageVerses, token);
          }
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

        const fullNetworkSurahPromise = fetchFullNetworkSurah(token, { silentErrors: true });
        const loadedFullNetworkSurah = await Promise.race([
          fullNetworkSurahPromise,
          wait(FULL_SURAH_NETWORK_FAST_PATH_TIMEOUT_MS).then(() => null),
        ]);
        if (requestTokenRef.current !== token) return;
        if (loadedFullNetworkSurah) return;

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
        const initialPageRadius = requestedVerseNumber > 1 ? 2 : 1;
        const initialPages = Array.from(
          { length: initialPageRadius * 2 + 1 },
          (_value, index) => targetPage - initialPageRadius + index
        );
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
      fetchFullNetworkSurah,
      includeWords,
      tajweed,
      loadOfflineFirstData,
      perPage,
      prepareTajweedPagesForRender,
      resolvedTranslationIds,
      resolvedWordLang,
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
