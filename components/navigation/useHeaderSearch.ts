import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Keyboard, TextInput } from 'react-native';

import { warmSurahReaderBeforeNavigation } from '@/lib/surah/surahReaderWarmup';
import { useSettings } from '@/providers/SettingsContext';

type CloseHeaderSearchOptions = {
  clearQuery: boolean;
};

export function useHeaderSearch({
  preserveMushafView = false,
  replace = false,
}: {
  preserveMushafView?: boolean;
  replace?: boolean;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const routeParams = useLocalSearchParams<{ surahId?: string | string[] }>();
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
    (surahId: number, verse?: number) => {
      close({ clearQuery: true });
      const route = {
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(surahId),
          ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
          ...(preserveMushafView ? { view: 'mushaf' } : {}),
        },
      } as const;
      const currentSurahParam = Array.isArray(routeParams.surahId)
        ? routeParams.surahId[0]
        : routeParams.surahId;
      const isSameSurahRoute =
        pathname === `/surah/${surahId}` && Number(currentSurahParam) === surahId;

      if (replace && isSameSurahRoute && !preserveMushafView) {
        void warmSurahReaderBeforeNavigation({
          surahId,
          verseNumber: verse,
          settings,
        });
        router.setParams({ startVerse: String(verse ?? 1) });
        return;
      }

      void (async () => {
        await warmSurahReaderBeforeNavigation({
          surahId,
          verseNumber: verse,
          settings,
        });

        if (replace) {
          router.replace(route);
          return;
        }

        router.push(route);
      })();
    },
    [close, pathname, preserveMushafView, replace, routeParams.surahId, router, settings]
  );

  const navigateToJuz = React.useCallback(
    (juzNumber: number) => {
      close({ clearQuery: true });
      const route = {
        pathname: '/juz/[juzNumber]',
        params: { juzNumber: String(juzNumber) },
      } as const;
      if (replace) {
        router.replace(route);
        return;
      }
      router.push(route);
    },
    [close, replace, router]
  );

  const navigateToPage = React.useCallback(
    (pageNumber: number) => {
      close({ clearQuery: true });
      const route = {
        pathname: '/page/[pageNumber]',
        params: { pageNumber: String(pageNumber) },
      } as const;
      if (replace) {
        router.replace(route);
        return;
      }
      router.push(route);
    },
    [close, replace, router]
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
