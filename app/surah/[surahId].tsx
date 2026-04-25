import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  InteractionManager,
  Keyboard,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';

import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import {
  MushafSingleDocumentReader,
  type MushafSingleDocumentVersePress,
} from '@/components/mushaf/MushafSingleDocumentReader';
import type { MushafSelectionPayload } from '@/components/mushaf/mushafWordPayload';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import type { SettingsTab } from '@/components/reader/settings/SettingsTabToggle';
import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { SurahHeaderCard } from '@/components/surah/SurahHeaderCard';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { useVerseAudioWordSync } from '@/components/surah/useVerseAudioWordSync';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { useSurahVerses, type SurahVerse } from '@/hooks/useSurahVerses';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { preloadOfflineTafsirSurah } from '@/lib/tafsir/tafsirCache';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { container } from '@/src/core/infrastructure/di/container';

import type { Bookmark, MushafPackId } from '@/types';

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

async function resolveActiveMushafVersion(
  packId: MushafPackId,
  fallbackVersion: string
): Promise<string> {
  try {
    const activeInstall = await container
      .getMushafPackInstallRegistry()
      .getActive(packId);

    return activeInstall?.version?.trim() || fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

function VerseCardPlaceholder({ verseKey }: { verseKey: string }): React.JSX.Element {
  return (
    <View className="border-b border-border/40 py-4 dark:border-border-dark/30">
      <View className="gap-4">
        <Text className="text-sm font-semibold text-accent dark:text-accent-dark">{verseKey}</Text>
        <View className="h-12 rounded-2xl bg-surface dark:bg-surface-dark" />
        <View className="gap-3">
          <View className="h-4 rounded-full bg-surface dark:bg-surface-dark" />
          <View className="h-4 w-5/6 rounded-full bg-surface dark:bg-surface-dark" />
          <View className="h-4 w-2/3 rounded-full bg-surface dark:bg-surface-dark" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentStage: {
    flex: 1,
    overflow: 'hidden',
  },
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  mushafEntryLayer: {
    overflow: 'hidden',
  },
});

function MushafMessageState({
  color,
  message,
  showSpinner = false,
}: {
  color: string;
  message: string;
  showSpinner?: boolean;
}): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      {showSpinner ? <ActivityIndicator color={color} /> : null}
      <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
        {message}
      </Text>
    </View>
  );
}

const INITIAL_PLACEHOLDER_VERSE_NUMBERS = [1, 2, 3, 4];
const FALLBACK_MUSHAF_TOTAL_PAGES = 604;

type ChapterPageRange = {
  firstPage: number;
  lastPage: number;
};

function getChapterPageRange(chapter?: { pages?: number[] } | null): ChapterPageRange | null {
  const pages = Array.isArray(chapter?.pages)
    ? chapter.pages.filter((page) => Number.isFinite(page) && page > 0).map((page) => Math.trunc(page))
    : [];

  if (!pages.length) return null;

  return {
    firstPage: Math.min(...pages),
    lastPage: Math.max(...pages),
  };
}

function buildPageRangeNumbers(range: ChapterPageRange | null, totalPages: number): number[] {
  if (!range) return [];
  const lastAvailablePage = Math.max(1, Math.trunc(totalPages || FALLBACK_MUSHAF_TOTAL_PAGES));
  const firstPage = Math.max(1, Math.min(range.firstPage, lastAvailablePage));
  const lastPage = Math.max(firstPage, Math.min(range.lastPage, lastAvailablePage));
  return Array.from({ length: lastPage - firstPage + 1 }, (_value, index) => firstPage + index);
}

function clampPageToRange(pageNumber: number, range: ChapterPageRange | null): number {
  if (!range) return 1;
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return range.firstPage;
  return Math.min(Math.max(Math.trunc(pageNumber), range.firstPage), range.lastPage);
}

