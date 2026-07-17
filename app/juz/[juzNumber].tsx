import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
} from 'react-native';

import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { AppSearchHeader, ReaderOverlayHeader } from '@/components/navigation/AppHeader';
import { useCollapsibleReaderHeader } from '@/components/navigation/useCollapsibleReaderHeader';
import { useHeaderSearch } from '@/components/navigation/useHeaderSearch';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import {
  MushafSingleDocumentReader,
  type MushafSingleDocumentReaderHandle,
  type MushafSingleDocumentVersePress,
} from '@/components/mushaf/MushafSingleDocumentReader';
import type { MushafSelectionPayload } from '@/components/mushaf/mushafWordPayload';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import type { SettingsTab } from '@/components/reader/settings/SettingsTabToggle';
import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { BismillahDisplay } from '@/components/surah/BismillahDisplay';
import { VerseScrubber, type VerseScrubberHandle } from '@/components/surah/VerseScrubber';
import { useVerseAudioWordSync } from '@/components/surah/useVerseAudioWordSync';
import { ReaderWordStudySheet } from '@/components/word-study/ReaderWordStudySheet';
import { normalizeWordStudyPressEvent } from '@/components/word-study/WordStudyPressEvent';
import { useWordQuickSheetController } from '@/components/word-study/useWordQuickSheetController';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { useJuzVerses, getJuzVerseKeys } from '@/hooks/useJuzVerses';
import { getOfflineJuzCached } from '@/lib/juz/offlineJuzPageCache';
import { preloadOfflineTafsirWindow } from '@/lib/tafsir/tafsirCache';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { container } from '@/src/core/infrastructure/di/container';
import juzData from '../../src/data/juz.json';

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

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function JuzHeaderCard({ juzNumber, surahRange }: { juzNumber: number; surahRange: string }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const isDark = resolvedTheme === 'dark';
  const bgColor = isDark ? '#182333' : '#FFFFFF';

  return (
    <View
      className="mb-4 flex-row items-center justify-between px-4 py-3"
      style={[
        cardShadow,
        {
          borderRadius: 12,
          borderWidth: 0,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text className="text-base font-bold text-content-primary dark:text-content-primary-dark">
        Juz {juzNumber}
      </Text>
      {surahRange ? (
        <View className="rounded-full bg-accent/10 px-3 py-1">
          <Text className="text-xs font-semibold text-accent dark:text-accent-dark">
            {surahRange}
          </Text>
        </View>
      ) : null}
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

const INITIAL_PLACEHOLDER_VERSE_KEYS = ['1:1', '1:2', '1:3', '1:4'];
const FALLBACK_MUSHAF_TOTAL_PAGES = 604;

function getJuzPageRange(juzNumber: number): { firstPage: number; lastPage: number } {
  const JUZ_PAGES: Record<number, { firstPage: number; lastPage: number }> = {
    1: { firstPage: 1, lastPage: 21 },
    2: { firstPage: 22, lastPage: 41 },
    3: { firstPage: 42, lastPage: 61 },
    4: { firstPage: 62, lastPage: 81 },
    5: { firstPage: 82, lastPage: 101 },
    6: { firstPage: 102, lastPage: 121 },
    7: { firstPage: 122, lastPage: 141 },
    8: { firstPage: 142, lastPage: 161 },
    9: { firstPage: 162, lastPage: 181 },
    10: { firstPage: 182, lastPage: 201 },
    11: { firstPage: 202, lastPage: 221 },
    12: { firstPage: 222, lastPage: 241 },
    13: { firstPage: 242, lastPage: 261 },
    14: { firstPage: 262, lastPage: 281 },
    15: { firstPage: 282, lastPage: 301 },
    16: { firstPage: 302, lastPage: 321 },
    17: { firstPage: 322, lastPage: 341 },
    18: { firstPage: 342, lastPage: 361 },
    19: { firstPage: 362, lastPage: 381 },
    20: { firstPage: 382, lastPage: 401 },
    21: { firstPage: 402, lastPage: 421 },
    22: { firstPage: 422, lastPage: 441 },
    23: { firstPage: 442, lastPage: 461 },
    24: { firstPage: 462, lastPage: 481 },
    25: { firstPage: 482, lastPage: 501 },
    26: { firstPage: 502, lastPage: 521 },
    27: { firstPage: 522, lastPage: 541 },
    28: { firstPage: 542, lastPage: 561 },
    29: { firstPage: 562, lastPage: 581 },
    30: { firstPage: 582, lastPage: 604 },
  };

  return JUZ_PAGES[juzNumber] || { firstPage: 1, lastPage: 604 };
}

function buildPageRangeNumbers(range: { firstPage: number; lastPage: number }): number[] {
  const pageNumbers: number[] = [];
  for (let page = range.firstPage; page <= range.lastPage; page += 1) {
    pageNumbers.push(page);
  }
  return pageNumbers;
}

export default function JuzScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    juzNumber?: string | string[];
    startVerse?: string | string[];
    startPage?: string | string[];
    view?: string | string[];
  }>();
  const router = useRouter();
  const { settings, isHydrated, setReadingMode } = useSettings();
  const juzNumberParam = Array.isArray(params.juzNumber) ? params.juzNumber[0] : params.juzNumber;
  const startVerseParam = Array.isArray(params.startVerse) ? params.startVerse[0] : params.startVerse;
  const startPageParam = Array.isArray(params.startPage) ? params.startPage[0] : params.startPage;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;

  const juzNumber = juzNumberParam ? Number(juzNumberParam) : 1;
  const isMushafView = viewParam ? viewParam === 'mushaf' : settings.readingMode === 'mushaf';
  const startVerse = startVerseParam ? Number(startVerseParam) : NaN;
  const startPage = startPageParam ? Number(startPageParam) : NaN;

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [pendingTranslationVerseKey, setPendingTranslationVerseKey] =
    React.useState<string | null>(null);
  const [translationHighlightVerseKey, setTranslationHighlightVerseKey] =
    React.useState<string | null>(null);
  const mushafOriginVerseKeyRef = React.useRef<string | null>(null);
  const activeMushafVerseKeyRef = React.useRef<string | null>(null);
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

  const currentJuzData = React.useMemo(() => (juzData as any[]).find((j: any) => j.number === juzNumber), [juzNumber]);
  const surahRange = currentJuzData?.surahRange || '';

  const verseKeys = React.useMemo(() => getJuzVerseKeys(juzNumber, chapters), [juzNumber, chapters]);

  // Audio word sync is bounded by current chapter inside player
  const activeChapterNumber = React.useMemo(() => {
    if (audio.activeVerseKey) {
      const parsed = parseVerseKeyNumbers(audio.activeVerseKey);
      return parsed?.surahId ?? 1;
    }
    return currentJuzData?.startSurahId ?? 1;
  }, [audio.activeVerseKey, currentJuzData]);
  const verseAudioWordSync = useVerseAudioWordSync(activeChapterNumber);
  const wordQuickSheet = useWordQuickSheetController();

  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
  const selectedMushafOption = findMushafOption(selectedMushafId);
  const selectedMushafVersion = selectedMushafOption?.version ?? 'unknown';

  const translationIds = React.useMemo(() => {
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

  React.useEffect(() => {
    readerHeader.resetHeader();
  }, [juzNumber, isMushafView, readerHeader.resetHeader]);

  const { translationsById } = useTranslationResources({
    enabled: showTranslationAttribution,
    language: settings.contentLanguage,
  });

  const {
    verseCount,
    pagesSignature,
    hasLoadedContent,
    getVerseByKey,
    ensureVerseRangeLoaded,
    isLoading,
    isRefreshing,
    isLoadingMore,
    errorMessage,
    offlineNotInstalled,
    refresh,
    retry,
    loadMore,
  } = useJuzVerses({
    juzNumber,
    translationIds: verseTranslationIds,
    wordLang: settings.wordLang,
    enabled: !isMushafView,
  });

  const mushafPageRange = React.useMemo(() => getJuzPageRange(juzNumber), [juzNumber]);
  const requestedMushafPage = Number.isFinite(startPage) && startPage > 0 ? Math.floor(startPage) : NaN;
  const initialMushafPageNumber = React.useMemo(
    () => {
      if (Number.isFinite(requestedMushafPage)) {
        return Math.min(Math.max(requestedMushafPage, mushafPageRange.firstPage), mushafPageRange.lastPage);
      }
      return mushafPageRange.firstPage;
    },
    [mushafPageRange, requestedMushafPage]
  );

  const mushafSurahPageNumbers = React.useMemo(
    () => buildPageRangeNumbers(mushafPageRange),
    [mushafPageRange]
  );

  const mushafInitialWindowPageNumbers = React.useMemo(() => {
    const allowed = new Set(mushafSurahPageNumbers);
    const pages: number[] = [];
    for (
      let pageNumber = initialMushafPageNumber - 2;
      pageNumber <= initialMushafPageNumber + 2;
      pageNumber += 1
    ) {
      if (allowed.has(pageNumber)) {
        pages.push(pageNumber);
      }
    }
    return pages;
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

  const [activeMushafPageNumber, setActiveMushafPageNumber] = React.useState(initialMushafPageNumber);
  const activeMushafPageNumberRef = React.useRef(initialMushafPageNumber);
  const isMushafPageScrubbingRef = React.useRef(false);

  const chapterNamesById = React.useMemo(
    () => new Map(chapters.map((item) => [item.id, item.name_simple] as const)),
    [chapters]
  );

  const [visibleVerseNumber, setVisibleVerseNumber] = React.useState(1);
  const visibleVerseNumberRef = React.useRef(visibleVerseNumber);
  const isVerseScrubbingRef = React.useRef(false);
  const lastScrubPrefetchVerseRef = React.useRef<number | null>(null);
  const lastScrubScrollVerseRef = React.useRef<number | null>(null);
  const queuedScrubScrollVerseRef = React.useRef<number | null>(null);
  const scrubScrollInFlightRef = React.useRef(false);
  const scrubScrollRequestIdRef = React.useRef(0);

  const flashListRef = React.useRef<FlashListRef<string> | null>(null);
  const flatListRef = React.useRef<FlatList<string> | null>(null);
  const mushafReaderRef = React.useRef<MushafSingleDocumentReaderHandle | null>(null);
  const mushafSelectionMetadataRef = React.useRef<MushafSelectionPayload | null>(null);
  const verseScrubberRef = React.useRef<VerseScrubberHandle | null>(null);
  const mushafPageScrubberRef = React.useRef<any>(null);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 30,
    minimumViewTime: 50,
  }).current;

  const visibleVerseKeyRef = React.useRef<string | null>(null);
  const onViewableItemsChanged = React.useRef(
    (info: { viewableItems: Array<{ item: string; index: number | null }> }) => {
      const first = info.viewableItems[0];
      if (first && first.index !== null) {
        visibleVerseKeyRef.current = first.item;
        const verseIdx = first.index + 1;
        if (!isVerseScrubbingRef.current && !scrubScrollInFlightRef.current) {
          setVisibleVerseNumber(verseIdx);
          visibleVerseNumberRef.current = verseIdx;
        }

        // Preload next segment if user approaches the end
        const threshold = 15;
        if (verseIdx + threshold >= verseKeys.length) {
          loadMore();
        }

        const parsed = parseVerseKeyNumbers(first.item);
        if (parsed) {
          const verseObj = getVerseByKey(first.item);
          setLastRead(
            String(parsed.surahId),
            parsed.verseNumber,
            first.item,
            verseObj?.id
          );
        }
      }
    }
  ).current;

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

  const handleMushafSelectionChange = React.useCallback((payload: MushafSelectionPayload) => {
    mushafSelectionMetadataRef.current = payload.isCollapsed ? null : payload;
  }, []);

  const handleMushafVersePress = React.useCallback(
    (verse: MushafSingleDocumentVersePress) => {
      if (mushafSelectionMetadataRef.current && !mushafSelectionMetadataRef.current.isCollapsed) {
        return;
      }

      if (Platform.OS === 'android') {
        const event = normalizeWordStudyPressEvent({
          verseKey: verse.verseKey,
          wordPosition: verse.wordPosition,
          surfaceText: verse.surfaceText,
          source: 'mushaf',
        });
        if (event) wordQuickSheet.open(event);
        return;
      }

      openVerseActions({
        verseKey: verse.verseKey,
        verseApiId: verse.verseApiId,
        arabicText: verse.arabicText,
        translationTexts: verse.translationTexts,
      });
    },
    [openVerseActions, wordQuickSheet.open]
  );

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
        const returnVerseKey =
          activeMushafVerseKeyRef.current ??
          mushafOriginVerseKeyRef.current ??
          verseKeys[0] ??
          null;
        setPendingTranslationVerseKey(returnVerseKey);
        closeSettingsSidebar();
        router.setParams({ view: 'translations' });
        return;
      }

      if (nextTab !== 'mushaf') return;

      const mushafRepository = container.getMushafPageRepository();
      const fallbackPage = mushafPageRange.firstPage;
      const focusVerseKey =
        visibleVerseKeyRef.current ?? verseKeys[0] ?? null;
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
          targetPage = Math.min(
            Math.max(resolvedPage, mushafPageRange.firstPage),
            mushafPageRange.lastPage
          );
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
            pageNumbers: [targetPage - 1, targetPage, targetPage + 1].filter(
              (pageNumber) =>
                pageNumber >= mushafPageRange.firstPage &&
                pageNumber <= mushafPageRange.lastPage
            ),
            expectedVersion: activePackVersion,
          })
          .catch(() => {
            // The mounted reader reports local-pack errors; background warmup must not block entry.
          });
      })();
    },
    [
      closeSettingsSidebar,
      blockReaderInteractionsDuringTransition,
      verseKeys,
      mushafPageRange,
      router,
      selectedMushafId,
      selectedMushafVersion,
    ]
  );

  React.useEffect(() => {
    if (!isSettingsOpen || !isHydrated) return;

    let cancelled = false;
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      prefetchTimeout = setTimeout(() => {
        if (cancelled) return;

        if (isMushafView) {
          void getOfflineJuzCached({
            juzId: juzNumber,
            translationIds,
            wordLang: settings.wordLang,
            expectedVerseCount: verseKeys.length,
          }).catch(() => {
            // The translation reader will report unavailable offline content after the switch.
          });
          return;
        }

        if (selectedMushafOption?.renderer !== 'webview') return;
        const focusVerseKey = visibleVerseKeyRef.current ?? verseKeys[0] ?? null;
        if (!focusVerseKey) return;

        const mushafRepository = container.getMushafPageRepository();
        void Promise.all([
          resolveActiveMushafVersion(selectedMushafId, selectedMushafVersion),
          mushafRepository.findPageForVerse({
            packId: selectedMushafId,
            verseKey: focusVerseKey,
          }),
        ])
          .then(([activePackVersion, resolvedPage]) => {
            if (!resolvedPage) return;
            const targetPage = Math.min(
              Math.max(resolvedPage, mushafPageRange.firstPage),
              mushafPageRange.lastPage
            );
            mushafRepository.setActivePageCacheIdentity({
              packId: selectedMushafId,
              version: activePackVersion,
            });
            return mushafRepository.prefetchPages({
              packId: selectedMushafId,
              pageNumbers: [targetPage - 1, targetPage, targetPage + 1].filter(
                (pageNumber) =>
                  pageNumber >= mushafPageRange.firstPage &&
                  pageNumber <= mushafPageRange.lastPage
              ),
              expectedVersion: activePackVersion,
            });
          })
          .catch(() => {
            // The Mushaf reader will report missing local-pack content after the switch.
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
    isHydrated,
    isMushafView,
    isSettingsOpen,
    juzNumber,
    mushafPageRange,
    selectedMushafId,
    selectedMushafOption?.renderer,
    selectedMushafVersion,
    settings.wordLang,
    translationIds,
    verseKeys,
  ]);

  const handleMushafJuzNavigation = React.useCallback(
    (direction: 'next' | 'previous') => {
      const nextJuz = direction === 'next' ? juzNumber + 1 : juzNumber - 1;
      if (nextJuz >= 1 && nextJuz <= 30) {
        setIsVerseActionsOpen(false);
        setIsSettingsOpen(false);
        router.replace({
          pathname: '/juz/[juzNumber]',
          params: {
            juzNumber: String(nextJuz),
            view: 'mushaf',
            startVerse: '1',
            startPage: String(getJuzPageRange(nextJuz).firstPage),
          },
        });
      }
    },
    [juzNumber, router]
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
      translationHighlightVerseKey,
      verseAudioWordSync,
      wordStudyEvent: wordQuickSheet.event,
    }),
    [
      pagesSignature,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.translationFontSize,
      audio.activeVerseKey,
      audio.isVisible,
      translationHighlightVerseKey,
      verseAudioWordSync,
      wordQuickSheet.event,
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
      const chapterVerseCount =
        chapters.find((chapter) => chapter.id === surahNumber)?.verses_count;
      void preloadOfflineTafsirWindow({
        surahId: surahNumber,
        ayahId: Number(ayah),
        tafsirIds,
        verseCount: chapterVerseCount,
      });
    }
    router.push({ pathname: '/tafsir/[surahId]/[ayahId]', params: { surahId: surah, ayahId: ayah } });
  }, [
    activeVerse?.arabicText,
    activeVerse?.translationTexts,
    activeVerse?.verseKey,
    chapters,
    router,
    tafsirIds,
    translationIds,
  ]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const parsed = parseVerseKeyNumbers(verseKey);
    setPlannerVerseSummary({
      verseKey,
      ...(parsed ? { surahId: parsed.surahId } : {}),
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse?.arabicText, activeVerse?.translationTexts, activeVerse?.verseKey]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const parsed = parseVerseKeyNumbers(activeVerse.verseKey);
    const surahName = parsed ? (chapterNamesById.get(parsed.surahId) ?? '') : '';
    const title = surahName ? `${surahName} ${activeVerse.verseKey}` : activeVerse.verseKey;
    const lines = [
      title,
      '',
      activeVerse.arabicText,
      '',
      ...(activeVerse.translationTexts?.length ? [activeVerse.translationTexts[0]!] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore
    }
  }, [activeVerse, chapterNamesById]);

  const handleScrubToVerse = React.useCallback(
    (targetVerseNumber: number, options?: { isFinal?: boolean }) => {
      const isFinal = Boolean(options?.isFinal);
      const targetIndex = Math.min(Math.max(targetVerseNumber - 1, 0), verseKeys.length - 1);

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
        ensureVerseRangeLoaded(
          Math.max(0, targetIndex - 12),
          Math.min(verseKeys.length - 1, targetIndex + 12)
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
              ensureVerseRangeLoaded(targetIndex, targetIndex);
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
        ensureVerseRangeLoaded(targetIndex, targetIndex);
      }
    },
    [ensureVerseRangeLoaded, listScrollViewOffset, nativeListScrollViewOffset, verseKeys]
  );

  React.useEffect(() => {
    if (isMushafView || !pendingTranslationVerseKey || !hasLoadedContent) return;
    const targetIndex = verseKeys.indexOf(pendingTranslationVerseKey);
    if (targetIndex < 0) {
      setPendingTranslationVerseKey(null);
      return;
    }

    ensureVerseRangeLoaded(targetIndex, targetIndex);
    const scrollToTarget = () => handleScrubToVerse(targetIndex + 1, { isFinal: true });
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
    ensureVerseRangeLoaded,
    handleScrubToVerse,
    hasLoadedContent,
    isMushafView,
    pendingTranslationVerseKey,
    verseKeys,
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

  const handleMushafActivePageChange = React.useCallback(
    (pageNumber: number) => {
      if (!Number.isFinite(pageNumber)) return;
      if (isMushafPageScrubbingRef.current) return;
      const normalizedPageNumber = Math.min(
        Math.max(pageNumber, mushafPageRange.firstPage),
        mushafPageRange.lastPage
      );
      activeMushafPageNumberRef.current = normalizedPageNumber;
      setActiveMushafPageNumber(normalizedPageNumber);
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
      setActiveMushafPageNumber(targetPageNumber);
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

    const parsed = parseVerseKeyNumbers(activeVerse.verseKey);
    const surahName = parsed ? (chapterNamesById.get(parsed.surahId) ?? '') : '';

    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof verseApiId === 'number' ? { verseApiId } : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(surahName ? { surahName } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse, chapterNamesById]);

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

  const renderVerseItem = React.useCallback(
    ({ item }: { item: string }) => {
      const verse = getVerseByKey(item);
      if (!verse) {
        return <VerseCardPlaceholder verseKey={item} />;
      }

      const parsed = parseVerseKeyNumbers(item);
      const showTranslation = verse.translationItems.length > 0;
      const showBismillah = parsed?.verseNumber === 1 && parsed.surahId !== 9 && parsed.surahId !== 1;
      const surahName = parsed ? chapterNamesById.get(parsed.surahId) : undefined;

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

      return (
        <View
          style={
            translationHighlightVerseKey === verse.verse_key
              ? styles.translationArrivalHighlight
              : undefined
          }
        >
          {parsed?.verseNumber === 1 ? (
            <View className="mb-4 mt-6 items-center">
              <View className="rounded-full bg-surface-navigation px-4 py-1.5 dark:bg-surface-navigation-dark">
                <Text className="text-xs font-bold text-accent dark:text-accent-dark">
                  {surahName ?? `Surah ${parsed.surahId}`}
                </Text>
              </View>
              {showBismillah ? (
                <BismillahDisplay />
              ) : null}
            </View>
          ) : null}
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
            onWordStudyPress={Platform.OS === 'android' ? wordQuickSheet.open : undefined}
            selectedStudyWordPosition={
              wordQuickSheet.isOpen && wordQuickSheet.event?.verseKey === verse.verse_key
                ? wordQuickSheet.event.wordPosition
                : undefined
            }
            onOpenActions={() =>
              openVerseActions({
                verseKey: verse.verse_key,
                verseApiId: verse.id,
                arabicText: verse.text_uthmani ?? '',
                translationTexts,
              })
            }
          />
        </View>
      );
    },
    [
      getVerseByKey,
      chapterNamesById,
      settings,
      showTranslationAttribution,
      translationsById,
      audio,
      verseAudioWordSync,
      wordQuickSheet.event,
      wordQuickSheet.isOpen,
      wordQuickSheet.open,
      handlePlayPause,
      openVerseActions,
      translationHighlightVerseKey,
    ]
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isHydrated) return;
      const currentMode = isMushafView ? 'mushaf' : 'translations';
      if (settings.readingMode !== currentMode) {
        setReadingMode(currentMode);
      }
    }, [isMushafView, isHydrated, settings.readingMode, setReadingMode])
  );

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

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
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
        {!isMushafView ? (
          <View style={styles.contentLayer} pointerEvents="auto">
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
            ) : !hasLoadedContent && verseKeys.length > 0 ? (
              <FlatList
                data={INITIAL_PLACEHOLDER_VERSE_KEYS}
                keyExtractor={(item) => `placeholder:${juzNumber}:${item}`}
                renderItem={({ item }) => (
                  <VerseCardPlaceholder verseKey={item} />
                )}
                contentContainerStyle={listContentContainerStyle}
                ListHeaderComponent={<JuzHeaderCard juzNumber={juzNumber} surahRange={surahRange} />}
                scrollEnabled={false}
              />
            ) : verseKeys.length <= 0 ? (
              <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
                <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
                  No verses found for this Juz.
                </Text>
              </View>
            ) : Platform.OS === 'web' ? (
              <FlatList
                ref={(node) => {
                  flatListRef.current = node;
                }}
                data={verseKeys}
                keyExtractor={(item) => item}
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
                ListHeaderComponent={<JuzHeaderCard juzNumber={juzNumber} surahRange={surahRange} />}
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
                data={verseKeys}
                keyExtractor={(item) => item}
                extraData={listExtraData}
                renderItem={renderVerseItem}
                drawDistance={Platform.OS === 'android' ? 1200 : 800}
                contentContainerStyle={listContentContainerStyle}
                refreshing={isRefreshing}
                onRefresh={refresh}
                onScroll={handleSurahListScroll}
                scrollEventThrottle={16}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={<JuzHeaderCard juzNumber={juzNumber} surahRange={surahRange} />}
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
            {hasLoadedContent && verseKeys.length > 1 ? (
              <VerseScrubber
                ref={verseScrubberRef}
                bottomInset={audioPlayerBarHeight}
                currentVerseNumber={visibleVerseNumber}
                onScrubStateChange={handleScrubStateChange}
                onScrubToVerse={handleScrubToVerse}
                topInset={0}
                verseCount={verseKeys.length}
              />
            ) : null}
          </View>
        ) : null}

        {isMushafView || Boolean(availableInitialMushafPageData) ? (
          <Animated.View
            pointerEvents={isMushafView ? 'auto' : 'none'}
            style={[
              styles.contentLayer,
              styles.mushafEntryLayer,
              { backgroundColor: mushafSurfaceBackground },
              mushafEntryStyle,
            ]}
          >
            {!isHydrated ? null : resolvedMushafRenderer !== 'webview' ? (
              <MushafMessageState
                message="Select an installed exact mushaf pack to use this Juz Mushaf view."
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
                focusTopInsetPx={readerHeader.headerHeight + 12}
                initialPageData={availableInitialMushafPageData}
                initialPageNumber={initialMushafPageNumber}
                mushafScaleStep={settings.mushafScaleStep}
                onActivePageChange={handleMushafActivePageChange}
                onActiveVerseChange={handleMushafActiveVerseChange}
                onScrollActivity={handleMushafScrollActivity}
                onSelectionChange={handleMushafSelectionChange}
                onSurahNavigation={handleMushafJuzNavigation}
                onVersePress={handleMushafVersePress}
                pageNumbers={
                  mushafSurahPageNumbers.length ? mushafSurahPageNumbers : [initialMushafPageNumber]
                }
                packId={selectedMushafId}
                totalPages={FALLBACK_MUSHAF_TOTAL_PAGES}
              />
            )}
          </Animated.View>
        ) : null}
      </View>

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

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={activeVerse ? (chapterNamesById.get(parseVerseKeyNumbers(activeVerse.verseKey)?.surahId ?? 1) ?? '') : ''}
        verseKey={activeVerse?.verseKey ?? ''}
        isBookmarked={activeVersePinned}
        isPlaying={audio.activeVerseKey === activeVerse?.verseKey && audio.isPlaying}
        onPlayPause={handlePlayPause}
        onBookmark={handleBookmark}
        onOpenTafsir={handleOpenTafsir}
        onAddToPlan={handleAddToPlan}
        onShare={handleShare}
      />

      <ReaderWordStudySheet
        controller={wordQuickSheet}
        resolveSurahName={(surahId) => chapterNamesById.get(surahId) ?? `Surah ${surahId}`}
        playWord={verseAudioWordSync.playWord}
        playVerseFromWord={verseAudioWordSync.playVerseFromWord}
      />

      {activeVerseBookmarkMetadata ? (
        <BookmarkModal
          isOpen={isBookmarkModalOpen}
          onClose={() => setIsBookmarkModalOpen(false)}
          verseId={activeVerse?.verseApiId ? String(activeVerse.verseApiId) : activeVerse?.verseKey ?? ''}
          metadata={activeVerseBookmarkMetadata}
        />
      ) : null}

      {plannerVerseSummary ? (
        <AddToPlannerModal
          isOpen={isAddToPlannerOpen}
          onClose={() => {
            setIsAddToPlannerOpen(false);
            setPlannerVerseSummary(null);
          }}
          verseSummary={plannerVerseSummary}
        />
      ) : null}

      <ComprehensiveSearchDropdown
        isOpen={headerSearch.isOpen && !isSettingsOpen}
        query={headerSearch.query}
        onQueryChange={headerSearch.updateQuery}
        onClose={() => headerSearch.close({ clearQuery: false })}
        onNavigateToMushaf={headerSearch.navigateToMushaf}
        onNavigateToSurahVerse={headerSearch.navigateToSurahVerse}
        onNavigateToTafsir={headerSearch.navigateToTafsir}
        onNavigateToTranslation={headerSearch.navigateToTranslation}
        onNavigateToJuz={headerSearch.navigateToJuz}
        onNavigateToPage={headerSearch.navigateToPage}
        onNavigateToSearch={headerSearch.navigateToSearch}
        topInset={readerHeader.headerHeight}
      />
    </View>
  );
}
