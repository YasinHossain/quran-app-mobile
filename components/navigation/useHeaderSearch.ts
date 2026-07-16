import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Keyboard, TextInput } from 'react-native';

import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { prepareMushafVerseTarget } from '@/lib/mushaf/prepareMushafVerseTarget';
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

  const navigateToMushaf = React.useCallback(
    (surahId: number, verse?: number) => {
      close({ clearQuery: true });
      const normalizedSurahId = Math.max(1, Math.trunc(surahId));
      const normalizedVerse =
        typeof verse === 'number' && Number.isFinite(verse) && verse > 0
          ? Math.trunc(verse)
          : undefined;

      void (async () => {
        const packId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
        const fallbackVersion = findMushafOption(packId)?.version ?? 'unknown';
        const target = normalizedVerse
          ? await prepareMushafVerseTarget({
              awaitPageLoad: false,
              chapterId: normalizedSurahId,
              fallbackVersion,
              packId,
              verseKey: `${normalizedSurahId}:${normalizedVerse}`,
            }).catch(() => null)
          : null;
        const route = {
          pathname: '/surah/[surahId]',
          params: {
            surahId: String(normalizedSurahId),
            view: 'mushaf',
            ...(normalizedVerse ? { startVerse: String(normalizedVerse) } : {}),
            ...(target ? { startPage: String(target.pageNumber) } : {}),
          },
        } as const;

        if (replace) {
          router.replace(route);
          return;
        }

        router.push(route);
      })();
    },
    [close, replace, router, settings]
  );

  const navigateToTranslation = React.useCallback(
    (surahId: number, verse?: number) => {
      close({ clearQuery: true });
      const normalizedVerse =
        typeof verse === 'number' && Number.isFinite(verse) && verse > 0
          ? Math.trunc(verse)
          : undefined;
      const route = {
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(surahId),
          view: 'translations',
          ...(normalizedVerse ? { startVerse: String(normalizedVerse) } : {}),
        },
      } as const;

      void (async () => {
        await warmSurahReaderBeforeNavigation({
          surahId,
          verseNumber: normalizedVerse,
          settings,
        });

        if (replace) {
          router.replace(route);
          return;
        }

        router.push(route);
      })();
    },
    [close, replace, router, settings]
  );

  const navigateToTafsir = React.useCallback(
    (surahId: number, verse = 1) => {
      close({ clearQuery: true });
      const normalizedVerse = Number.isFinite(verse) && verse > 0 ? Math.floor(verse) : 1;
      const route = {
        pathname: '/tafsir/[surahId]/[ayahId]',
        params: { surahId: String(surahId), ayahId: String(normalizedVerse) },
      } as const;

      if (replace) {
        router.replace(route);
        return;
      }

      router.push(route);
    },
    [close, replace, router]
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
    navigateToMushaf,
    navigateToPage,
    navigateToSearch,
    navigateToSurahVerse,
    navigateToTafsir,
    navigateToTranslation,
    query,
    setIsOpen,
    updateQuery,
  };
}