export default function SurahScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    surahId?: string | string[];
    startVerse?: string | string[];
    startPage?: string | string[];
    view?: string | string[];
  }>();
  const router = useRouter();
  const surahId = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;
  const startVerseParam = Array.isArray(params.startVerse) ? params.startVerse[0] : params.startVerse;
  const startPageParam = Array.isArray(params.startPage) ? params.startPage[0] : params.startPage;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const isMushafView = viewParam === 'mushaf';
  const startVerse = startVerseParam ? Number(startVerseParam) : NaN;
  const normalizedStartVerse = Number.isFinite(startVerse) && startVerse > 0 ? Math.floor(startVerse) : undefined;
  const startPage = startPageParam ? Number(startPageParam) : NaN;
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const isSettingsOpenRef = React.useRef(isSettingsOpen);
  const isSettingsClosingRef = React.useRef(false);
  const pendingSettingsRouteActionRef = React.useRef<(() => void) | null>(null);
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = React.useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = React.useState('');
  const headerSearchInputRef = React.useRef<TextInput | null>(null);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );
  const [activeVerse, setActiveVerse] = React.useState<{
    verseKey: string;
    verseApiId?: number;
    arabicText: string;
    translationTexts: string[];
  } | null>(null);

  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { chapters } = useChapters();
  const audio = useAudioPlayer();
  const verseAudioWordSync = useVerseAudioWordSync();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const listContentContainerStyle = React.useMemo(
    () => ({ padding: 16, paddingBottom: 24 + audioPlayerBarHeight }),
    [audioPlayerBarHeight]
  );

  const { settings, isHydrated } = useSettings();
  const { isPinned, setLastRead } = useBookmarks();
  const chapterNumber = surahId ? Number(surahId) : NaN;
  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
  const selectedMushafOption = findMushafOption(selectedMushafId);
  const selectedMushafVersion = selectedMushafOption?.version ?? 'unknown';
  const translationIds = React.useMemo(() => {
    // An explicit empty array means "no translations selected" (Arabic-only mode).
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);
  const verseTranslationIds = React.useMemo(
    () => (isMushafView ? [] : translationIds),
    [isMushafView, translationIds]
  );
  const tafsirIds = React.useMemo(() => {
    const ids = Array.isArray(settings.tafsirIds) ? settings.tafsirIds : [];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.tafsirIds]);

  const showTranslationAttribution = !isMushafView && verseTranslationIds.length > 1;
  const { translationsById } = useTranslationResources({
    enabled: showTranslationAttribution,
    language: settings.contentLanguage,
  });

  const {
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
  } = useSurahVerses({
    chapterNumber,
    translationIds: verseTranslationIds,
    wordLang: settings.wordLang,
    includeWords: Boolean(!isMushafView && (settings.showByWords || audio.isVisible)),
    includeWordTranslations: Boolean(!isMushafView && settings.showByWords),
    initialVerseNumber: normalizedStartVerse,
    enabled: !isMushafView,
  });

  const verseNumbers = React.useMemo(
    () => Array.from({ length: Math.max(0, verseCount) }, (_value, index) => index + 1),
    [verseCount]
  );
  const navigationChapter = React.useMemo(
    () => chapters.find((item) => item.id === chapterNumber) ?? null,
    [chapterNumber, chapters]
  );
  const resolvedChapter = React.useMemo(
    () => chapter ?? navigationChapter,
    [chapter, navigationChapter]
  );
  const mushafPageRange = React.useMemo(
    () => getChapterPageRange(navigationChapter),
    [navigationChapter]
  );
  const requestedMushafPage = Number.isFinite(startPage) && startPage > 0 ? Math.floor(startPage) : NaN;
  const initialMushafPageNumber = React.useMemo(
    () =>
      clampPageToRange(
        Number.isFinite(requestedMushafPage)
          ? requestedMushafPage
          : mushafPageRange?.firstPage ?? 1,
        mushafPageRange
      ),
    [mushafPageRange, requestedMushafPage]
  );
  const mushafSurahPageNumbers = React.useMemo(
    () => buildPageRangeNumbers(mushafPageRange, FALLBACK_MUSHAF_TOTAL_PAGES),
    [mushafPageRange]
  );
  const mushafInitialWindowPageNumbers = React.useMemo(() => {
    const allowed = new Set(mushafSurahPageNumbers);
    const pageNumbers: number[] = [];
    for (
      let pageNumber = initialMushafPageNumber - 2;
      pageNumber <= initialMushafPageNumber + 2;
      pageNumber += 1
    ) {
      if (allowed.has(pageNumber)) {
        pageNumbers.push(pageNumber);
      }
    }
    return pageNumbers;
  }, [initialMushafPageNumber, mushafSurahPageNumbers]);
  const initialMushafPageProbe = useMushafPageData({
    packId: selectedMushafId,
    pageNumber: initialMushafPageNumber,
    expectedVersion: selectedMushafVersion,
    enabled: Boolean(isMushafView && isHydrated && selectedMushafOption?.renderer === 'webview'),
  });
  const resolvedMushafRenderer =
    initialMushafPageProbe.data?.pack.renderer ?? selectedMushafOption?.renderer ?? 'text';
  const activeMushafVersion = initialMushafPageProbe.data?.pack.version ?? selectedMushafVersion;
  const mushafTotalPages = initialMushafPageProbe.data?.pack.totalPages ?? FALLBACK_MUSHAF_TOTAL_PAGES;
  const chapterNamesById = React.useMemo(
    () => new Map(chapters.map((item) => [item.id, item.name_simple] as const)),
    [chapters]
  );
  const mushafChapterIndex = React.useMemo(
    () => chapters.findIndex((item) => item.id === Math.trunc(chapterNumber)),
    [chapterNumber, chapters]
  );
  const previousMushafChapter =
    mushafChapterIndex > 0 ? chapters[mushafChapterIndex - 1] : undefined;
  const nextMushafChapter =
    mushafChapterIndex >= 0 && mushafChapterIndex < chapters.length - 1
      ? chapters[mushafChapterIndex + 1]
      : undefined;
  const mushafSurahNavigation = React.useMemo(
    () => ({
      previousSurahName: previousMushafChapter?.name_simple,
      nextSurahName: nextMushafChapter?.name_simple,
    }),
    [nextMushafChapter?.name_simple, previousMushafChapter?.name_simple]
  );
  const mushafHighlightVerseKey = React.useMemo(() => {
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return null;
    if (typeof normalizedStartVerse !== 'number') return null;
    return `${Math.trunc(chapterNumber)}:${normalizedStartVerse}`;
  }, [chapterNumber, normalizedStartVerse]);
  const mushafSurahIntro = React.useMemo(() => {
    if (!resolvedChapter) return undefined;
    return {
      revelationPlace: resolvedChapter.revelation_place,
      showBismillah: resolvedChapter.id !== 9 && resolvedChapter.id !== 1,
      surahName: resolvedChapter.name_simple,
      versesCount: resolvedChapter.verses_count,
    };
  }, [resolvedChapter]);

  const openVerseActions = React.useCallback(
    (params: {
      verseKey: string;
      verseApiId?: number;
      arabicText: string;
      translationTexts: string[];
    }) => {
      setActiveVerse(params);
      setIsVerseActionsOpen(true);
    },
    []
  );

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const closeHeaderSearch = React.useCallback(
    ({ clearQuery }: { clearQuery: boolean }) => {
      setIsHeaderSearchOpen(false);
      if (clearQuery) setHeaderSearchQuery('');
      headerSearchInputRef.current?.blur();
      Keyboard.dismiss();
    },
    []
  );

  const updateHeaderSearchQuery = React.useCallback((value: string) => {
    setHeaderSearchQuery(value);
    setIsHeaderSearchOpen(true);
  }, []);

  const navigateToSearchPage = React.useCallback(() => {
    const trimmed = headerSearchQuery.trim();
    if (!trimmed) return;
    closeHeaderSearch({ clearQuery: true });
    router.push({ pathname: '/search', params: { query: trimmed } });
  }, [closeHeaderSearch, headerSearchQuery, router]);

  const navigateToSurahVerse = React.useCallback(
    async (targetSurahId: number, verse?: number) => {
      closeHeaderSearch({ clearQuery: true });
      await preloadOfflineSurahNavigationPage({
        surahId: targetSurahId,
        verseNumber: verse,
        settings,
      });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(targetSurahId),
          ...(typeof verse === 'number' ? { startVerse: String(verse) } : {}),
          ...(isMushafView ? { view: 'mushaf' } : {}),
        },
      });
    },
    [closeHeaderSearch, isMushafView, router, settings]
  );

  const navigateToJuz = React.useCallback(
    (juzNumber: number) => {
      closeHeaderSearch({ clearQuery: true });
      router.push({ pathname: '/juz/[juzNumber]', params: { juzNumber: String(juzNumber) } });
    },
    [closeHeaderSearch, router]
  );

  const navigateToPage = React.useCallback(
    (pageNumber: number) => {
      closeHeaderSearch({ clearQuery: true });
      router.push({ pathname: '/page/[pageNumber]', params: { pageNumber: String(pageNumber) } });
    },
    [closeHeaderSearch, router, settings]
  );

  React.useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
    if (isSettingsOpen) {
      isSettingsClosingRef.current = false;
    }
  }, [isSettingsOpen]);

  const openTranslationSettings = React.useCallback(() => {
    pendingSettingsRouteActionRef.current = null;
    isSettingsClosingRef.current = false;
    isSettingsOpenRef.current = true;
    setIsSettingsOpen(true);
  }, []);

  const closeSettingsSidebar = React.useCallback(() => {
    pendingSettingsRouteActionRef.current = null;
    isSettingsClosingRef.current = isSettingsOpenRef.current;
    isSettingsOpenRef.current = false;
    setIsSettingsOpen(false);
  }, []);

  const runAfterSettingsSidebarClose = React.useCallback((action: () => void) => {
    if (isSettingsOpenRef.current || isSettingsClosingRef.current) {
      pendingSettingsRouteActionRef.current = action;
      isSettingsClosingRef.current = true;
      isSettingsOpenRef.current = false;
      setIsSettingsOpen(false);
      return;
    }

    action();
  }, []);

  const handleSettingsSidebarClosed = React.useCallback(() => {
    isSettingsClosingRef.current = false;
    const pendingAction = pendingSettingsRouteActionRef.current;
    pendingSettingsRouteActionRef.current = null;
    pendingAction?.();
  }, []);

  const handleSettingsTabChange = React.useCallback(
    (nextTab: SettingsTab) => {
      if (nextTab === 'translations') {
        runAfterSettingsSidebarClose(() => {
          router.setParams({ view: 'translations' });
        });
        return;
      }

      if (nextTab !== 'mushaf') return;

      const mushafRepository = container.getMushafPageRepository();
      const currentChapter = chapters.find((item) => item.id === chapterNumber);
      const pageRange = getChapterPageRange(currentChapter);
      const fallbackPage = pageRange?.firstPage ?? 1;
      const focusVerseKey =
        visibleVerseKeyRef.current ??
        (typeof normalizedStartVerse === 'number'
          ? getVerseByNumber(normalizedStartVerse)?.verse_key ?? null
          : getVerseByNumber(1)?.verse_key ?? null);
      const focusVerseNumber = parseVerseKeyNumbers(focusVerseKey)?.verseNumber;

      runAfterSettingsSidebarClose(() => {
        void (async () => {
          let targetPage = fallbackPage;
          const activePackVersion = await resolveActiveMushafVersion(
            selectedMushafId,
            selectedMushafVersion
          );

          if (focusVerseKey) {
            try {
              const resolvedPage = await mushafRepository.findPageForVerse({
                packId: selectedMushafId,
                verseKey: focusVerseKey,
              });

              if (typeof resolvedPage === 'number' && resolvedPage > 0) {
                targetPage = pageRange ? clampPageToRange(resolvedPage, pageRange) : resolvedPage;
              }
            } catch {
              // Fall back to the surah's first page if lookup resolution fails.
            }
          }

          mushafRepository.setActivePageCacheIdentity({
            packId: selectedMushafId,
            version: activePackVersion,
          });

          try {
            await mushafRepository.prefetchPages({
              packId: selectedMushafId,
              pageNumbers: [targetPage],
              expectedVersion: activePackVersion,
            });
          } catch {
            // Let the mushaf screen show the local-pack error if the selected pack is unavailable.
          }

          void mushafRepository.prefetchPages({
            packId: selectedMushafId,
            pageNumbers: pageRange
              ? [targetPage - 1, targetPage + 1].filter(
                  (pageNumber) =>
                    pageNumber >= pageRange.firstPage && pageNumber <= pageRange.lastPage
                )
              : [targetPage - 1, targetPage + 1],
            expectedVersion: activePackVersion,
          });

          router.setParams({
            view: 'mushaf',
            startPage: String(targetPage),
            ...(typeof focusVerseNumber === 'number' ? { startVerse: String(focusVerseNumber) } : {}),
          });
        })();
      });
    },
    [
      chapterNumber,
      chapters,
      getVerseByNumber,
      normalizedStartVerse,
      router,
      runAfterSettingsSidebarClose,
      selectedMushafId,
      selectedMushafVersion,
    ]
  );

  const navigateToMushafSurah = React.useCallback(
    async (targetSurahId: number) => {
      const targetChapter = chapters.find((item) => item.id === targetSurahId);
      const targetRange = getChapterPageRange(targetChapter);
      const targetPage = targetRange?.firstPage ?? 1;

      try {
        const activePackVersion = await resolveActiveMushafVersion(
          selectedMushafId,
          selectedMushafVersion
        );
        const pageNumbers = targetRange
          ? buildPageRangeNumbers(targetRange, FALLBACK_MUSHAF_TOTAL_PAGES).slice(0, 2)
          : [targetPage];

        container.getMushafPageRepository().setActivePageCacheIdentity({
          packId: selectedMushafId,
          version: activePackVersion,
        });
        void container.getMushafPageRepository().prefetchPages({
          packId: selectedMushafId,
          pageNumbers,
          expectedVersion: activePackVersion,
        });
      } catch {
        // The target screen will surface the selected mushaf pack error if needed.
      }

      setIsVerseActionsOpen(false);
      setIsSettingsOpen(false);
      router.replace({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(targetSurahId),
          view: 'mushaf',
          startVerse: '1',
          startPage: String(targetPage),
        },
      });
    },
    [
      chapters,
      router,
      selectedMushafId,
      selectedMushafVersion,
    ]
  );

  React.useEffect(() => {
    if (!isMushafView) return;
    if (selectedMushafOption?.renderer !== 'webview') return;
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;

    let cancelled = false;
    let neighborPrefetchTimeout: ReturnType<typeof setTimeout> | null = null;

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const activePackVersion = await resolveActiveMushafVersion(
            selectedMushafId,
            activeMushafVersion
          );
          if (cancelled) return;

          const repository = container.getMushafPageRepository();
          repository.setActivePageCacheIdentity({
            packId: selectedMushafId,
            version: activePackVersion,
          });

          const pagesToPrefetch = new Set<number>(mushafInitialWindowPageNumbers);
          const currentIndex = chapters.findIndex((item) => item.id === Math.trunc(chapterNumber));
          const previousRange =
            currentIndex > 0 ? getChapterPageRange(chapters[currentIndex - 1]) : null;
          const nextRange =
            currentIndex >= 0 && currentIndex < chapters.length - 1
              ? getChapterPageRange(chapters[currentIndex + 1])
              : null;

          if (previousRange) {
            buildPageRangeNumbers(previousRange, FALLBACK_MUSHAF_TOTAL_PAGES)
              .slice(-2)
              .forEach((pageNumber) => pagesToPrefetch.add(pageNumber));
          }

          if (nextRange) {
            buildPageRangeNumbers(nextRange, FALLBACK_MUSHAF_TOTAL_PAGES)
              .slice(0, 2)
              .forEach((pageNumber) => pagesToPrefetch.add(pageNumber));
          }

          if (pagesToPrefetch.size === 0) return;

          void repository.prefetchPages({
            packId: selectedMushafId,
            pageNumbers: mushafInitialWindowPageNumbers,
            expectedVersion: activePackVersion,
          });

          neighborPrefetchTimeout = setTimeout(() => {
            if (cancelled) return;
            void repository.prefetchPages({
              packId: selectedMushafId,
              pageNumbers: Array.from(pagesToPrefetch),
              expectedVersion: activePackVersion,
            });
          }, 650);
        } catch {
          // The reader itself will surface installed-pack errors.
        }
      })();
    });

    return () => {
      cancelled = true;
      interactionTask.cancel?.();
      if (neighborPrefetchTimeout) {
        clearTimeout(neighborPrefetchTimeout);
      }
    };
  }, [
    activeMushafVersion,
    chapterNumber,
    chapters,
    isMushafView,
    mushafInitialWindowPageNumbers,
    selectedMushafId,
    selectedMushafOption?.renderer,
  ]);

  const mushafSelectionMetadataRef = React.useRef<MushafSelectionPayload | null>(null);
  const mushafNavigationInFlightRef = React.useRef(false);
  React.useEffect(() => {
    mushafNavigationInFlightRef.current = false;
  }, [chapterNumber, isMushafView]);

  const handleMushafSelectionChange = React.useCallback((payload: MushafSelectionPayload) => {
    mushafSelectionMetadataRef.current = payload.isCollapsed ? null : payload;
  }, []);
  const handleMushafVersePress = React.useCallback(
    (verse: MushafSingleDocumentVersePress) => {
      if (mushafSelectionMetadataRef.current && !mushafSelectionMetadataRef.current.isCollapsed) {
        return;
      }

      openVerseActions({
        verseKey: verse.verseKey,
        verseApiId: verse.verseApiId,
        arabicText: verse.arabicText,
        translationTexts: verse.translationTexts,
      });
    },
    [openVerseActions]
  );
  const handleMushafSurahNavigation = React.useCallback(
    (direction: 'next' | 'previous') => {
      if (mushafNavigationInFlightRef.current) return;
      if (mushafChapterIndex < 0) return;

      const targetChapter = direction === 'next' ? nextMushafChapter : previousMushafChapter;
      if (!targetChapter) return;

      mushafNavigationInFlightRef.current = true;
      void navigateToMushafSurah(targetChapter.id).finally(() => {
        setTimeout(() => {
          mushafNavigationInFlightRef.current = false;
        }, 400);
      });
    },
    [
      mushafChapterIndex,
      navigateToMushafSurah,
      nextMushafChapter,
      previousMushafChapter,
    ]
  );

  const listExtraData = React.useMemo(
    () => ({
      arabicFontSize: settings.arabicFontSize,
      translationFontSize: settings.translationFontSize,
      arabicFontFace: settings.arabicFontFace,
      showByWords: settings.showByWords,
      audioActiveVerseKey: audio.activeVerseKey,
      audioIsVisible: audio.isVisible,
      pagesSignature,
    }),
    [
      pagesSignature,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.translationFontSize,
      audio.activeVerseKey,
      audio.isVisible,
    ]
  );

  const handlePlayPause = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;

    if (audio.activeVerseKey === verseKey) {
      audio.togglePlay();
      return;
    }

    audio.playVerse(verseKey);
  }, [activeVerse?.verseKey, audio.activeVerseKey, audio.playVerse, audio.togglePlay]);

  const handleBookmark = React.useCallback(() => {
    if (!activeVerse) return;
    setIsBookmarkModalOpen(true);
  }, [activeVerse]);

  const handleOpenTafsir = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const [surah, ayah] = verseKey.split(':');
    if (!surah || !ayah) return;
    const surahNumber = Number(surah);
    primeVerseDetailsCache({
      verseKey,
      arabicText: activeVerse?.arabicText,
      translationIds,
      translationTexts: activeVerse?.translationTexts,
    });
    if (Number.isFinite(surahNumber) && surahNumber > 0) {
      void preloadOfflineTafsirSurah({ surahId: surahNumber, tafsirIds });
    }
    router.push({ pathname: '/tafsir/[surahId]/[ayahId]', params: { surahId: surah, ayahId: ayah } });
  }, [
    activeVerse?.arabicText,
    activeVerse?.translationTexts,
    activeVerse?.verseKey,
    router,
    tafsirIds,
    translationIds,
  ]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    setPlannerVerseSummary({
      verseKey,
      ...(Number.isFinite(chapterNumber) ? { surahId: chapterNumber } : {}),
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse?.arabicText, activeVerse?.translationTexts, activeVerse?.verseKey, chapterNumber]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const lines = [
      chapter?.name_simple ? `${chapter.name_simple} ${activeVerse.verseKey}` : activeVerse.verseKey,
      '',
      activeVerse.arabicText,
      '',
      ...(activeVerse.translationTexts?.length ? [activeVerse.translationTexts[0]!] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore share failures.
    }
  }, [activeVerse, chapter?.name_simple]);

  const renderVerseItem = React.useCallback(
    ({ item }: { item: number }) => {
      const verse = getVerseByNumber(item);
      if (!verse) {
        return <VerseCardPlaceholder verseKey={`${chapterNumber}:${item}`} />;
      }

      const translationTexts = verse.translationTexts ?? [];
      const translationItems = showTranslationAttribution
        ? (verse.translationItems ?? []).map((t) => {
            if (t.resourceName) return t;
            const fallbackName =
              typeof t.resourceId === 'number'
                ? translationsById.get(t.resourceId)?.name ?? `Translation ${t.resourceId}`
                : undefined;
            return { ...t, resourceName: fallbackName };
          })
        : verse.translationItems ?? [];
      const verseApiId =
        typeof verse.id === 'number' && Number.isFinite(verse.id) && verse.id > 0 ? verse.id : undefined;

      return (
        <VerseCard
          verseKey={verse.verse_key}
          arabicText={verse.text_uthmani ?? ''}
          words={verse.words}
          translationTexts={translationTexts}
          translationItems={translationItems}
          showTranslationAttribution={showTranslationAttribution}
          isAudioActive={Boolean(audio.isVisible && audio.activeVerseKey === verse.verse_key)}
          audioWordSync={verseAudioWordSync}
          arabicFontSize={settings.arabicFontSize}
          arabicFontFace={settings.arabicFontFace}
          translationFontSize={settings.translationFontSize}
          showByWords={settings.showByWords}
          onOpenActions={() =>
            openVerseActions({
              verseKey: verse.verse_key,
              verseApiId,
              arabicText: verse.text_uthmani ?? '',
              translationTexts,
            })
          }
        />
      );
    },
    [
      audio.activeVerseKey,
      audio.isVisible,
      openVerseActions,
      showTranslationAttribution,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.translationFontSize,
      translationsById,
      verseAudioWordSync,
      chapterNumber,
      getVerseByNumber,
    ]
  );

  const flatListRef = React.useRef<FlatList<number> | null>(null);
  const flashListRef = React.useRef<FlashListRef<number> | null>(null);
  const visibleVerseKeyRef = React.useRef<string | null>(null);
  const lastPrefetchedMushafVerseRef = React.useRef<string | null>(null);
  const mushafPrefetchRequestIdRef = React.useRef(0);
  const didScrollToStartRef = React.useRef(false);
  const [scrollTick, bumpScrollTick] = React.useReducer((value) => value + 1, 0);
  const scrollRetryCountRef = React.useRef(0);
  const scrollRetryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startVerseRef = React.useRef(startVerse);

  const didAutoScrollToAudioVerseRef = React.useRef<string | null>(null);
  const [autoScrollTick, bumpAutoScrollTick] = React.useReducer((value) => value + 1, 0);
  const autoScrollRetryCountRef = React.useRef(0);
  const autoScrollRetryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapterNumberRef = React.useRef(chapterNumber);
  React.useEffect(() => {
    chapterNumberRef.current = chapterNumber;
  }, [chapterNumber]);

  const verseCountRef = React.useRef(verseCount);
  React.useEffect(() => {
    verseCountRef.current = verseCount;
  }, [verseCount]);

  React.useEffect(() => {
    startVerseRef.current = startVerse;
  }, [startVerse]);

  const getVerseByNumberRef = React.useRef(getVerseByNumber);
  React.useEffect(() => {
    getVerseByNumberRef.current = getVerseByNumber;
  }, [getVerseByNumber]);

  const ensureVerseRangeLoadedRef = React.useRef(ensureVerseRangeLoaded);
  React.useEffect(() => {
    ensureVerseRangeLoadedRef.current = ensureVerseRangeLoaded;
  }, [ensureVerseRangeLoaded]);

  const setLastReadRef = React.useRef(setLastRead);
  React.useEffect(() => {
    setLastReadRef.current = setLastRead;
  }, [setLastRead]);

  React.useEffect(() => {
    lastPrefetchedMushafVerseRef.current = null;
    mushafPrefetchRequestIdRef.current = 0;
  }, [selectedMushafId, selectedMushafVersion]);

  const prefetchMushafForVerse = React.useCallback(
    (verseKey: string | null) => {
      const normalizedVerseKey = typeof verseKey === 'string' ? verseKey.trim() : '';
      if (!normalizedVerseKey) return;

      const prefetchKey = `${selectedMushafId}:${selectedMushafVersion}:${normalizedVerseKey}`;
      if (lastPrefetchedMushafVerseRef.current === prefetchKey) {
        return;
      }

      lastPrefetchedMushafVerseRef.current = prefetchKey;
      const requestId = ++mushafPrefetchRequestIdRef.current;
      const mushafRepository = container.getMushafPageRepository();

      void (async () => {
        try {
          const activePackVersion = await resolveActiveMushafVersion(
            selectedMushafId,
            selectedMushafVersion
          );
          mushafRepository.setActivePageCacheIdentity({
            packId: selectedMushafId,
            version: activePackVersion,
          });

          const resolvedPage = await mushafRepository.findPageForVerse({
            packId: selectedMushafId,
            verseKey: normalizedVerseKey,
          });

          if (mushafPrefetchRequestIdRef.current !== requestId) {
            return;
          }

          if (!resolvedPage) {
            return;
          }

          await mushafRepository.prefetchPages({
            packId: selectedMushafId,
            pageNumbers: [resolvedPage - 1, resolvedPage, resolvedPage + 1],
            expectedVersion: activePackVersion,
          });
        } catch {
          // Ignore background mushaf prefetch failures on the translation screen.
        }
      })();
    },
    [selectedMushafId, selectedMushafVersion]
  );

  React.useEffect(() => {
    if (!isSettingsOpen) return;
    if (isMushafView) return;
    if (selectedMushafOption?.renderer !== 'webview') return;

    let cancelled = false;
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      prefetchTimeout = setTimeout(() => {
        if (cancelled) return;
        const focusVerseKey =
          visibleVerseKeyRef.current ??
          (typeof normalizedStartVerse === 'number'
            ? getVerseByNumber(normalizedStartVerse)?.verse_key ?? null
            : getVerseByNumber(1)?.verse_key ?? null);

        prefetchMushafForVerse(focusVerseKey);
      }, 120);
    });

    return () => {
      cancelled = true;
      interactionTask.cancel?.();
      if (prefetchTimeout) {
        clearTimeout(prefetchTimeout);
      }
    };
  }, [
    getVerseByNumber,
    isMushafView,
    isSettingsOpen,
    normalizedStartVerse,
    prefetchMushafForVerse,
    selectedMushafOption?.renderer,
  ]);

  const lastReadReportedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    lastReadReportedRef.current = null;
    visibleVerseKeyRef.current = null;
  }, [surahId]);

  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 60 }).current;
  const visibleRangeRef = React.useRef<{ first: number; last: number } | null>(null);

  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      let firstVisibleIndex = Number.POSITIVE_INFINITY;
      let lastVisibleIndex = -1;
      const currentSurahId = chapterNumberRef.current;
      if (!Number.isFinite(currentSurahId) || currentSurahId <= 0) return;

      let bestIndex = Number.POSITIVE_INFINITY;
      let bestItem: SurahVerse | null = null;

      for (const token of viewableItems) {
        if (!token.isViewable) continue;
        const index = typeof token.index === 'number' ? token.index : Number.POSITIVE_INFINITY;
        if (Number.isFinite(index)) {
          firstVisibleIndex = Math.min(firstVisibleIndex, index);
          lastVisibleIndex = Math.max(lastVisibleIndex, index);
        }

        const verseNumber =
          typeof token.item === 'number'
            ? token.item
            : Number.parseInt(String(token.item ?? ''), 10);
        if (!Number.isFinite(verseNumber) || verseNumber <= 0) continue;

        const loadedVerse = getVerseByNumberRef.current(Math.trunc(verseNumber));
        if (!loadedVerse) continue;
        if (index >= bestIndex) continue;
        bestIndex = index;
        bestItem = loadedVerse;
      }

      visibleRangeRef.current =
        lastVisibleIndex >= 0 && Number.isFinite(firstVisibleIndex)
          ? { first: firstVisibleIndex, last: lastVisibleIndex }
          : null;

      if (Number.isFinite(firstVisibleIndex) && lastVisibleIndex >= 0) {
        ensureVerseRangeLoadedRef.current(firstVisibleIndex + 1, lastVisibleIndex + 1, 1);
      }

      const targetStartVerse = startVerseRef.current;
      const visibleRange = visibleRangeRef.current;
      if (
        visibleRange &&
        Number.isFinite(targetStartVerse) &&
        targetStartVerse > 0
      ) {
        const targetIndex = Math.max(0, Math.floor(targetStartVerse) - 1);
        if (targetIndex >= visibleRange.first && targetIndex <= visibleRange.last) {
          didScrollToStartRef.current = true;
          scrollRetryCountRef.current = 0;
          if (scrollRetryTimeoutRef.current) {
            clearTimeout(scrollRetryTimeoutRef.current);
            scrollRetryTimeoutRef.current = null;
          }
        }
      }

      if (!bestItem) return;

      visibleVerseKeyRef.current = bestItem.verse_key ?? null;

      const verseNumber = bestItem.verse_number;
      if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;

      const globalVerseId =
        typeof bestItem.id === 'number' && Number.isFinite(bestItem.id) && bestItem.id > 0
          ? bestItem.id
          : undefined;

      const key = `${currentSurahId}:${verseNumber}`;
      if (lastReadReportedRef.current === key) return;
      lastReadReportedRef.current = key;

      setLastReadRef.current(
        String(currentSurahId),
        verseNumber,
        bestItem.verse_key,
        globalVerseId
      );
    }
  ).current;

  React.useEffect(() => {
    return () => {
      if (scrollRetryTimeoutRef.current) {
        clearTimeout(scrollRetryTimeoutRef.current);
        scrollRetryTimeoutRef.current = null;
      }
      if (autoScrollRetryTimeoutRef.current) {
        clearTimeout(autoScrollRetryTimeoutRef.current);
        autoScrollRetryTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    didScrollToStartRef.current = false;
    scrollRetryCountRef.current = 0;
    didAutoScrollToAudioVerseRef.current = null;
    autoScrollRetryCountRef.current = 0;
    if (scrollRetryTimeoutRef.current) {
      clearTimeout(scrollRetryTimeoutRef.current);
      scrollRetryTimeoutRef.current = null;
    }
    if (autoScrollRetryTimeoutRef.current) {
      clearTimeout(autoScrollRetryTimeoutRef.current);
      autoScrollRetryTimeoutRef.current = null;
    }
  }, [surahId, startVerseParam]);

  React.useEffect(() => {
    if (!Number.isFinite(startVerse) || startVerse <= 0) return;
    if (didScrollToStartRef.current) return;
    if (verseCountRef.current <= 0) return;

    ensureVerseRangeLoadedRef.current(startVerse, startVerse, 1);

    const scheduleRetry = () => {
      if (didScrollToStartRef.current) return;
      if (scrollRetryCountRef.current >= 10) return;
      if (scrollRetryTimeoutRef.current) return;
      scrollRetryCountRef.current += 1;
      scrollRetryTimeoutRef.current = setTimeout(() => {
        scrollRetryTimeoutRef.current = null;
        bumpScrollTick();
      }, 140);
    };

    const targetIndex = Math.max(0, Math.floor(startVerse) - 1);

    if (targetIndex >= verseCountRef.current) return;

    const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
    if (!list) {
      scheduleRetry();
      return;
    }

    try {
      list.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0 });
    } catch {}

    scheduleRetry();
  }, [scrollTick, startVerse, verseCount]);

  React.useEffect(() => {
    if (!audio.isPlaying) {
      didAutoScrollToAudioVerseRef.current = null;
      autoScrollRetryCountRef.current = 0;
      if (autoScrollRetryTimeoutRef.current) {
        clearTimeout(autoScrollRetryTimeoutRef.current);
        autoScrollRetryTimeoutRef.current = null;
      }
      return;
    }

    const verseKey = audio.activeVerseKey;
    if (!verseKey) return;

    const parsed = parseVerseKeyNumbers(verseKey);
    if (!parsed) return;
    if (!Number.isFinite(chapterNumber)) return;
    if (parsed.surahId !== Math.trunc(chapterNumber)) return;

    if (didAutoScrollToAudioVerseRef.current === verseKey) return;

    const targetIndex = Math.max(0, parsed.verseNumber - 1);
    if (targetIndex >= verseCountRef.current) return;
    ensureVerseRangeLoadedRef.current(parsed.verseNumber, parsed.verseNumber, 1);

    const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
    if (!list) return;

    const visibleRange = visibleRangeRef.current;
    if (visibleRange && targetIndex >= visibleRange.first && targetIndex <= visibleRange.last) {
      didAutoScrollToAudioVerseRef.current = verseKey;
      autoScrollRetryCountRef.current = 0;
      return;
    }

    try {
      list.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0 });
      didAutoScrollToAudioVerseRef.current = verseKey;
      autoScrollRetryCountRef.current = 0;
    } catch {
      if (autoScrollRetryCountRef.current >= 6) return;
      autoScrollRetryCountRef.current += 1;
      if (autoScrollRetryTimeoutRef.current) return;
      autoScrollRetryTimeoutRef.current = setTimeout(() => {
        autoScrollRetryTimeoutRef.current = null;
        bumpAutoScrollTick();
      }, 120);
    }
  }, [
    audio.activeVerseKey,
    audio.isPlaying,
    autoScrollTick,
    chapterNumber,
    verseCount,
  ]);

  const activeVersePinned = React.useMemo(() => {
    if (!activeVerse) return false;
    const apiId = typeof activeVerse.verseApiId === 'number' ? String(activeVerse.verseApiId) : null;
    return Boolean((apiId && isPinned(apiId)) || isPinned(activeVerse.verseKey));
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;
    const verseApiId =
      typeof activeVerse.verseApiId === 'number' &&
      Number.isFinite(activeVerse.verseApiId) &&
      activeVerse.verseApiId > 0
        ? activeVerse.verseApiId
        : undefined;
    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof verseApiId === 'number' ? { verseApiId } : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(chapter?.name_simple ? { surahName: chapter.name_simple } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse, chapter?.name_simple]);

  const mushafEntryProgress = React.useRef(new Animated.Value(isMushafView ? 1 : 0)).current;
  const mushafSurfaceBackground = resolvedTheme === 'dark' ? '#102033' : palette.background;
  const mushafEntryStyle = React.useMemo(
    () => ({
      opacity: mushafEntryProgress,
    }),
    [mushafEntryProgress]
  );

  React.useEffect(() => {
    mushafEntryProgress.stopAnimation();

    if (!isMushafView) {
      mushafEntryProgress.setValue(0);
      return;
    }

    mushafEntryProgress.setValue(0);
    Animated.timing(mushafEntryProgress, {
      toValue: 1,
      duration: 130,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: true,
    }).start();
  }, [isMushafView, mushafEntryProgress]);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          title: '',
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginLeft: 12 })}
            >
              <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
            </Pressable>
          ),
          headerTitle: () => (
            <View style={{ width: '100%', paddingHorizontal: 8 }}>
              <HeaderSearchInput
                ref={(node) => {
                  headerSearchInputRef.current = node;
                }}
                value={headerSearchQuery}
                onChangeText={updateHeaderSearchQuery}
                placeholder="Search…"
                onFocus={() => setIsHeaderSearchOpen(true)}
                onSubmitEditing={navigateToSearchPage}
              />
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={openTranslationSettings}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              {({ pressed }) => (
                <Settings
                  color={palette.text}
                  size={22}
                  strokeWidth={2.25}
                  style={{ marginRight: 12, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
        }}
      />

      <View style={styles.contentStage}>
        {!isMushafView ? (
          <View
            style={styles.contentLayer}
            pointerEvents="auto"
          >
            {!hasLoadedContent && offlineNotInstalled ? (
              <View className="flex-1 px-4 pt-4">
                <View className="mt-2 gap-3">
                  <Text className="text-sm text-muted dark:text-muted-dark">
                    You’re offline and this translation isn’t downloaded yet.
                  </Text>
                  <Pressable
                    onPress={openTranslationSettings}
                    accessibilityRole="button"
                    accessibilityLabel="Open translation settings"
                    className="self-start rounded-lg bg-accent px-4 py-2"
                    style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                  >
                    <Text className="text-sm font-semibold text-on-accent">
                      Open translation settings
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : !hasLoadedContent && errorMessage ? (
              <View className="flex-1 px-4 pt-4">
                <View className="mt-2 gap-3">
                  <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                  <Pressable
                    onPress={retry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading verses"
                    className="self-start rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                      Retry
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : !hasLoadedContent && verseCount > 0 ? (
              <FlatList
                data={INITIAL_PLACEHOLDER_VERSE_NUMBERS}
                keyExtractor={(item) => `placeholder:${chapterNumber}:${item}`}
                renderItem={({ item }) => (
                  <VerseCardPlaceholder verseKey={`${chapterNumber}:${item}`} />
                )}
                contentContainerStyle={listContentContainerStyle}
                ListHeaderComponent={chapter ? <SurahHeaderCard chapter={chapter} /> : null}
                scrollEnabled={false}
              />
            ) : verseCount <= 0 ? (
              <View className="flex-1 px-4 pt-4">
                <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
                  No verses found for this surah.
                </Text>
              </View>
            ) : Platform.OS === 'web' ? (
              <FlatList
                ref={(node) => {
                  flatListRef.current = node;
                }}
                data={verseNumbers}
                keyExtractor={(item) => `${chapterNumber}:${item}`}
                extraData={listExtraData}
                renderItem={renderVerseItem}
                contentContainerStyle={listContentContainerStyle}
                refreshing={isRefreshing}
                onRefresh={refresh}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                ListHeaderComponent={chapter ? <SurahHeaderCard chapter={chapter} /> : null}
                ListFooterComponent={
                  isLoadingMore || (errorMessage && hasLoadedContent) ? (
                    <View className="mt-2 flex-row items-center gap-3">
                      {isLoadingMore ? <ActivityIndicator color={palette.text} /> : null}
                      {errorMessage && hasLoadedContent ? (
                        <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                      ) : (
                        <Text className="text-sm text-muted dark:text-muted-dark">Loading more…</Text>
                      )}
                    </View>
                  ) : null
                }
              />
            ) : (
              <FlashList
                ref={(node) => {
                  flashListRef.current = node;
                }}
                data={verseNumbers}
                keyExtractor={(item) => `${chapterNumber}:${item}`}
                extraData={listExtraData}
                renderItem={renderVerseItem}
                drawDistance={Platform.OS === 'android' ? 1200 : 800}
                contentContainerStyle={listContentContainerStyle}
                refreshing={isRefreshing}
                onRefresh={refresh}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                ListHeaderComponent={chapter ? <SurahHeaderCard chapter={chapter} /> : null}
                ListFooterComponent={
                  isLoadingMore || (errorMessage && hasLoadedContent) ? (
                    <View className="mt-2 flex-row items-center gap-3">
                      {isLoadingMore ? <ActivityIndicator color={palette.text} /> : null}
                      {errorMessage && hasLoadedContent ? (
                        <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                      ) : (
                        <Text className="text-sm text-muted dark:text-muted-dark">Loading more…</Text>
                      )}
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        ) : null}

        {isMushafView ? (
          <Animated.View
            style={[
              styles.contentLayer,
              styles.mushafEntryLayer,
              { backgroundColor: mushafSurfaceBackground },
              mushafEntryStyle,
            ]}
          >
            {!isHydrated ? (
              <MushafMessageState
                color={palette.text}
                message="Loading local mushaf settings…"
                showSpinner
              />
            ) : !mushafPageRange ? (
              <MushafMessageState color={palette.text} message="No mushaf pages found for this surah." />
            ) : resolvedMushafRenderer !== 'webview' ? (
              <MushafMessageState
                color={palette.text}
                message="Select a King Fahad Complex mushaf pack to use this surah Mushaf view."
              />
            ) : initialMushafPageProbe.errorMessage ? (
              <MushafMessageState color={palette.text} message={initialMushafPageProbe.errorMessage} />
            ) : (
              <MushafSingleDocumentReader
                backgroundPageNumbers={mushafInitialWindowPageNumbers}
                chapterNamesById={chapterNamesById}
                compactPageLines
                expectedVersion={activeMushafVersion}
                filterChapterId={Math.trunc(chapterNumber)}
                focusTopInsetPx={96}
                highlightVerseKey={mushafHighlightVerseKey}
                initialPageData={initialMushafPageProbe.data}
                initialPageNumber={initialMushafPageNumber}
                mushafScaleStep={settings.mushafScaleStep}
                onSelectionChange={handleMushafSelectionChange}
                onSurahNavigation={handleMushafSurahNavigation}
                onVersePress={handleMushafVersePress}
                pageNumbers={
                  mushafSurahPageNumbers.length ? mushafSurahPageNumbers : [initialMushafPageNumber]
                }
                packId={selectedMushafId}
                surahIntro={mushafSurahIntro}
                surahNavigation={mushafSurahNavigation}
                totalPages={mushafTotalPages}
              />
            )}
          </Animated.View>
        ) : null}
      </View>

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={chapter?.name_simple ?? 'Surah'}
        verseKey={activeVerse?.verseKey ?? ''}
        isPlaying={Boolean(audio.isPlaying && audio.activeVerseKey === activeVerse?.verseKey)}
        isBookmarked={activeVersePinned}
        onPlayPause={handlePlayPause}
        onOpenTafsir={handleOpenTafsir}
        onBookmark={handleBookmark}
        onAddToPlan={handleAddToPlan}
        onShare={handleShare}
      />

      <BookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => setIsBookmarkModalOpen(false)}
        verseId={
          typeof activeVerse?.verseApiId === 'number' &&
          Number.isFinite(activeVerse.verseApiId) &&
          activeVerse.verseApiId > 0
            ? String(activeVerse.verseApiId)
            : (activeVerse?.verseKey ?? '')
        }
        verseKey={activeVerse?.verseKey ?? ''}
        metadata={activeVerseBookmarkMetadata}
      />

      {plannerVerseSummary ? (
        <AddToPlannerModal
          isOpen={isAddToPlannerOpen}
          onClose={() => setIsAddToPlannerOpen(false)}
          verseSummary={plannerVerseSummary}
        />
      ) : null}

      <ComprehensiveSearchDropdown
        isOpen={isHeaderSearchOpen}
        query={headerSearchQuery}
        onQueryChange={updateHeaderSearchQuery}
        onClose={() => closeHeaderSearch({ clearQuery: false })}
        onNavigateToSurahVerse={navigateToSurahVerse}
        onNavigateToJuz={navigateToJuz}
        onNavigateToPage={navigateToPage}
        onNavigateToSearch={(query) => {
          const trimmed = query.trim();
          if (!trimmed) return;
          closeHeaderSearch({ clearQuery: true });
          router.push({ pathname: '/search', params: { query: trimmed } });
        }}
      />
      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={closeSettingsSidebar}
        onAfterClose={handleSettingsSidebarClosed}
        activeTab={isMushafView ? 'mushaf' : 'translations'}
        onTabChange={handleSettingsTabChange}
      />
    </View>
  );
}
