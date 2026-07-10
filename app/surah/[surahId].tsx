import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Settings } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import {
  MushafSingleDocumentReader,
  type MushafSingleDocumentReaderHandle,
  type MushafSingleDocumentVersePress,
} from '@/components/mushaf/MushafSingleDocumentReader';
import type { MushafSelectionPayload } from '@/components/mushaf/mushafWordPayload';
import { AppSearchHeader, ReaderOverlayHeader } from '@/components/navigation/AppHeader';
import { useCollapsibleReaderHeader } from '@/components/navigation/useCollapsibleReaderHeader';
import { useHeaderSearch } from '@/components/navigation/useHeaderSearch';
import { IndexScrubber, type IndexScrubberHandle } from '@/components/reader/IndexScrubber';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import type { SettingsTab } from '@/components/reader/settings/SettingsTabToggle';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import { SurahHeaderCard } from '@/components/surah/SurahHeaderCard';
import { getSurahHeaderPresentation } from '@/components/surah/surahHeaderPresentation';
import { useVerseAudioWordSync } from '@/components/surah/useVerseAudioWordSync';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { VerseScrubber, type VerseScrubberHandle } from '@/components/surah/VerseScrubber';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { useSurahVerses, type SurahVerse } from '@/hooks/useSurahVerses';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { preloadOfflineTafsirWindow } from '@/lib/tafsir/tafsirCache';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
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

function getVerseKeyForSurah(verseKey: string | null, surahId: number): string | null {
  const parsed = parseVerseKeyNumbers(verseKey);
  if (!parsed || parsed.surahId !== surahId) return null;
  return verseKey;
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
    ...StyleSheet.absoluteFill,
  },
  translationPositioningHidden: {
    opacity: 0,
  },
  initialTranslationPreview: {
    ...StyleSheet.absoluteFill,
  },
  mushafEntryLayer: {
    overflow: 'hidden',
  },
  translationArrivalHighlight: {
    backgroundColor: 'rgba(31, 138, 125, 0.14)',
    borderRadius: 12,
  },
  transitionInteractionBlocker: {
    ...StyleSheet.absoluteFill,
    elevation: 1000,
    zIndex: 1000,
  },
});

function MushafMessageState({ message }: { message: string }): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
        {message}
      </Text>
    </View>
  );
}

const FALLBACK_MUSHAF_TOTAL_PAGES = 604;
const TRANSLATION_INITIAL_DRAW_BATCH_SIZE = 18;
const TRANSLATION_ANDROID_DRAW_DISTANCE = 3200;
const TRANSLATION_IOS_DRAW_DISTANCE = 2400;
const TRANSLATION_TARGET_PREFETCH_RADIUS = 72;

function getVerseLayoutBucket(verse: SurahVerse | undefined, showByWords: boolean): string {
  if (!verse) return 'placeholder';

  const arabicLength = (verse.text_uthmani ?? '').trim().length;
  const translationLength = (verse.translationItems ?? verse.translationTexts ?? []).reduce(
    (total, item) => total + String(typeof item === 'string' ? item : item.text ?? '').trim().length,
    0
  );
  const wordCount = Array.isArray(verse.words) ? verse.words.length : 0;
  const score = arabicLength * 1.8 + translationLength * 0.42 + (showByWords ? wordCount * 18 : 0);

  if (score < 140) return 'verse-xs';
  if (score < 260) return 'verse-sm';
  if (score < 420) return 'verse-md';
  if (score < 700) return 'verse-lg';
  return 'verse-xl';
}

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

