import { useRouter } from 'expo-router';
import React from 'react';
import { Keyboard, TextInput } from 'react-native';

import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';

type CloseHeaderSearchOptions = {
  clearQuery: boolean;
};

export function useHeaderSearch({
  preserveMushafView = false,
}: {
  preserveMushafView?: boolean;
} = {}) {
  const router = useRouter();
  const { settings } = useSettings();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<TextInput | null>(null);

  const close = React.useCallback(({ clearQuery }: CloseHeaderSearchOptions) => {
    setIsOpen(false);
    if (clearQuery) setQuery('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const updateQuery = React.useCallback((value: string) => {
    setQuery(value);
    setIsOpen(true);
  }, []);

  const navigateToSearch = React.useCallback(
    (queryOverride?: string) => {
      const trimmed = (queryOverride ?? query).trim();
      if (!trimmed) return;
      close({ clearQuery: true });
      router.push({ pathname: '/search', params: { query: trimmed } });
    },
    [close, query, router]
  );

  const navigateToSurahVerse = React.useCallback(
    async (surahId: number, verse?: number) => {
      await preloadOfflineSurahNavigationPage({
        surahId,
        verseNumber: verse,
        settings,
      });
      close({ clearQuery: true });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(surahId),
          ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
          ...(preserveMushafView ? { view: 'mushaf' } : {}),
        },
      });
    },
    [close, preserveMushafView, router, settings]
  );

  const navigateToJuz = React.useCallback(
    (juzNumber: number) => {
      close({ clearQuery: true });
      router.push({ pathname: '/juz/[juzNumber]', params: { juzNumber: String(juzNumber) } });
    },
    [close, router]
  );

  const navigateToPage = React.useCallback(
    (pageNumber: number) => {
      close({ clearQuery: true });
      router.push({ pathname: '/page/[pageNumber]', params: { pageNumber: String(pageNumber) } });
    },
    [close, router]
  );

  return {
    close,
    inputRef,
    isOpen,
    navigateToJuz,
    navigateToPage,
    navigateToSearch,
    navigateToSurahVerse,
    query,
    setIsOpen,
    updateQuery,
  };
}
