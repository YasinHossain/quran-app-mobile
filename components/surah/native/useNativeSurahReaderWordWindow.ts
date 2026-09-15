import React from 'react';

import type { SurahVerse } from '@/hooks/useSurahVerses';
import {
  NATIVE_WORD_WINDOW_RADIUS,
  selectNativeWordWindowVerseNumbers,
} from '@/lib/surah/nativeWordWindow';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import type { VerseWord } from '@/types';

import type {
  NativeSurahReaderWord,
  NativeSurahReaderWordWindowVerse,
} from './NativeSurahReader.types';

type ApiWord = {
  id?: number;
  position?: number;
  char_type_name?: string;
  text_uthmani?: string;
  text?: string;
};

type ApiVerse = {
  verse_number?: number;
  verse_key?: string;
  words?: ApiWord[];
};

type ApiVersesResponse = {
  verses?: ApiVerse[];
};

type StoredWord = VerseWord & {
  text_uthmani?: string;
  text?: string;
  char_type_name?: string;
};

function normalizeWords(input: unknown): NativeSurahReaderWord[] {
  if (!Array.isArray(input)) return [];

  const normalized: NativeSurahReaderWord[] = [];
  input.forEach((value, index) => {
    const word = value as StoredWord;
    const uthmani = (word.uthmani ?? word.text_uthmani ?? word.text ?? '').trim();
    if (!uthmani) return;
    const id = Number.isFinite(word.id) && word.id > 0 ? Math.trunc(word.id) : index + 1;
    const position =
      typeof word.position === 'number' && Number.isFinite(word.position) && word.position > 0
        ? Math.trunc(word.position)
        : index + 1;
    const charTypeName = word.charTypeName ?? word.char_type_name;

    normalized.push({
      id,
      position,
      uthmani,
      ...(typeof word.translationText === 'string' && word.translationText.trim()
        ? { translationText: word.translationText.trim() }
        : {}),
      ...(typeof charTypeName === 'string' && charTypeName.trim()
        ? { charTypeName: charTypeName.trim() }
        : {}),
    });
  });
  return normalized;
}

