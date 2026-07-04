import React from 'react';

import { useChapters } from '@/hooks/useChapters';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import { getBundledMushafPack } from '@/src/core/infrastructure/mushaf/bundledPacks';
import { getAppDbSync } from '@/src/core/infrastructure/db';
import type { OfflineVerseWithTranslations } from '@/src/core/domain/repositories/ITranslationOfflineStore';

import type { VerseWord } from '@/types';

export type PageVerse = {
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

function parseVerseKeyNumbers(
  verseKey: string | null
): { surahId: number; verseNumber: number } | null {
  if (!verseKey) return null;
  const [surahRaw, verseRaw] = verseKey.split(':');
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verseNumber)) return null;
  const normalizedSurah = Math.trunc(surahId);
  const normalizedVerse = Math.trunc(verseNumber);
  if (normalizedSurah <= 0 || normalizedVerse <= 0) return null;
  return { surahId: normalizedSurah, verseNumber: normalizedVerse };
}

export function getPageVerseKeys(
  pageNumber: number,
  chapters: Array<{ id: number; verses_count: number }>
): string[] {
  const pack = getBundledMushafPack('unicode-uthmani-v1');
  const lookup = pack?.payload.lookup[String(pageNumber)];
  if (!lookup) return [];

  const startVerseKey = lookup.firstVerseKey || lookup.from;
  const endVerseKey = lookup.lastVerseKey || lookup.to;

  const startParsed = parseVerseKeyNumbers(startVerseKey);
  const endParsed = parseVerseKeyNumbers(endVerseKey);
  if (!startParsed || !endParsed) return [];

  const keys: string[] = [];
  if (startParsed.surahId === endParsed.surahId) {
    for (let ayah = startParsed.verseNumber; ayah <= endParsed.verseNumber; ayah += 1) {
      keys.push(`${startParsed.surahId}:${ayah}`);
    }
    return keys;
  }

  const startSurah = chapters.find((c) => c.id === startParsed.surahId);
  if (startSurah) {
    for (let ayah = startParsed.verseNumber; ayah <= startSurah.verses_count; ayah += 1) {
      keys.push(`${startParsed.surahId}:${ayah}`);
    }
  }

  for (let id = startParsed.surahId + 1; id < endParsed.surahId; id += 1) {
    const ch = chapters.find((c) => c.id === id);
    if (ch) {
      for (let ayah = 1; ayah <= ch.verses_count; ayah += 1) {
        keys.push(`${id}:${ayah}`);
      }
    }
  }

  for (let ayah = 1; ayah <= endParsed.verseNumber; ayah += 1) {
    keys.push(`${endParsed.surahId}:${ayah}`);
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

function getOfflinePageVersesSnapshot(params: {
  enabled: boolean;
  verseKeys: string[];
  translationIds: number[];
  wordLang: string;
}): Record<string, PageVerse> | null {
  if (!params.enabled || params.verseKeys.length === 0) return null;

  try {
    const db = getAppDbSync();
    const resolvedTranslationIds = params.translationIds;

    if (resolvedTranslationIds.length === 0) {
      const placeholders = params.verseKeys.map(() => '?').join(', ');
      const rows = db.getAllSync<{
        verse_key: string;
        surah: number;
        ayah: number;
        arabic_uthmani: string;
        words_json: string | null;
      }>(
        `
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE v.verse_key IN (${placeholders})
        ORDER BY surah ASC, ayah ASC;
        `,
        [params.wordLang, ...params.verseKeys]
      );

      if (rows.length < params.verseKeys.length) {
        return null;
      }

      const mapped: Record<string, PageVerse> = {};
      for (const row of rows) {
        let words: VerseWord[] | undefined;
        if (row.words_json) {
          try {
            words = JSON.parse(row.words_json);
          } catch {
            words = undefined;
          }
        }

        mapped[row.verse_key] = {
          verse_number: row.ayah,
          verse_key: row.verse_key,
          text_uthmani: row.arabic_uthmani,
          translations: [],
          translationItems: [],
          translationTexts: [],
          words,
        };
      }
      return mapped;
    }

    const tPlaceholders = resolvedTranslationIds.map(() => '?').join(', ');
    const vPlaceholders = params.verseKeys.map(() => '?').join(', ');

    const rows = db.getAllSync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      translation_id: number | null;
      translation_text: string | null;
      words_json: string | null;
    }>(
      `
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json,
          t.translation_id AS translation_id,
          t.text AS translation_text
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        LEFT JOIN offline_translations t
        ON t.verse_key = v.verse_key
        AND t.translation_id IN (${tPlaceholders})
      WHERE v.verse_key IN (${vPlaceholders})
      ORDER BY v.surah ASC, v.ayah ASC, t.translation_id ASC;
      `,
        [params.wordLang, ...resolvedTranslationIds, ...params.verseKeys]
      );

    const byVerseKey = new Map<
      string,
      {
        verseKey: string;
        ayahNumber: number;
        arabicUthmani: string;
        wordsJson?: string;
        translationsById: Map<number, string>;
      }
    >();
    const seenVerseKeys: string[] = [];

    for (const row of rows) {
      let existing = byVerseKey.get(row.verse_key);
      if (!existing) {
        existing = {
          verseKey: row.verse_key,
          ayahNumber: row.ayah,
          arabicUthmani: row.arabic_uthmani,
          wordsJson: row.words_json || undefined,
          translationsById: new Map<number, string>(),
        };
        byVerseKey.set(row.verse_key, existing);
        seenVerseKeys.push(row.verse_key);
      }

      if (row.translation_id !== null && row.translation_text !== null) {
        existing.translationsById.set(row.translation_id, row.translation_text);
      }
    }

    if (seenVerseKeys.length < params.verseKeys.length) {
      return null;
    }

    for (const key of params.verseKeys) {
      const verseObj = byVerseKey.get(key);
      if (!verseObj) return null;

      for (const tId of resolvedTranslationIds) {
        if (!verseObj.translationsById.has(tId)) {
          return null;
        }
      }
    }

    const mapped: Record<string, PageVerse> = {};
    for (const key of params.verseKeys) {
      const verseObj = byVerseKey.get(key)!;
      const translations = resolvedTranslationIds.map((tId) => ({
        resource_id: tId,
        text: verseObj.translationsById.get(tId)!,
      }));

      const translationItems = buildTranslationItems(translations, resolvedTranslationIds);
      const translationTexts = buildTranslationTexts(translations, resolvedTranslationIds);

      primeVerseDetailsCache({
        verseKey: verseObj.verseKey,
        arabicText: verseObj.arabicUthmani,
        translationIds: resolvedTranslationIds,
        translationTexts,
      });

      let words: VerseWord[] | undefined;
      if (verseObj.wordsJson) {
        try {
          words = JSON.parse(verseObj.wordsJson);
        } catch {
          words = undefined;
        }
      }

      mapped[verseObj.verseKey] = {
        verse_number: verseObj.ayahNumber,
        verse_key: verseObj.verseKey,
        text_uthmani: verseObj.arabicUthmani,
        translations,
        translationItems,
        translationTexts,
        words,
      };
    }

    return mapped;
  } catch {
    return null;
  }
}

export function usePageVerses({
  pageNumber,
  translationIds,
  wordLang = 'en',
  enabled = true,
}: {
  pageNumber: number;
  translationIds: number[];
  wordLang?: string;
  enabled?: boolean;
}): {
  verseKeys: string[];
  hasLoadedContent: boolean;
  getVerseByKey: (verseKey: string) => PageVerse | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  offlineNotInstalled: boolean;
  refresh: () => void;
  retry: () => void;
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

  const verseKeys = React.useMemo(() => {
    if (!enabled || chapters.length === 0) return [];
    return getPageVerseKeys(pageNumber, chapters);
  }, [pageNumber, chapters, enabled]);

  const initialVersesByKey = React.useMemo(() => {
    return getOfflinePageVersesSnapshot({
      enabled,
      verseKeys,
      translationIds: resolvedTranslationIds,
      wordLang: resolvedWordLang,
    });
  }, [enabled, verseKeys, resolvedTranslationIds]);

  const initialHasLoaded = initialVersesByKey !== null;

  const [isLoading, setIsLoading] = React.useState(!initialHasLoaded);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [offlineNotInstalled, setOfflineNotInstalled] = React.useState(false);
  const [versesByKey, setVersesByKey] = React.useState<Record<string, PageVerse>>(
    initialVersesByKey || {}
  );
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const requestTokenRef = React.useRef(0);

  const [prevPageNumber, setPrevPageNumber] = React.useState(pageNumber);
  const [prevTranslationsKey, setPrevTranslationsKey] = React.useState(translationsKey);

  if (pageNumber !== prevPageNumber || translationsKey !== prevTranslationsKey) {
    setPrevPageNumber(pageNumber);
    setPrevTranslationsKey(translationsKey);

    const warmOfflineVerses = getOfflinePageVersesSnapshot({
      enabled,
      verseKeys,
      translationIds: resolvedTranslationIds,
      wordLang: resolvedWordLang,
    });
    const hasWarmOfflineVerses = warmOfflineVerses !== null;

    setVersesByKey(warmOfflineVerses || {});
    setIsLoading(!hasWarmOfflineVerses);
    setErrorMessage(null);
    setOfflineNotInstalled(false);
    requestTokenRef.current += 1;
  }

  const hasLoadedContent = React.useMemo(
    () => Object.keys(versesByKey).length > 0,
    [versesByKey]
  );

  const getVerseByKey = React.useCallback(
    (verseKey: string) => versesByKey[verseKey],
    [versesByKey]
  );

  const load = React.useCallback(async () => {
    if (!enabled || verseKeys.length === 0) return;

    const token = ++requestTokenRef.current;
    
    // Check if offline is already complete so we can skip setting loading to true
    const currentKeys = Object.keys(versesByKey);
    const hasCompleteSync = currentKeys.length === verseKeys.length && verseKeys.every(k => versesByKey[k]);
    if (hasCompleteSync) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setOfflineNotInstalled(false);

    try {
      const promises = verseKeys.map(async (key) => {
        return container
          .getTranslationOfflineStore()
          .getVerseWithTranslations(key, resolvedTranslationIds, resolvedWordLang);
      });
      const offlineResults = await Promise.all(promises);

      if (token !== requestTokenRef.current) return;

      const isCompleteOffline = offlineResults.every((verse) => {
        if (!verse) return false;
        if (resolvedTranslationIds.length === 0) return true;
        const availableTranslationIds = new Set(verse.translations.map((t) => t.translationId));
        return resolvedTranslationIds.every((id) => availableTranslationIds.has(id));
      });

      if (isCompleteOffline) {
        const mapped: Record<string, PageVerse> = {};
        offlineResults.forEach((verse) => {
          if (!verse) return;
          const translations = verse.translations.map((t) => ({
            resource_id: t.translationId,
            text: t.text,
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

          mapped[verse.verseKey] = {
            verse_number: verse.ayahNumber,
            verse_key: verse.verseKey,
            text_uthmani: verse.arabicUthmani,
            translations,
            translationItems,
            translationTexts,
            words,
          };
        });

        setVersesByKey(mapped);
        setIsLoading(false);
        return;
      }

      const response = await apiFetch<ApiVersesResponse>(
        `/verses/by_page/${pageNumber}`,
        {
          language: resolvedWordLang,
          words: 'false',
          fields: 'text_uthmani',
          ...(translationsKey ? { translations: translationsKey } : {}),
          per_page: 'all',
        },
        'Failed to load verses'
      );

      if (token !== requestTokenRef.current) return;

      const mapped: Record<string, PageVerse> = {};
      (response.verses ?? []).forEach((verse) => {
        const translationItems = buildTranslationItems(verse.translations, resolvedTranslationIds);
        const translationTexts = buildTranslationTexts(verse.translations, resolvedTranslationIds);

        primeVerseDetailsCache({
          verseKey: verse.verse_key,
          arabicText: verse.text_uthmani,
          translationIds: resolvedTranslationIds,
          translationTexts,
        });

        mapped[verse.verse_key] = {
          id: verse.id,
          verse_number: verse.verse_number,
          verse_key: verse.verse_key,
          text_uthmani: verse.text_uthmani,
          translations: verse.translations,
          translationItems,
          translationTexts,
        };
      });

      setVersesByKey(mapped);
      setIsLoading(false);
    } catch (error) {
      if (token !== requestTokenRef.current) return;

      if (isNetworkError(error)) {
        setOfflineNotInstalled(true);
      } else {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
      setIsLoading(false);
    }
  }, [enabled, verseKeys, resolvedTranslationIds, pageNumber, resolvedWordLang, translationsKey, versesByKey]);

  React.useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const refresh = React.useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  const retry = React.useCallback(() => {
    void load();
  }, [load]);

  return {
    verseKeys,
    hasLoadedContent,
    getVerseByKey,
    isLoading,
    errorMessage,
    offlineNotInstalled,
    refresh,
    retry,
  };
}
