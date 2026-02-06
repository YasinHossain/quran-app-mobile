import React from 'react';

import { loadChaptersFromStorage, saveChaptersToStorage } from '@/lib/storage/chaptersStorage';

import type { Chapter } from '@/types';

type ApiChaptersResponse = {
  chapters: Chapter[];
};

export function useChapters(): {
  chapters: Chapter[];
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => void;
} {
  const [chapters, setChapters] = React.useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const requestTokenRef = React.useRef(0);

  const fetchChapters = React.useCallback(async () => {
    const token = ++requestTokenRef.current;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('https://api.quran.com/api/v4/chapters?language=en');
      if (!response.ok) {
        throw new Error(`Failed to load chapters (${response.status})`);
      }
      const json = (await response.json()) as ApiChaptersResponse;
      if (requestTokenRef.current !== token) return;
      const incoming = Array.isArray(json.chapters) ? json.chapters : [];
      setChapters(incoming);
      await saveChaptersToStorage(incoming);
    } catch (error) {
      if (requestTokenRef.current !== token) return;
      setErrorMessage((error as Error).message);
    } finally {
      if (requestTokenRef.current !== token) return;
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      const cached = await loadChaptersFromStorage();
      if (!isMounted) return;
      if (cached.length > 0) {
        setChapters(cached);
        setIsLoading(false);
      }
      void fetchChapters();
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [fetchChapters]);

  const refresh = React.useCallback(() => {
    void fetchChapters();
  }, [fetchChapters]);

  return { chapters, isLoading, errorMessage, refresh };
}