function fallbackWords(verse: SurahVerse | undefined): NativeSurahReaderWord[] {
  return (verse?.text_uthmani ?? '')
    .split(/\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((uthmani, index) => ({ id: index + 1, position: index + 1, uthmani }));
}

async function loadNetworkWords(
  chapterNumber: number,
  verseNumbers: readonly number[]
): Promise<Map<number, NativeSurahReaderWord[]>> {
  const result = new Map<number, NativeSurahReaderWord[]>();
  const pages = new Set(verseNumbers.map((verseNumber) => Math.floor((verseNumber - 1) / 10) + 1));

  await Promise.all(
    [...pages].map(async (page) => {
      const response = await apiFetch<ApiVersesResponse>(
        `/verses/by_chapter/${chapterNumber}`,
        {
          words: 'true',
          fields: 'text_uthmani',
          word_fields: 'text_uthmani,char_type_name,position',
          per_page: '10',
          page: String(page),
        },
        'Failed to load reader word window'
      );
      for (const verse of response.verses ?? []) {
        const verseNumber = verse.verse_number;
        if (!verseNumber || !verseNumbers.includes(verseNumber)) continue;
        const words = normalizeWords(verse.words);
        if (words.length) result.set(verseNumber, words);
      }
    })
  );

  return result;
}

export function useNativeSurahReaderWordWindow(params: {
  chapterNumber: number;
  enabled: boolean;
  getVerseByNumber: (verseNumber: number) => SurahVerse | undefined;
  initialVerse: number;
  verseCount: number;
  wordLang: string;
}): {
  ensureWindow: (centerVerse: number) => void;
  isReady: boolean;
  verses: NativeSurahReaderWordWindowVerse[];
} {
  const { chapterNumber, enabled, getVerseByNumber, initialVerse, verseCount, wordLang } = params;
  const [verses, setVerses] = React.useState<NativeSurahReaderWordWindowVerse[]>([]);
  const [isReady, setIsReady] = React.useState(!enabled);
  const generationRef = React.useRef(0);
  const centerRef = React.useRef<number | null>(null);
  const coveredRangeRef = React.useRef<{ first: number; last: number } | null>(null);
  const coveredVerseNumbersRef = React.useRef<Set<number>>(new Set());
  const getVerseByNumberRef = React.useRef(getVerseByNumber);
  getVerseByNumberRef.current = getVerseByNumber;

  const ensureWindow = React.useCallback(
    (requestedCenter: number) => {
      if (!enabled || verseCount <= 0) return;
      const centerVerse = Math.max(1, Math.min(verseCount, Math.trunc(requestedCenter)));
      const coveredRange = coveredRangeRef.current;
      if (
        coveredRange &&
        coveredVerseNumbersRef.current.has(centerVerse) &&
        (centerVerse >= coveredRange.first + 2 || coveredRange.first === 1) &&
        (centerVerse <= coveredRange.last - 2 || coveredRange.last === verseCount)
      ) {
        return;
      }
      if (centerRef.current === centerVerse) return;
      centerRef.current = centerVerse;
      const generation = ++generationRef.current;
      const start = Math.max(1, centerVerse - NATIVE_WORD_WINDOW_RADIUS);
      const end = Math.min(verseCount, centerVerse + NATIVE_WORD_WINDOW_RADIUS);
      const verseNumbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);
      const verseKeys = verseNumbers.map((verseNumber) => `${chapterNumber}:${verseNumber}`);

      void (async () => {
        const wordsByVerse = new Map<number, NativeSurahReaderWord[]>();
        try {
          const stored = await container
            .getTranslationOfflineStore()
            .getWordTranslationWordsJsonByVerseKeys(verseKeys, wordLang);
          for (const verseNumber of verseNumbers) {
            const wordsJson = stored.get(`${chapterNumber}:${verseNumber}`);
            if (!wordsJson) continue;
            try {
              const words = normalizeWords(JSON.parse(wordsJson));
              if (words.length) wordsByVerse.set(verseNumber, words);
            } catch {}
          }

          const missingVerseNumbers = verseNumbers.filter(
            (verseNumber) => !wordsByVerse.has(verseNumber)
          );
          if (missingVerseNumbers.length) {
            try {
              const networkWords = await loadNetworkWords(chapterNumber, missingVerseNumbers);
              for (const [verseNumber, words] of networkWords) {
                wordsByVerse.set(verseNumber, words);
              }
            } catch {}
          }
        } finally {
          for (const verseNumber of verseNumbers) {
            if (!wordsByVerse.has(verseNumber)) {
              const words = fallbackWords(getVerseByNumberRef.current(verseNumber));
              if (words.length) wordsByVerse.set(verseNumber, words);
            }
          }

          if (generationRef.current !== generation) return;
          const selectedVerseNumbers = new Set(
            selectNativeWordWindowVerseNumbers(
              [...wordsByVerse].map(([verseNumber, words]) => ({
                verseNumber,
                wordCount: words.length,
              })),
              centerVerse
            )
          );
          const nextVerses = [...wordsByVerse]
            .filter(([verseNumber]) => selectedVerseNumbers.has(verseNumber))
            .sort(([left], [right]) => left - right)
            .map(([verseNumber, words]) => ({
              verseKey: `${chapterNumber}:${verseNumber}`,
              verseNumber,
              words,
            }));
          coveredRangeRef.current = nextVerses.length
            ? {
                first: nextVerses[0]!.verseNumber,
                last: nextVerses[nextVerses.length - 1]!.verseNumber,
              }
            : null;
          coveredVerseNumbersRef.current = selectedVerseNumbers;
          setVerses(nextVerses);
          setIsReady(true);
        }
      })();
    },
    [chapterNumber, enabled, verseCount, wordLang]
  );

  React.useEffect(() => {
    generationRef.current += 1;
    centerRef.current = null;
    coveredRangeRef.current = null;
    coveredVerseNumbersRef.current = new Set();
    setVerses([]);
    setIsReady(!enabled);
    if (enabled) ensureWindow(initialVerse);
  }, [chapterNumber, enabled, ensureWindow, initialVerse, wordLang]);

  return { ensureWindow, isReady, verses };
}