function getRenderSignal(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function clampPageToRange(pageNumber: number, range: ChapterPageRange | null): number {
  if (!range) return 1;
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return range.firstPage;
  return Math.min(Math.max(Math.trunc(pageNumber), range.firstPage), range.lastPage);
}

function resolvePageIndexInList(pageNumber: number, pageNumbers: number[]): number {
  if (pageNumbers.length === 0) return 1;
  const normalizedPageNumber = Math.trunc(pageNumber);
  const exactIndex = pageNumbers.indexOf(normalizedPageNumber);
  if (exactIndex >= 0) return exactIndex + 1;

  const nextPageIndex = pageNumbers.findIndex((candidate) => candidate > normalizedPageNumber);
  if (nextPageIndex < 0) return pageNumbers.length;
  return Math.max(1, nextPageIndex);
}

export default function SurahScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    surahId?: string | string[];
    startVerse?: string | string[];
    startPage?: string | string[];
    view?: string | string[];
  }>();
  const router = useRouter();
  const { settings, isHydrated, setReadingMode } = useSettings();
  const { t } = useUiTranslation();
  const surahId = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;
  const startVerseParam = Array.isArray(params.startVerse) ? params.startVerse[0] : params.startVerse;
  const startPageParam = Array.isArray(params.startPage) ? params.startPage[0] : params.startPage;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const isMushafView = viewParam ? viewParam === 'mushaf' : settings.readingMode === 'mushaf';
  const startVerse = startVerseParam ? Number(startVerseParam) : NaN;
  const normalizedStartVerse = Number.isFinite(startVerse) && startVerse > 0 ? Math.floor(startVerse) : undefined;
  const startPage = startPageParam ? Number(startPageParam) : NaN;
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [pendingTranslationVerseKey, setPendingTranslationVerseKey] =
    React.useState<string | null>(null);
  const [translationHighlightVerseKey, setTranslationHighlightVerseKey] =
    React.useState<string | null>(null);
  const mushafOriginVerseKeyRef = React.useRef<string | null>(null);
  const activeMushafVerseKeyRef = React.useRef<string | null>(null);
  const translationModeSwitchRequestIdRef = React.useRef(0);
  const [isTransitionInteractionBlocked, setIsTransitionInteractionBlocked] =
    React.useState(false);
  const interactionBlockTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerSearch = useHeaderSearch({ preserveMushafView: isMushafView, replace: true });
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );

  React.useEffect(() => {
    if (isSettingsOpen) {
      headerSearch.close({ clearQuery: false });
    }
  }, [headerSearch.close, isSettingsOpen]);

  const [activeVerse, setActiveVerse] = React.useState<{
    verseKey: string;
    verseApiId?: number;
    arabicText: string;
    translationTexts: string[];
  } | null>(null);

  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const readerHeader = useCollapsibleReaderHeader();
  const { chapters } = useChapters();
  const audio = useAudioPlayer();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const listContentContainerStyle = React.useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: readerHeader.headerHeight + 16,
      paddingBottom: 24 + audioPlayerBarHeight,
    }),
    [audioPlayerBarHeight, readerHeader.headerHeight]
  );
  const listScrollViewOffset = React.useMemo(
    () => Math.max(0, readerHeader.headerHeight + 12),
    [readerHeader.headerHeight]
  );
  const nativeListScrollViewOffset = React.useMemo(
    () => -listScrollViewOffset,
    [listScrollViewOffset]
  );


  const { isPinned, setLastRead } = useBookmarks();
  const chapterNumber = surahId ? Number(surahId) : NaN;
  const verseAudioWordSync = useVerseAudioWordSync(chapterNumber);
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
  const shouldLoadVerseWords = Boolean(
    !isMushafView && (settings.showByWords || audio.isVisible)
  );

  React.useEffect(() => {
    readerHeader.resetHeader();
  }, [chapterNumber, isMushafView, readerHeader.resetHeader]);

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
    includeWords: shouldLoadVerseWords,
    includeWordTranslations: Boolean(!isMushafView && settings.showByWords),
    tajweed: Boolean(!isMushafView && settings.tajweed),
    tajweedTextColor: palette.text,
    tajweedTheme: resolvedTheme,
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
  const shouldShowSurahIntro = Boolean(resolvedChapter);
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
  const retainedMushafPageDataRef = React.useRef(initialMushafPageProbe.data);
  if (
    initialMushafPageProbe.data?.pack.packId === selectedMushafId &&
    initialMushafPageProbe.data.pack.version.trim() === selectedMushafVersion.trim() &&
    initialMushafPageProbe.data.pageNumber === initialMushafPageNumber
  ) {
    retainedMushafPageDataRef.current = initialMushafPageProbe.data;
  }
  const retainedMushafPageData =
    retainedMushafPageDataRef.current?.pack.packId === selectedMushafId &&
      retainedMushafPageDataRef.current.pack.version.trim() === selectedMushafVersion.trim() &&
      retainedMushafPageDataRef.current.pageNumber === initialMushafPageNumber
      ? retainedMushafPageDataRef.current
      : null;
  const availableInitialMushafPageData =
    initialMushafPageProbe.data ?? retainedMushafPageData;
  const resolvedMushafRenderer =
    availableInitialMushafPageData?.pack.renderer ?? selectedMushafOption?.renderer ?? 'text';
  const activeMushafVersion =
    availableInitialMushafPageData?.pack.version ?? selectedMushafVersion;
  const mushafTotalPages =
    availableInitialMushafPageData?.pack.totalPages ?? FALLBACK_MUSHAF_TOTAL_PAGES;
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
    const presentation = getSurahHeaderPresentation(resolvedChapter, t);
    return {
      chapterId: resolvedChapter.id,
      infoLabel: presentation.infoLabel,
      isMakkah: presentation.isMakkah,
      showBismillah: presentation.showBismillah,
      surahName: presentation.surahName,
    };
  }, [resolvedChapter, t]);
  const mushafReaderSessionKey = [
    chapterNumber,
    initialMushafPageNumber,
    mushafHighlightVerseKey ?? '',
    selectedMushafId,
    activeMushafVersion,
    settings.mushafScaleStep,
    resolvedTheme,
    Math.round(readerHeader.headerHeight),
  ].join(':');
  const [positionedMushafReaderKey, setPositionedMushafReaderKey] = React.useState<string | null>(
    null
  );
  const isMushafReaderPositioned = positionedMushafReaderKey === mushafReaderSessionKey;
  const handleMushafInitialPositioned = React.useCallback(() => {
    setPositionedMushafReaderKey(mushafReaderSessionKey);
  }, [mushafReaderSessionKey]);

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

  const openTranslationSettings = React.useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const closeSettingsSidebar = React.useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const blockReaderInteractionsDuringTransition = React.useCallback(() => {
    if (interactionBlockTimeoutRef.current) {
      clearTimeout(interactionBlockTimeoutRef.current);
    }
    setIsTransitionInteractionBlocked(true);
    interactionBlockTimeoutRef.current = setTimeout(() => {
      interactionBlockTimeoutRef.current = null;
      setIsTransitionInteractionBlocked(false);
    }, 500);
  }, []);

  React.useEffect(
    () => () => {
      if (interactionBlockTimeoutRef.current) {
        clearTimeout(interactionBlockTimeoutRef.current);
      }
    },
    []
  );

  const handleSettingsTabChange = React.useCallback(
    (nextTab: SettingsTab) => {
      blockReaderInteractionsDuringTransition();
      if (nextTab === 'translations') {
        const currentChapterNumber =
          Number.isFinite(chapterNumber) && chapterNumber > 0
            ? Math.trunc(chapterNumber)
            : null;
        const fallbackVerseKey =
          currentChapterNumber !== null
            ? `${currentChapterNumber}:${normalizedStartVerse ?? 1}`
            : null;
        const returnVerseKey =
          currentChapterNumber !== null
            ? getVerseKeyForSurah(activeMushafVerseKeyRef.current, currentChapterNumber) ??
              getVerseKeyForSurah(mushafOriginVerseKeyRef.current, currentChapterNumber) ??
              fallbackVerseKey
            : null;
        const parsedReturnVerseKey = parseVerseKeyNumbers(returnVerseKey);
        const returnVerseNumber = parsedReturnVerseKey?.verseNumber ?? 1;
        const returnSurahId = parsedReturnVerseKey?.surahId ?? currentChapterNumber;
        const requestId = ++translationModeSwitchRequestIdRef.current;
        closeSettingsSidebar();
        void (async () => {
          if (returnSurahId) {
            // Fire preload in background — don't block the mode switch.
            void preloadOfflineSurahNavigationPage({
              surahId: returnSurahId,
              verseNumber: returnVerseNumber,
              settings,
            });
          }

          if (translationModeSwitchRequestIdRef.current !== requestId) return;

          if (Platform.OS === 'web') {
            setPendingTranslationVerseKey(returnVerseKey);
          }
          router.setParams({
            view: 'translations',
            startVerse: String(returnVerseNumber),
          });
        })();
        return;
      }

      if (nextTab !== 'mushaf') return;

      const mushafRepository = container.getMushafPageRepository();
      const currentChapter = chapters.find((item) => item.id === chapterNumber);
      const pageRange = getChapterPageRange(currentChapter);
      const fallbackPage = pageRange?.firstPage ?? 1;
      const fallbackVerseNumber =
        typeof normalizedStartVerse === 'number' ? normalizedStartVerse : 1;
      const fallbackVerseKey =
        Number.isFinite(chapterNumber) && chapterNumber > 0
          ? `${Math.trunc(chapterNumber)}:${fallbackVerseNumber}`
          : null;
      const focusVerseKey =
        visibleVerseKeyRef.current ?? fallbackVerseKey;
      const focusVerseNumber = parseVerseKeyNumbers(focusVerseKey)?.verseNumber;
      mushafOriginVerseKeyRef.current = focusVerseKey;
      activeMushafVerseKeyRef.current = focusVerseKey;

      closeSettingsSidebar();
      void (async () => {
        let targetPage = fallbackPage;
        const [activePackVersion, resolvedPage] = await Promise.all([
          resolveActiveMushafVersion(selectedMushafId, selectedMushafVersion),
          focusVerseKey
            ? mushafRepository
              .findPageForVerse({
                packId: selectedMushafId,
                verseKey: focusVerseKey,
              })
              .catch(() => null)
            : Promise.resolve(null),
        ]);

        if (typeof resolvedPage === 'number' && resolvedPage > 0) {
          targetPage = pageRange ? clampPageToRange(resolvedPage, pageRange) : resolvedPage;
        }

        mushafRepository.setActivePageCacheIdentity({
          packId: selectedMushafId,
          version: activePackVersion,
        });

        router.setParams({
          view: 'mushaf',
          startPage: String(targetPage),
          ...(typeof focusVerseNumber === 'number' ? { startVerse: String(focusVerseNumber) } : {}),
        });

        void mushafRepository
          .prefetchPages({
            packId: selectedMushafId,
            pageNumbers: pageRange
              ? [targetPage - 1, targetPage, targetPage + 1].filter(
                (pageNumber) =>
                  pageNumber >= pageRange.firstPage && pageNumber <= pageRange.lastPage
              )
              : [targetPage - 1, targetPage, targetPage + 1],
            expectedVersion: activePackVersion,
          })
          .catch(() => {
            // The mounted reader reports local-pack errors; background warmup must not block entry.
          });
      })();
    },
    [
      chapterNumber,
      blockReaderInteractionsDuringTransition,
      chapters,
      closeSettingsSidebar,
      normalizedStartVerse,
      router,
      selectedMushafId,
      selectedMushafVersion,
      settings,
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
      tajweed: settings.tajweed,
      audioActiveVerseKey: audio.activeVerseKey,
      audioIsVisible: audio.isVisible,
      pagesSignature,
      translationHighlightVerseKey,
      verseAudioWordSync,
    }),
    [
      pagesSignature,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.tajweed,
      settings.translationFontSize,
      audio.activeVerseKey,
      audio.isVisible,
      translationHighlightVerseKey,
      verseAudioWordSync,
    ]
  );
  const tajweedRenderSignal = React.useMemo(
    () => getRenderSignal(`${settings.tajweed ? 'tajweed' : 'plain'}:${pagesSignature}`),
    [pagesSignature, settings.tajweed]
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
      void preloadOfflineTafsirWindow({
        surahId: surahNumber,
        ayahId: Number(ayah),
        tafsirIds,
        verseCount,
      });
    }
    router.push({ pathname: '/tafsir/[surahId]/[ayahId]', params: { surahId: surah, ayahId: ayah } });
  }, [
    activeVerse?.arabicText,
    activeVerse?.translationTexts,
    activeVerse?.verseKey,
    router,
    tafsirIds,
    translationIds,
    verseCount,
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

  const renderTranslationVerseCard = React.useCallback(
    (verse: SurahVerse, options?: { actionsEnabled?: boolean }) => {
      const actionsEnabled = options?.actionsEnabled ?? true;
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
        <View
          style={
            translationHighlightVerseKey === verse.verse_key
              ? styles.translationArrivalHighlight
              : undefined
          }
        >
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
            tajweed={settings.tajweed}
            tajweedGlyphRuns={verse.tajweedGlyphRuns}
            renderSignal={tajweedRenderSignal}
            onOpenActions={
              actionsEnabled
                ? () =>
                    openVerseActions({
                      verseKey: verse.verse_key,
                      verseApiId,
                      arabicText: verse.text_uthmani ?? '',
                      translationTexts,
                    })
                : undefined
            }
          />
        </View>
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
      settings.tajweed,
      settings.translationFontSize,
      tajweedRenderSignal,
      translationHighlightVerseKey,
      translationsById,
      verseAudioWordSync,
    ]
  );

  const renderVerseItem = React.useCallback(
    ({ item }: { item: number }) => {
      const verse = getVerseByNumber(item);
      if (!verse) {
        return <VerseCardPlaceholder verseKey={`${chapterNumber}:${item}`} />;
      }

      return renderTranslationVerseCard(verse);
    },
    [chapterNumber, getVerseByNumber, renderTranslationVerseCard]
  );

  const flatListRef = React.useRef<FlatList<number> | null>(null);
  const flashListRef = React.useRef<FlashListRef<number> | null>(null);
  const verseScrubberRef = React.useRef<VerseScrubberHandle | null>(null);
  const mushafReaderRef = React.useRef<MushafSingleDocumentReaderHandle | null>(null);
  const mushafPageScrubberRef = React.useRef<IndexScrubberHandle | null>(null);
  const visibleVerseKeyRef = React.useRef<string | null>(null);
  const lastPrefetchedMushafVerseRef = React.useRef<string | null>(null);
  const mushafPrefetchRequestIdRef = React.useRef(0);
  const didScrollToStartRef = React.useRef(false);
  const [scrollTick, bumpScrollTick] = React.useReducer((value) => value + 1, 0);
  const scrollRetryCountRef = React.useRef(0);
  const scrollRetryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPerformedTargetedProgrammaticScrollRef = React.useRef(false);
  const startVerseRef = React.useRef(startVerse);
  const [activeMushafPageNumber, setActiveMushafPageNumber] =
    React.useState(initialMushafPageNumber);
  const activeMushafPageNumberRef = React.useRef(initialMushafPageNumber);
  const isMushafPageScrubbingRef = React.useRef(false);
  const initialVerseScrollIndex = React.useMemo(() => {
    if (!Number.isFinite(startVerse) || startVerse <= 1 || verseCount <= 0) {
      return undefined;
    }

    return Math.max(0, Math.min(Math.floor(startVerse) - 1, verseCount - 1));
  }, [startVerse, verseCount]);
  const translationListKey = React.useMemo(
    () => `surah:${chapterNumber}`,
    [chapterNumber]
  );
  const translationListOverrideProps = React.useMemo(
    () => ({ initialDrawBatchSize: TRANSLATION_INITIAL_DRAW_BATCH_SIZE }),
    []
  );
  const translationMaintainVisibleContentPosition = React.useMemo(
    () => ({ disabled: true }),
    []
  );
  const translationInitialScrollIndexParams = React.useMemo(
    () =>
      typeof initialVerseScrollIndex === 'number'
        ? { viewOffset: nativeListScrollViewOffset }
        : undefined,
    [initialVerseScrollIndex, nativeListScrollViewOffset]
  );
  const [nativeListLoadTick, bumpNativeListLoadTick] = React.useReducer((value) => value + 1, 0);
  const isNativeListLoadedRef = React.useRef(Platform.OS === 'web');
  const targetedTranslationVerseNumber = React.useMemo(() => {
    if (isMushafView) return null;
    if (!Number.isFinite(startVerse) || startVerse <= 1) return null;
    if (verseCount <= 0) return null;
    return Math.max(1, Math.min(Math.floor(startVerse), verseCount));
  }, [isMushafView, startVerse, verseCount]);
  const targetedTranslationKey = React.useMemo(
    () =>
      targetedTranslationVerseNumber === null
        ? null
        : `${translationListKey}:${targetedTranslationVerseNumber}`,
    [targetedTranslationVerseNumber, translationListKey]
  );
  const targetedTranslationKeyRef = React.useRef<string | null>(targetedTranslationKey);
  const [positionedTranslationKey, setPositionedTranslationKey] = React.useState<string | null>(
    targetedTranslationKey === null ? 'none' : null
  );

  React.useEffect(() => {
    isNativeListLoadedRef.current = Platform.OS === 'web';
  }, [translationListKey]);

  React.useEffect(() => {
    targetedTranslationKeyRef.current = targetedTranslationKey;
    hasPerformedTargetedProgrammaticScrollRef.current = false;
    setPositionedTranslationKey(targetedTranslationKey === null ? 'none' : null);
  }, [targetedTranslationKey]);

  const markTargetedTranslationPositionReady = React.useCallback((targetKey: string | null) => {
    if (!targetKey) return;
    setPositionedTranslationKey((currentKey) =>
      currentKey === targetKey ? currentKey : targetKey
    );
  }, []);

  const handleNativeListLoad = React.useCallback(() => {
    isNativeListLoadedRef.current = true;
    bumpNativeListLoadTick();
  }, []);

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

  React.useEffect(() => {
    activeMushafPageNumberRef.current = initialMushafPageNumber;
    isMushafPageScrubbingRef.current = false;
    setActiveMushafPageNumber(initialMushafPageNumber);
  }, [initialMushafPageNumber, selectedMushafId]);

  const getVerseByNumberRef = React.useRef(getVerseByNumber);
  React.useEffect(() => {
    getVerseByNumberRef.current = getVerseByNumber;
  }, [getVerseByNumber]);

  const getTranslationItemType = React.useCallback(
    (item: number) => getVerseLayoutBucket(getVerseByNumberRef.current(item), settings.showByWords),
    [settings.showByWords]
  );

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
        const currentChapterNumber =
          Number.isFinite(chapterNumber) && chapterNumber > 0
            ? Math.trunc(chapterNumber)
            : null;
        const focusVerseKey =
          (currentChapterNumber !== null
            ? getVerseKeyForSurah(activeMushafVerseKeyRef.current, currentChapterNumber) ??
              getVerseKeyForSurah(mushafOriginVerseKeyRef.current, currentChapterNumber)
            : null) ??
          visibleVerseKeyRef.current ??
          (currentChapterNumber !== null
            ? typeof normalizedStartVerse === 'number'
              ? `${currentChapterNumber}:${normalizedStartVerse}`
              : `${currentChapterNumber}:1`
            : null);

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
    chapterNumber,
    isMushafView,
    isSettingsOpen,
    normalizedStartVerse,
    prefetchMushafForVerse,
    selectedMushafOption?.renderer,
  ]);

  React.useEffect(() => {
    if (!isSettingsOpen || !isMushafView || !isHydrated) return;
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;

    let cancelled = false;
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      prefetchTimeout = setTimeout(() => {
        if (cancelled) return;
        const currentChapterNumber = Math.trunc(chapterNumber);
        const focusVerseNumber =
          parseVerseKeyNumbers(
            getVerseKeyForSurah(activeMushafVerseKeyRef.current, currentChapterNumber)
          )?.verseNumber ??
          normalizedStartVerse ??
          1;
        void preloadOfflineSurahNavigationPage({
          surahId: currentChapterNumber,
          verseNumber: focusVerseNumber,
          settings,
        });
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
    chapterNumber,
    isHydrated,
    isMushafView,
    isSettingsOpen,
    normalizedStartVerse,
    settings,
  ]);

  const lastReadReportedRef = React.useRef<string | null>(null);
  const [visibleVerseNumber, setVisibleVerseNumber] = React.useState(
    normalizedStartVerse ?? 1
  );
  const visibleVerseNumberRef = React.useRef(normalizedStartVerse ?? 1);

  React.useEffect(() => {
    visibleVerseNumberRef.current = visibleVerseNumber;
  }, [visibleVerseNumber]);

  const [prevSurahId, setPrevSurahId] = React.useState(surahId);

  if (surahId !== prevSurahId) {
    setPrevSurahId(surahId);
    lastReadReportedRef.current = null;
    visibleVerseKeyRef.current = null;
    visibleVerseNumberRef.current = normalizedStartVerse ?? 1;
    setVisibleVerseNumber(normalizedStartVerse ?? 1);
  }

  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 60 }).current;
  const visibleRangeRef = React.useRef<{ first: number; last: number } | null>(null);
  const isVerseScrubbingRef = React.useRef(false);
  const lastScrubPrefetchVerseRef = React.useRef<number | null>(null);
  const lastScrubScrollVerseRef = React.useRef<number | null>(null);
  const scrubScrollInFlightRef = React.useRef(false);
  const scrubScrollRequestIdRef = React.useRef(0);
  const queuedScrubScrollVerseRef = React.useRef<number | null>(null);

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
        const verseNumber =
          typeof token.item === 'number'
            ? token.item
            : Number.parseInt(String(token.item ?? ''), 10);
        if (!Number.isFinite(verseNumber) || verseNumber <= 0) continue;

        const verseIndex = Math.trunc(verseNumber) - 1;
        firstVisibleIndex = Math.min(firstVisibleIndex, verseIndex);
        lastVisibleIndex = Math.max(lastVisibleIndex, verseIndex);

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
        if (targetIndex === visibleRange.first) {
          const activeTargetKey = targetedTranslationKeyRef.current;
          const shouldWaitForProgrammaticTargetScroll = Boolean(
            Platform.OS !== 'web' &&
              activeTargetKey &&
              !hasPerformedTargetedProgrammaticScrollRef.current
          );

          if (!shouldWaitForProgrammaticTargetScroll) {
            didScrollToStartRef.current = true;
            scrollRetryCountRef.current = 0;
            if (scrollRetryTimeoutRef.current) {
              clearTimeout(scrollRetryTimeoutRef.current);
              scrollRetryTimeoutRef.current = null;
            }
            markTargetedTranslationPositionReady(activeTargetKey);
          }
        }
      }

      if (!bestItem) return;

      visibleVerseKeyRef.current = bestItem.verse_key ?? null;

      const verseNumber = bestItem.verse_number;
      if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;
      visibleVerseNumberRef.current = verseNumber;

      if (isVerseScrubbingRef.current) return;

      setVisibleVerseNumber((currentVerseNumber) =>
        currentVerseNumber === verseNumber ? currentVerseNumber : verseNumber
      );

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
    };
  }, []);

  React.useEffect(() => {
    didScrollToStartRef.current = false;
    hasPerformedTargetedProgrammaticScrollRef.current = false;
    scrollRetryCountRef.current = 0;
    if (scrollRetryTimeoutRef.current) {
      clearTimeout(scrollRetryTimeoutRef.current);
      scrollRetryTimeoutRef.current = null;
    }
  }, [surahId, startVerseParam]);

  React.useEffect(() => {
    if (!Number.isFinite(startVerse) || startVerse <= 0) return;
    if (didScrollToStartRef.current) return;
    if (verseCountRef.current <= 0) return;

    // Verse 1 is already the natural list position.
    if (Math.floor(startVerse) === 1) {
      didScrollToStartRef.current = true;
      return;
    }

    if (Platform.OS !== 'web' && !isNativeListLoadedRef.current) {
      return;
    }

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

    const targetVerseNumber = Math.floor(startVerse);
    const targetIndex = Math.max(0, targetVerseNumber - 1);

    if (targetIndex >= verseCountRef.current) return;

    const verseCount = Math.max(1, verseCountRef.current);
    ensureVerseRangeLoadedRef.current(
      Math.max(1, targetVerseNumber - TRANSLATION_TARGET_PREFETCH_RADIUS),
      Math.min(verseCount, targetVerseNumber + TRANSLATION_TARGET_PREFETCH_RADIUS),
      1
    );

    if (!getVerseByNumberRef.current(targetVerseNumber) && scrollRetryCountRef.current < 6) {
      scheduleRetry();
      return;
    }

    const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
    if (!list) {
      scheduleRetry();
      return;
    }

    const scrollViewOffset =
      Platform.OS === 'web' ? listScrollViewOffset : nativeListScrollViewOffset;

    const completeProgrammaticScroll = () => {
      flashListRef.current?.recomputeViewableItems?.();

      const activeTargetKey = targetedTranslationKeyRef.current;
      const visibleRange = visibleRangeRef.current;
      const targetIsVisible = Boolean(
        visibleRange && targetIndex >= visibleRange.first && targetIndex <= visibleRange.last
      );

      if (targetIsVisible || scrollRetryCountRef.current >= 8) {
        didScrollToStartRef.current = true;
        scrollRetryCountRef.current = 0;
        if (scrollRetryTimeoutRef.current) {
          clearTimeout(scrollRetryTimeoutRef.current);
          scrollRetryTimeoutRef.current = null;
        }
        markTargetedTranslationPositionReady(activeTargetKey);
        return;
      }

      scheduleRetry();
    };

    try {
      hasPerformedTargetedProgrammaticScrollRef.current = true;
      const scrollResult = list.scrollToIndex({
        index: targetIndex,
        animated: false,
        viewPosition: 0.08,
        viewOffset: scrollViewOffset,
      });
      visibleVerseNumberRef.current = targetVerseNumber;
      setVisibleVerseNumber((currentVerseNumber) =>
        currentVerseNumber === targetVerseNumber ? currentVerseNumber : targetVerseNumber
      );
      if (scrollResult && typeof (scrollResult as Promise<void>).finally === 'function') {
        void (scrollResult as Promise<void>)
          .catch(() => {
            scheduleRetry();
          })
          .finally(() => {
            setTimeout(completeProgrammaticScroll, 60);
          });
      } else {
        setTimeout(completeProgrammaticScroll, 60);
      }
    } catch {
      scheduleRetry();
    }
  }, [
    listScrollViewOffset,
    markTargetedTranslationPositionReady,
    nativeListLoadTick,
    nativeListScrollViewOffset,
    scrollTick,
    startVerse,
    verseCount,
  ]);

  const handleScrubToVerse = React.useCallback(
    (verseNumber: number, options?: { isFinal?: boolean }) => {
      if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;
      const isFinal = Boolean(options?.isFinal);
      const targetVerseNumber = Math.max(
        1,
        Math.min(Math.trunc(verseNumber), Math.max(1, verseCountRef.current))
      );
      const targetIndex = targetVerseNumber - 1;

      if (
        !isFinal &&
        lastScrubScrollVerseRef.current === targetVerseNumber &&
        queuedScrubScrollVerseRef.current === null
      ) {
        return;
      }

      visibleVerseNumberRef.current = targetVerseNumber;
      if (isFinal) {
        setVisibleVerseNumber((currentVerseNumber) =>
          currentVerseNumber === targetVerseNumber ? currentVerseNumber : targetVerseNumber
        );
      }

      const shouldPrefetch =
        isFinal ||
        lastScrubPrefetchVerseRef.current === null ||
        Math.abs(targetVerseNumber - lastScrubPrefetchVerseRef.current) >= 12;

      if (shouldPrefetch) {
        lastScrubPrefetchVerseRef.current = targetVerseNumber;
        const verseCount = Math.max(1, verseCountRef.current);
        const prefetchRadius = isFinal ? 24 : 12;
        ensureVerseRangeLoadedRef.current(
          Math.max(1, targetVerseNumber - prefetchRadius),
          Math.min(verseCount, targetVerseNumber + prefetchRadius),
          isFinal ? 2 : 1
        );
      }

      const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
      if (!list) return;

      if (!isFinal && scrubScrollInFlightRef.current) {
        queuedScrubScrollVerseRef.current = targetVerseNumber;
        return;
      }

      queuedScrubScrollVerseRef.current = null;
      lastScrubScrollVerseRef.current = targetVerseNumber;

      try {
        const scrollResult = list.scrollToIndex({
          index: targetIndex,
          animated: false,
          viewPosition: 0,
          viewOffset: Platform.OS === 'web' ? listScrollViewOffset : nativeListScrollViewOffset,
        });
        if (scrollResult && typeof (scrollResult as Promise<void>).catch === 'function') {
          scrubScrollInFlightRef.current = true;
          const requestId = ++scrubScrollRequestIdRef.current;
          void (scrollResult as Promise<void>)
            .catch(() => {
              ensureVerseRangeLoadedRef.current(targetVerseNumber, targetVerseNumber, 2);
            })
            .finally(() => {
              if (requestId !== scrubScrollRequestIdRef.current) return;
              scrubScrollInFlightRef.current = false;
              const queuedVerseNumber = queuedScrubScrollVerseRef.current;
              queuedScrubScrollVerseRef.current = null;
              if (queuedVerseNumber !== null) {
                handleScrubToVerse(queuedVerseNumber);
              }
            });
        }
      } catch {
        ensureVerseRangeLoadedRef.current(targetVerseNumber, targetVerseNumber, 2);
      }
    },
    [listScrollViewOffset, nativeListScrollViewOffset]
  );

  React.useEffect(() => {
    if (isMushafView || !pendingTranslationVerseKey || !hasLoadedContent) return;
    const parsed = parseVerseKeyNumbers(pendingTranslationVerseKey);
    if (!parsed || parsed.surahId !== Math.trunc(chapterNumber)) {
      setPendingTranslationVerseKey(null);
      return;
    }

    ensureVerseRangeLoadedRef.current(parsed.verseNumber, parsed.verseNumber, 1);
    const scrollToTarget = () => handleScrubToVerse(parsed.verseNumber, { isFinal: true });
    scrollToTarget();
    setTranslationHighlightVerseKey(pendingTranslationVerseKey);
    const correctionTimeouts = [120, 360, 700].map((delay) =>
      setTimeout(scrollToTarget, delay)
    );
    const completionTimeout = setTimeout(() => setPendingTranslationVerseKey(null), 900);
    return () => {
      correctionTimeouts.forEach(clearTimeout);
      clearTimeout(completionTimeout);
    };
  }, [
    chapterNumber,
    handleScrubToVerse,
    hasLoadedContent,
    isMushafView,
    pendingTranslationVerseKey,
  ]);

  React.useEffect(() => {
    if (!translationHighlightVerseKey) return;
    const timeout = setTimeout(() => setTranslationHighlightVerseKey(null), 3500);
    return () => clearTimeout(timeout);
  }, [translationHighlightVerseKey]);

  const handleScrubStateChange = React.useCallback((isScrubbing: boolean) => {
    isVerseScrubbingRef.current = isScrubbing;
    if (!isScrubbing) {
      lastScrubPrefetchVerseRef.current = null;
      lastScrubScrollVerseRef.current = null;
      queuedScrubScrollVerseRef.current = null;
      scrubScrollInFlightRef.current = false;
      scrubScrollRequestIdRef.current += 1;
    }
  }, []);

  const handleSurahListScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    readerHeader.handleScroll(event);
    verseScrubberRef.current?.show();
  }, [readerHeader]);

  // No-op: native list load handler removed. Scroll-to-start is handled by
  // the unified useEffect above.

  const mushafPageScrubberIndex = React.useMemo(
    () => resolvePageIndexInList(activeMushafPageNumber, mushafSurahPageNumbers),
    [activeMushafPageNumber, mushafSurahPageNumbers]
  );

  const handleMushafActivePageChange = React.useCallback(
    (pageNumber: number) => {
      if (!Number.isFinite(pageNumber)) return;
      if (isMushafPageScrubbingRef.current) return;
      const normalizedPageNumber = clampPageToRange(pageNumber, mushafPageRange);
      activeMushafPageNumberRef.current = normalizedPageNumber;
      setActiveMushafPageNumber((currentPageNumber) =>
        currentPageNumber === normalizedPageNumber ? currentPageNumber : normalizedPageNumber
      );
    },
    [mushafPageRange]
  );

  const handleMushafActiveVerseChange = React.useCallback((verseKey: string) => {
    if (parseVerseKeyNumbers(verseKey)) {
      activeMushafVerseKeyRef.current = verseKey;
    }
  }, []);

  const handleMushafScrollActivity = React.useCallback((scrollY?: number) => {
    if (typeof scrollY === 'number') {
      readerHeader.handleScrollOffset(scrollY);
      mushafPageScrubberRef.current?.show();
      return;
    }
    mushafPageScrubberRef.current?.show();
  }, [readerHeader]);

  const handleMushafPageScrubStateChange = React.useCallback((isScrubbing: boolean) => {
    isMushafPageScrubbingRef.current = isScrubbing;
  }, []);

  const handleScrubToMushafPageIndex = React.useCallback(
    (pageIndex: number) => {
      if (!Number.isFinite(pageIndex) || mushafSurahPageNumbers.length === 0) return;
      const normalizedPageIndex = Math.max(
        1,
        Math.min(Math.trunc(pageIndex), mushafSurahPageNumbers.length)
      );
      const targetPageNumber = mushafSurahPageNumbers[normalizedPageIndex - 1];
      if (!targetPageNumber) return;

      activeMushafPageNumberRef.current = targetPageNumber;
      setActiveMushafPageNumber((currentPageNumber) =>
        currentPageNumber === targetPageNumber ? currentPageNumber : targetPageNumber
      );
      mushafReaderRef.current?.scrollToPage(targetPageNumber);
    },
    [mushafSurahPageNumbers]
  );

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

  React.useEffect(() => {
    if (!isHydrated) return;
    const currentMode = isMushafView ? 'mushaf' : 'translations';
    if (settings.readingMode !== currentMode) {
      setReadingMode(currentMode);
    }
  }, [isMushafView, isHydrated, settings.readingMode, setReadingMode]);

  if (!isHydrated && !viewParam) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark" style={{ backgroundColor: palette.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={palette.text} />
        </View>
      </View>
    );
  }

  const mushafSurfaceBackground = palette.background;
  const shouldWaitForMushafPosition =
    isMushafView &&
    isHydrated &&
    Boolean(mushafPageRange) &&
    resolvedMushafRenderer === 'webview' &&
    !initialMushafPageProbe.errorMessage;
  const isMushafSurfaceVisible =
    !shouldWaitForMushafPosition ||
    isMushafReaderPositioned ||
    (!hasLoadedContent && !availableInitialMushafPageData);
  const keepTranslationVisibleDuringMushafEntry =
    shouldWaitForMushafPosition && !isMushafReaderPositioned && hasLoadedContent;
  const shouldMountMushafSurface =
    isMushafView || Boolean(availableInitialMushafPageData);
  const shouldConcealTranslationPosition = Boolean(
    targetedTranslationKey &&
      positionedTranslationKey !== targetedTranslationKey &&
      !isMushafView &&
      verseCount > 0 &&
      !(offlineNotInstalled && !hasLoadedContent) &&
      !(errorMessage && !hasLoadedContent)
  );
  const initialTranslationPreviewVerse =
    targetedTranslationVerseNumber === null
      ? undefined
      : getVerseByNumber(targetedTranslationVerseNumber);

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ backgroundColor: palette.background }}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <ReaderOverlayHeader
        onLayout={readerHeader.handleHeaderLayout}
        pointerEvents={readerHeader.headerPointerEvents}
        style={readerHeader.headerAnimatedStyle}
      >
        <AppSearchHeader
          editable={readerHeader.headerPointerEvents !== 'none' && !isSettingsOpen}
          left={
            <HeaderActionButton accessibilityLabel="Go back" onPress={() => router.back()}>
              <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
            </HeaderActionButton>
          }
          inputRef={headerSearch.inputRef}
          value={headerSearch.query}
          onChangeText={headerSearch.updateQuery}
          placeholder="Search…"
          onFocus={() => {
            if (isSettingsOpen) return;
            readerHeader.showHeader();
            headerSearch.setIsOpen(true);
          }}
          onSubmitEditing={() => headerSearch.navigateToSearch()}
          right={
            <HeaderActionButton accessibilityLabel="Open settings" onPress={openTranslationSettings}>
              <Settings color={palette.text} size={22} strokeWidth={2.25} />
            </HeaderActionButton>
          }
        />
      </ReaderOverlayHeader>

      <View style={styles.contentStage}>
        {!isMushafView || keepTranslationVisibleDuringMushafEntry ? (
          <View
            style={[
              styles.contentLayer,
              shouldConcealTranslationPosition ? styles.translationPositioningHidden : null,
            ]}
            pointerEvents={isMushafView || shouldConcealTranslationPosition ? 'none' : 'auto'}
          >
            {!hasLoadedContent && offlineNotInstalled ? (
              <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
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
              <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
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
            ) : verseCount <= 0 ? (
              <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
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
                onScroll={handleSurahListScroll}
                scrollEventThrottle={16}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  shouldShowSurahIntro && resolvedChapter
                    ? <SurahHeaderCard chapter={resolvedChapter} />
                    : null
                }
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
                key={translationListKey}
                ref={(node) => {
                  flashListRef.current = node;
                }}
                data={verseNumbers}
                keyExtractor={(item) => `${chapterNumber}:${item}`}
                extraData={listExtraData}
                renderItem={renderVerseItem}
                getItemType={getTranslationItemType}
                initialScrollIndex={initialVerseScrollIndex}
                initialScrollIndexParams={translationInitialScrollIndexParams}
                maintainVisibleContentPosition={translationMaintainVisibleContentPosition}
                drawDistance={Platform.OS === 'android' ? TRANSLATION_ANDROID_DRAW_DISTANCE : TRANSLATION_IOS_DRAW_DISTANCE}
                overrideProps={translationListOverrideProps}
                contentContainerStyle={listContentContainerStyle}
                refreshing={isRefreshing}
                onRefresh={refresh}
                onLoad={handleNativeListLoad}
                onScroll={handleSurahListScroll}
                scrollEventThrottle={16}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  shouldShowSurahIntro && resolvedChapter
                    ? <SurahHeaderCard chapter={resolvedChapter} />
                    : null
                }
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
            {hasLoadedContent && verseCount > 1 ? (
              <VerseScrubber
                ref={verseScrubberRef}
                bottomInset={audioPlayerBarHeight}
                currentVerseNumber={visibleVerseNumber}
                onScrubStateChange={handleScrubStateChange}
                onScrubToVerse={handleScrubToVerse}
                topInset={0}
                verseCount={verseCount}
              />
            ) : null}
          </View>
        ) : null}

        {shouldConcealTranslationPosition ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
              styles.initialTranslationPreview,
              {
                backgroundColor: palette.background,
                paddingHorizontal: 16,
                paddingTop: readerHeader.headerHeight + 16,
                paddingBottom: 24 + audioPlayerBarHeight,
              },
            ]}
          >
            {initialTranslationPreviewVerse ? (
              renderTranslationVerseCard(initialTranslationPreviewVerse, { actionsEnabled: false })
            ) : (
              <VerseCardPlaceholder
                verseKey={`${chapterNumber}:${targetedTranslationVerseNumber ?? 1}`}
              />
            )}
          </View>
        ) : null}

        {shouldMountMushafSurface ? (
          <View
            pointerEvents={isMushafView && isMushafSurfaceVisible ? 'auto' : 'none'}
            style={[
              styles.contentLayer,
              styles.mushafEntryLayer,
              { backgroundColor: mushafSurfaceBackground },
              { opacity: isMushafView && isMushafSurfaceVisible ? 1 : 0 },
            ]}
          >
            {!isHydrated ? null : !mushafPageRange ? (
              <MushafMessageState message="No mushaf pages found for this surah." />
            ) : resolvedMushafRenderer !== 'webview' ? (
              <MushafMessageState
                message="Select an installed exact mushaf pack to use this surah Mushaf view."
              />
            ) : initialMushafPageProbe.errorMessage ? (
              <MushafMessageState message={initialMushafPageProbe.errorMessage} />
            ) : (
              <MushafSingleDocumentReader
                ref={mushafReaderRef}
                backgroundPageNumbers={mushafInitialWindowPageNumbers}
                chapterNamesById={chapterNamesById}
                compactPageLines
                expectedVersion={activeMushafVersion}
                filterChapterId={Math.trunc(chapterNumber)}
                focusTopInsetPx={readerHeader.headerHeight + 12}
                highlightVerseKey={mushafHighlightVerseKey}
                initialPageData={availableInitialMushafPageData}
                initialPageNumber={initialMushafPageNumber}
                mushafScaleStep={settings.mushafScaleStep}
                onActivePageChange={handleMushafActivePageChange}
                onActiveVerseChange={handleMushafActiveVerseChange}
                onInitialPositioned={handleMushafInitialPositioned}
                onScrollActivity={handleMushafScrollActivity}
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
            {isHydrated &&
              resolvedMushafRenderer === 'webview' &&
              !initialMushafPageProbe.errorMessage &&
              mushafSurahPageNumbers.length > 1 ? (
              <IndexScrubber
                ref={mushafPageScrubberRef}
                bottomInset={audioPlayerBarHeight}
                currentIndex={mushafPageScrubberIndex}
                itemCount={mushafSurahPageNumbers.length}
                topInset={0}
                formatLabel={(pageIndex) => {
                  const pageNumber =
                    mushafSurahPageNumbers[Math.max(0, pageIndex - 1)] ?? activeMushafPageNumber;
                  return `Page ${pageNumber}/${mushafTotalPages}`;
                }}
                onScrubStateChange={handleMushafPageScrubStateChange}
                onScrubToIndex={handleScrubToMushafPageIndex}
              />
            ) : null}
          </View>
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
        isOpen={headerSearch.isOpen && !isSettingsOpen}
        query={headerSearch.query}
        onQueryChange={headerSearch.updateQuery}
        onClose={() => headerSearch.close({ clearQuery: false })}
        onNavigateToSurahVerse={headerSearch.navigateToSurahVerse}
        onNavigateToJuz={headerSearch.navigateToJuz}
        onNavigateToPage={headerSearch.navigateToPage}
        onNavigateToSearch={headerSearch.navigateToSearch}
        topInset={readerHeader.headerHeight}
      />
      {isTransitionInteractionBlocked ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="auto"
          style={styles.transitionInteractionBlocker}
        />
      ) : null}
      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={closeSettingsSidebar}
        activeTab={isMushafView ? 'mushaf' : 'translations'}
        onTabChange={handleSettingsTabChange}
      />
    </View>
  );
}
