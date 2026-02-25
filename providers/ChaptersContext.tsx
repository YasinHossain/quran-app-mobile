import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { loadChaptersFromStorage, saveChaptersToStorage } from '@/lib/storage/chaptersStorage';

import type { Chapter } from '@/types';

import bundledChapters from '../src/data/chapters.en.json';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isChapterLike = (value: unknown): value is Chapter => {
  if (!value || typeof value !== 'object') return false;
  const chapter = value as Partial<Chapter>;

  if (!isFiniteNumber(chapter.id)) return false;
  if (typeof chapter.name_simple !== 'string') return false;
  if (typeof chapter.name_arabic !== 'string') return false;
  if (typeof chapter.revelation_place !== 'string') return false;
  if (!isFiniteNumber(chapter.verses_count)) return false;

  if (typeof chapter.pages !== 'undefined') {
    if (!Array.isArray(chapter.pages) || chapter.pages.length !== 2) return false;
    const [start, end] = chapter.pages;
    if (!isFiniteNumber(start) || !isFiniteNumber(end)) return false;
  }

  if (typeof chapter.translated_name !== 'undefined') {
    if (!chapter.translated_name || typeof chapter.translated_name !== 'object') return false;
    const translated = chapter.translated_name as { name?: unknown };
    if (typeof translated.name !== 'string') return false;
  }

  return true;
};

const BUILT_IN_CHAPTERS: Chapter[] = Array.isArray(bundledChapters)
  ? (bundledChapters as unknown[]).filter(isChapterLike)
  : [];

type ChaptersContextType = {
  chapters: Chapter[];
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => void;
};

const ChaptersContext = createContext<ChaptersContextType | undefined>(undefined);

export function ChaptersProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [chapters, setChapters] = useState<Chapter[]>(BUILT_IN_CHAPTERS);

  // Keep the old `useChapters()` contract. With built-in data, this should generally remain false.
  const isLoading = chapters.length === 0;
  const errorMessage = null;

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      try {
        const cached = await loadChaptersFromStorage();
        if (!isMounted) return;

        if (cached.length > 0) {
          setChapters(cached);
          return;
        }

        // Persist the built-in copy to support code paths that still read from storage.
        if (BUILT_IN_CHAPTERS.length > 0) {
          await saveChaptersToStorage(BUILT_IN_CHAPTERS);
        }
      } catch {
        // Ignore storage failures; we always have the built-in fallback.
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, []);

  const refresh = React.useCallback(() => {
    void (async () => {
      try {
        const cached = await loadChaptersFromStorage();
        if (cached.length > 0) {
          setChapters(cached);
          return;
        }

        if (BUILT_IN_CHAPTERS.length > 0) {
          setChapters(BUILT_IN_CHAPTERS);
          await saveChaptersToStorage(BUILT_IN_CHAPTERS);
        }
      } catch {
        // Ignore.
      }
    })();
  }, []);

  const contextValue = useMemo<ChaptersContextType>(
    () => ({ chapters, isLoading, errorMessage, refresh }),
    [chapters, isLoading, refresh]
  );

  return <ChaptersContext.Provider value={contextValue}>{children}</ChaptersContext.Provider>;
}

export function useChaptersContext(): ChaptersContextType {
  const ctx = useContext(ChaptersContext);
  if (!ctx) throw new Error('useChaptersContext must be used within ChaptersProvider');
  return ctx;
}

