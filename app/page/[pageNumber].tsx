import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { MushafNativePage } from '@/components/mushaf/MushafNativePage';
import {
  resolveMushafVerseKey,
  type MushafSelectionPayload,
  type MushafWordPressPayload,
} from '@/components/mushaf/mushafWordPayload';
import { MushafWebViewPage, MushafWebViewPagePlaceholder } from '@/components/mushaf/MushafWebViewPage';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Bookmark, MushafPackId, MushafScaleStep, MushafVerse } from '@/types';
import { mushafScaleStepToFontSize } from '@/types';

const FALLBACK_TOTAL_PAGES = 604;
const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;
const EXACT_ACTIVE_PAGE_WINDOW_PADDING = 2;
const EXACT_HEIGHT_CACHE_EPSILON_PX = 1;
const MUSHAF_WEBVIEW_PAGE_MAX_WIDTH = 720;

const exactPageHeightCache = new Map<string, number>();

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logMushafQcfDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][page-route] ${event}`, details);
}

function getMushafWebViewViewportSignature(viewportWidth: number, viewportHeight: number): string {
  const pageWidth = Math.min(Math.max(viewportWidth - 8, 280), MUSHAF_WEBVIEW_PAGE_MAX_WIDTH);
  return `${Math.round(pageWidth)}x${Math.round(viewportHeight)}`;
}

function buildExactPageHeightCacheKey({
  packId,
  version,
  pageNumber,
  mushafScaleStep,
  viewportSignature,
}: {
  packId: MushafPackId;
  version: string;
  pageNumber: number;
  mushafScaleStep: MushafScaleStep;
  viewportSignature: string;
}): string {
  return `${packId}:${version}:${pageNumber}:${mushafScaleStep}:${viewportSignature}`;
}

type ExactPageWindow = {
  firstPageNumber: number;
  lastPageNumber: number;
};

function buildExactPageWindow({
  firstPageNumber,
  lastPageNumber,
  totalPages,
}: {
  firstPageNumber: number;
  lastPageNumber: number;
  totalPages: number;
}): ExactPageWindow {
  return {
    firstPageNumber: Math.max(1, firstPageNumber - EXACT_ACTIVE_PAGE_WINDOW_PADDING),
    lastPageNumber: Math.min(totalPages, lastPageNumber + EXACT_ACTIVE_PAGE_WINDOW_PADDING),
  };
}

function areExactPageWindowsEqual(left: ExactPageWindow, right: ExactPageWindow): boolean {
  return (
    left.firstPageNumber === right.firstPageNumber &&
    left.lastPageNumber === right.lastPageNumber
  );
}

type ActiveMushafVerse = {
  title: string;
  surahId: number;
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
  translationTexts: string[];
  wordPosition: number;
};

function clampPageNumber(value: number | null): number {
  if (value === null || !Number.isInteger(value)) return 1;
  return Math.min(Math.max(value, 1), FALLBACK_TOTAL_PAGES);
}

function parseVerseKeyNumbers(
  verseKey: string | null
): { surahId: number; verseNumber: number } | null {
  if (!verseKey) return null;
  const [surahRaw, verseRaw] = verseKey.split(':');
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verseNumber)) return null;
  const normalizedSurahId = Math.trunc(surahId);
  const normalizedVerseNumber = Math.trunc(verseNumber);
  if (normalizedSurahId <= 0 || normalizedVerseNumber <= 0) return null;
  return { surahId: normalizedSurahId, verseNumber: normalizedVerseNumber };
}

function resolveMushafVerseText(verse: MushafVerse): string {
  const directText = verse.textUthmani ?? verse.textIndopak ?? '';
  if (directText.trim()) {
    return directText.trim();
  }

  return verse.words
    .map((word) => word.textUthmani ?? word.textIndopak ?? word.textQpcHafs ?? '')
    .filter((wordText) => wordText.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function LoadingState({
  label,
  color,
}: {
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <ActivityIndicator color={color} />
      <Text className="text-center text-sm text-muted dark:text-muted-dark">{label}</Text>
    </View>
  );
}

function ErrorState({ message }: { message: string }): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
        {message}
      </Text>
    </View>
  );
}

function MushafFeedPlaceholder({
  color,
  height,
}: {
  color: string;
  height: number;
}): React.JSX.Element {
  return (
    <View
      className="items-center justify-center"
      style={{ height: Math.max(320, height) }}
    >
      <ActivityIndicator color={color} />
    </View>
  );
}

function MushafFeedPageRow({
  pageNumber,
  packId,
  expectedVersion,
  exactHeightCacheKey,
  cachedExactHeight,
  isExactRenderer,
  isInExactRenderWindow,
  mushafScaleStep,
  estimatedHeight,
  chapterNamesById,
  isInitialTargetPage,
  loadingColor,
  onExactHeightResolved,
  onExactPageFirstHeight,
  onSelectionChange,
  onVersePress,
}: {
  pageNumber: number;
  packId: MushafPackId;
  expectedVersion?: string;
  exactHeightCacheKey: string | null;
  cachedExactHeight: number | null;
  isExactRenderer: boolean;
  isInExactRenderWindow: boolean;
  mushafScaleStep: MushafScaleStep;
  estimatedHeight: number;
  chapterNamesById: Map<number, string>;
  isInitialTargetPage: boolean;
  loadingColor: string;
  onExactHeightResolved: (payload: { cacheKey: string; height: number; pageNumber: number }) => void;
  onExactPageFirstHeight: (payload: { pageNumber: number; height: number; durationMs: number }) => void;
  onSelectionChange: (payload: MushafSelectionPayload) => void;
  onVersePress: (verse: ActiveMushafVerse) => void;
}): React.JSX.Element {
  const { data, isLoading, errorMessage } = useMushafPageData({
    packId,
    pageNumber,
    expectedVersion,
    enabled: !isExactRenderer || isInExactRenderWindow,
  });

  const versesByKey = React.useMemo(
    () => new Map((data?.verses ?? []).map((verse) => [verse.verseKey, verse] as const)),
    [data?.verses]
  );

  const handleWordPress = React.useCallback(
    (payload: MushafWordPressPayload) => {
      const verseKey = resolveMushafVerseKey(payload);
      if (!verseKey) return;

      const verse = versesByKey.get(verseKey);
      if (!verse) return;

      const parsed = parseVerseKeyNumbers(verseKey);
      if (!parsed) return;

      onVersePress({
        title: chapterNamesById.get(parsed.surahId) ?? `Surah ${parsed.surahId}`,
        surahId: parsed.surahId,
        verseKey,
        ...(typeof verse.id === 'number' && Number.isFinite(verse.id) && verse.id > 0
          ? { verseApiId: verse.id }
          : {}),
        arabicText: resolveMushafVerseText(verse),
        translationTexts: [],
        wordPosition:
          typeof payload.wordPosition === 'number' && Number.isFinite(payload.wordPosition)
            ? Math.trunc(payload.wordPosition)
            : 0,
      });
    },
    [chapterNamesById, onVersePress, versesByKey]
  );

  let content: React.JSX.Element;
  const resolvedExactHeight = cachedExactHeight ?? estimatedHeight;

  if (isExactRenderer && !isInExactRenderWindow) {
    content = <MushafWebViewPagePlaceholder estimatedHeight={resolvedExactHeight} />;
  } else if (errorMessage) {
    content = (
      <View className="px-6 py-6">
        <Text className="text-center text-sm text-muted dark:text-muted-dark">{errorMessage}</Text>
      </View>
    );
  } else if (isLoading || !data) {
    content = isExactRenderer ? (
      <MushafWebViewPagePlaceholder
        estimatedHeight={resolvedExactHeight}
        showLoadingIndicator={isInExactRenderWindow}
      />
    ) : (
      <MushafFeedPlaceholder color={loadingColor} height={estimatedHeight} />
    );
  } else {
    content =
      data.pack.renderer === 'text' ? (
        <MushafNativePage
          data={data}
          mushafScaleStep={mushafScaleStep}
          onWordPress={handleWordPress}
        />
      ) : (
        <MushafWebViewPage
          data={data}
          mushafScaleStep={mushafScaleStep}
          initialHeightOverride={cachedExactHeight ?? undefined}
          onFirstContentHeight={
            isInitialTargetPage
              ? ({ height, durationMs }) =>
                  onExactPageFirstHeight({ durationMs, height, pageNumber })
              : undefined
          }
          onHeightResolved={
            exactHeightCacheKey
              ? ({ height }) =>
                  onExactHeightResolved({
                    cacheKey: exactHeightCacheKey,
                    height,
                    pageNumber,
                  })
              : undefined
          }
          onSelectionChange={onSelectionChange}
          onWordPress={handleWordPress}
        />
      );
  }

  return (
    <View>
      {content}
      <View className="items-center px-3 pt-3">
        <View className="w-full max-w-[220px] flex-row items-center justify-center gap-3">
          <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
          <Text className="text-xs font-medium text-muted dark:text-muted-dark">
            Page {pageNumber}
          </Text>
          <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
        </View>
      </View>
    </View>
  );
}

export default function PageScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ pageNumber?: string | string[] }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const palette = Colors[resolvedTheme];
  const pageNumberParam = Array.isArray(params.pageNumber)
    ? params.pageNumber[0]
    : params.pageNumber;
  const parsedPageNumber = Number.parseInt(pageNumberParam ?? '', 10);
  const initialPageNumber = clampPageNumber(
    Number.isInteger(parsedPageNumber) ? parsedPageNumber : null
  );

  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] =
    React.useState<VerseSummaryDetails | null>(null);
  const [activeVerse, setActiveVerse] = React.useState<ActiveMushafVerse | null>(null);

  const selectionMetadataRef = React.useRef<MushafSelectionPayload | null>(null);

  const { settings, isHydrated } = useSettings();
  const { chapters } = useChapters();
  const { isPinned } = useBookmarks();
  const audio = useAudioPlayer();

  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
  const selectedMushafOption = findMushafOption(selectedMushafId);
  const isExactRenderer = selectedMushafOption?.renderer === 'webview';
  const selectedMushafVersion = selectedMushafOption?.version ?? 'unknown';
  const exactViewportSignature = React.useMemo(
    () => getMushafWebViewViewportSignature(width, height),
    [height, width]
  );
  const exactLoadBaselineStartRef = React.useRef<number | null>(null);
  const hasReportedInitialExactPageRef = React.useRef(false);
  const [exactHeightCacheVersion, bumpExactHeightCacheVersion] = React.useReducer(
    (value) => value + 1,
    0
  );

  const initialPageProbe = useMushafPageData({
    packId: selectedMushafId,
    pageNumber: initialPageNumber,
    expectedVersion: selectedMushafVersion,
    enabled: isHydrated,
  });
  const activeMushafVersion = initialPageProbe.data?.pack.version ?? selectedMushafVersion;

  const chapterNamesById = React.useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.name_simple] as const)),
    [chapters]
  );

  const totalPages = initialPageProbe.data?.pack.totalPages ?? FALLBACK_TOTAL_PAGES;
  const pageNumbers = React.useMemo(
    () => Array.from({ length: totalPages }, (_value, index) => index + 1),
    [totalPages]
  );
  const initialExactPageWindow = React.useMemo(
    () =>
      buildExactPageWindow({
        firstPageNumber: initialPageNumber,
        lastPageNumber: initialPageNumber,
        totalPages,
      }),
    [initialPageNumber, totalPages]
  );
  const [activeExactPageWindow, setActiveExactPageWindow] =
    React.useState<ExactPageWindow>(initialExactPageWindow);
  const totalPagesRef = React.useRef(FALLBACK_TOTAL_PAGES);
  const isExactRendererRef = React.useRef(isExactRenderer);
  const initialPageIndex = Math.min(Math.max(initialPageNumber - 1, 0), pageNumbers.length - 1);
  const initialExactHeightCacheKey = React.useMemo(
    () =>
      isExactRenderer
        ? buildExactPageHeightCacheKey({
            packId: selectedMushafId,
            version: activeMushafVersion,
            pageNumber: initialPageNumber,
            mushafScaleStep: settings.mushafScaleStep,
            viewportSignature: exactViewportSignature,
          })
        : null,
    [
      exactViewportSignature,
      initialPageNumber,
      isExactRenderer,
      selectedMushafId,
      activeMushafVersion,
      settings.mushafScaleStep,
    ]
  );
  const initialExactCachedHeight = React.useMemo(
    () =>
      initialExactHeightCacheKey ? (exactPageHeightCache.get(initialExactHeightCacheKey) ?? null) : null,
    [exactHeightCacheVersion, initialExactHeightCacheKey]
  );
  const estimatedItemSize = React.useMemo(() => {
    if (initialPageProbe.data?.pack.renderer === 'text') {
      const fontSize = mushafScaleStepToFontSize(settings.mushafScaleStep);
      return Math.round(fontSize * 1.72 * initialPageProbe.data.pack.lines + fontSize * 2);
    }

    if (initialExactCachedHeight !== null) {
      return initialExactCachedHeight;
    }

    return Math.round(Math.max(height * 0.9, 620));
  }, [height, initialExactCachedHeight, initialPageProbe.data, settings.mushafScaleStep]);
  const listContentContainerStyle = React.useMemo(
    () => ({ paddingTop: 12, paddingBottom: 24 + audioPlayerBarHeight }),
    [audioPlayerBarHeight]
  );
  const listExtraData = React.useMemo(
    () => ({
      activeExactPageWindowFirst: activeExactPageWindow.firstPageNumber,
      activeExactPageWindowLast: activeExactPageWindow.lastPageNumber,
      exactHeightCacheVersion,
      exactViewportSignature,
      isExactRenderer,
      mushafScaleStep: settings.mushafScaleStep,
      selectedMushafId,
    }),
    [
      activeExactPageWindow,
      exactHeightCacheVersion,
      exactViewportSignature,
      isExactRenderer,
      selectedMushafId,
      settings.mushafScaleStep,
    ]
  );
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 20 }).current;

  React.useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  React.useEffect(() => {
    isExactRendererRef.current = isExactRenderer;
  }, [isExactRenderer]);

  React.useEffect(() => {
    setIsVerseActionsOpen(false);
    setIsSettingsOpen(false);
    setIsBookmarkModalOpen(false);
    setIsAddToPlannerOpen(false);
    setPlannerVerseSummary(null);
    setActiveVerse(null);
    selectionMetadataRef.current = null;
  }, [initialPageNumber, selectedMushafId]);

  React.useEffect(() => {
    hasReportedInitialExactPageRef.current = false;

    if (!isHydrated || !isExactRenderer) {
      exactLoadBaselineStartRef.current = null;
      return;
    }

    exactLoadBaselineStartRef.current = nowMs();
    logMushafQcfDev('exact-load-baseline-start', {
      initialPageNumber,
      packId: selectedMushafId,
    });
  }, [initialPageNumber, isExactRenderer, isHydrated, selectedMushafId]);

  React.useEffect(() => {
    setActiveExactPageWindow(initialExactPageWindow);

    if (isExactRenderer) {
      logMushafQcfDev('exact-render-window-reset', {
        firstPageNumber: initialExactPageWindow.firstPageNumber,
        lastPageNumber: initialExactPageWindow.lastPageNumber,
        packId: selectedMushafId,
      });
    }
  }, [initialExactPageWindow, isExactRenderer, selectedMushafId]);

  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      if (!isExactRendererRef.current) {
        return;
      }

      let firstVisiblePageNumber = Number.POSITIVE_INFINITY;
      let lastVisiblePageNumber = -1;

      for (const token of viewableItems) {
        if (!token.isViewable) continue;
        const pageNumber =
          typeof token.item === 'number'
            ? token.item
            : Number.parseInt(String(token.item ?? ''), 10);
        if (!Number.isFinite(pageNumber)) continue;

        firstVisiblePageNumber = Math.min(firstVisiblePageNumber, pageNumber);
        lastVisiblePageNumber = Math.max(lastVisiblePageNumber, pageNumber);
      }

      if (!Number.isFinite(firstVisiblePageNumber) || lastVisiblePageNumber < 1) {
        return;
      }

      const nextWindow = buildExactPageWindow({
        firstPageNumber: firstVisiblePageNumber,
        lastPageNumber: lastVisiblePageNumber,
        totalPages: totalPagesRef.current,
      });

      setActiveExactPageWindow((currentWindow) => {
        if (areExactPageWindowsEqual(currentWindow, nextWindow)) {
          return currentWindow;
        }

        logMushafQcfDev('exact-render-window-updated', {
          firstPageNumber: nextWindow.firstPageNumber,
          lastPageNumber: nextWindow.lastPageNumber,
          visibleFirstPageNumber: firstVisiblePageNumber,
          visibleLastPageNumber: lastVisiblePageNumber,
        });
        return nextWindow;
      });
    }
  ).current;

  const openVerseActions = React.useCallback((nextVerse: ActiveMushafVerse) => {
    setActiveVerse(nextVerse);
    setIsVerseActionsOpen(true);
  }, []);

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const handleMushafSelectionChange = React.useCallback((payload: MushafSelectionPayload) => {
    selectionMetadataRef.current = payload.isCollapsed ? null : payload;
  }, []);

  const handleVersePress = React.useCallback(
    (nextVerse: ActiveMushafVerse) => {
      if (selectionMetadataRef.current && !selectionMetadataRef.current.isCollapsed) {
        return;
      }

      openVerseActions(nextVerse);
    },
    [openVerseActions]
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
    const parsed = parseVerseKeyNumbers(verseKey);
    if (!parsed) return;

    router.push({
      pathname: '/tafsir/[surahId]/[ayahId]',
      params: {
        surahId: String(parsed.surahId),
        ayahId: String(parsed.verseNumber),
      },
    });
  }, [activeVerse?.verseKey, router]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;

    setPlannerVerseSummary({
      verseKey,
      surahId: activeVerse?.surahId,
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;

    const lines = [
      activeVerse.title ? `${activeVerse.title} ${activeVerse.verseKey}` : activeVerse.verseKey,
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
  }, [activeVerse]);

  const activeVersePinned = React.useMemo(() => {
    if (!activeVerse) return false;
    const apiId =
      typeof activeVerse.verseApiId === 'number' ? String(activeVerse.verseApiId) : null;
    return Boolean((apiId && isPinned(apiId)) || isPinned(activeVerse.verseKey));
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;

    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof activeVerse.verseApiId === 'number'
        ? { verseApiId: activeVerse.verseApiId }
        : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(activeVerse.title ? { surahName: activeVerse.title } : {}),
      ...(activeVerse.translationTexts?.[0]
        ? { translation: activeVerse.translationTexts[0] }
        : {}),
    };

    return metadata;
  }, [activeVerse]);

  const handleExactPageFirstHeight = React.useCallback(
    ({ pageNumber, height: measuredHeight, durationMs }: { pageNumber: number; height: number; durationMs: number }) => {
      if (hasReportedInitialExactPageRef.current) {
        return;
      }

      hasReportedInitialExactPageRef.current = true;
      const baselineDurationMs =
        exactLoadBaselineStartRef.current === null
          ? null
          : Math.round(nowMs() - exactLoadBaselineStartRef.current);

      logMushafQcfDev('exact-load-baseline-ready', {
        baselineDurationMs,
        firstHeightDurationMs: durationMs,
        initialPageNumber,
        measuredHeight,
        packId: selectedMushafId,
        reportedPageNumber: pageNumber,
      });
    },
    [initialPageNumber, selectedMushafId]
  );

  const handleExactHeightResolved = React.useCallback(
    ({ cacheKey, height: measuredHeight, pageNumber }: { cacheKey: string; height: number; pageNumber: number }) => {
      const currentHeight = exactPageHeightCache.get(cacheKey);
      if (
        currentHeight !== undefined &&
        Math.abs(currentHeight - measuredHeight) <= EXACT_HEIGHT_CACHE_EPSILON_PX
      ) {
        return;
      }

      exactPageHeightCache.set(cacheKey, measuredHeight);
      bumpExactHeightCacheVersion();
      logMushafQcfDev('exact-height-cache-store', {
        cacheKey,
        height: measuredHeight,
        pageNumber,
      });
    },
    []
  );

  const getExactHeightCacheKeyForPage = React.useCallback(
    (pageNumber: number) =>
      buildExactPageHeightCacheKey({
        packId: selectedMushafId,
        version: activeMushafVersion,
        pageNumber,
        mushafScaleStep: settings.mushafScaleStep,
        viewportSignature: exactViewportSignature,
      }),
    [
      activeMushafVersion,
      exactViewportSignature,
      selectedMushafId,
      settings.mushafScaleStep,
    ]
  );

  const getCachedExactHeight = React.useCallback(
    (pageNumber: number) => exactPageHeightCache.get(getExactHeightCacheKeyForPage(pageNumber)) ?? null,
    [getExactHeightCacheKeyForPage]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Mushaf',
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              onPress={() => setIsSettingsOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open reader settings"
              style={({ pressed }) => ({
                opacity: pressed ? 0.55 : 1,
                marginRight: 12,
              })}
            >
              <Settings color={palette.text} size={20} strokeWidth={2.25} />
            </Pressable>
          ),
        }}
      />

      {!isHydrated ? (
        <LoadingState label="Loading local mushaf settings…" color={palette.text} />
      ) : initialPageProbe.isLoading && !initialPageProbe.data ? (
        <LoadingState label="Loading mushaf pages…" color={palette.text} />
      ) : initialPageProbe.errorMessage ? (
        <ErrorState message={initialPageProbe.errorMessage} />
      ) : (
        <FlashList
          key={`mushaf-feed:${selectedMushafId}:${initialPageNumber}`}
          data={pageNumbers}
          keyExtractor={(item) => `mushaf-page:${selectedMushafId}:${item}`}
          renderItem={({ item }) => {
            const exactHeightCacheKey = isExactRenderer
              ? getExactHeightCacheKeyForPage(item)
              : null;
            const cachedExactHeight =
              exactHeightCacheKey === null
                ? null
                : (exactPageHeightCache.get(exactHeightCacheKey) ?? null);

            return (
              <MushafFeedPageRow
                pageNumber={item}
                packId={selectedMushafId}
                expectedVersion={activeMushafVersion}
                exactHeightCacheKey={exactHeightCacheKey}
                cachedExactHeight={cachedExactHeight}
                isExactRenderer={isExactRenderer}
                isInExactRenderWindow={
                  !isExactRenderer ||
                  (item >= activeExactPageWindow.firstPageNumber &&
                    item <= activeExactPageWindow.lastPageNumber)
                }
                mushafScaleStep={settings.mushafScaleStep}
                estimatedHeight={estimatedItemSize}
                chapterNamesById={chapterNamesById}
                isInitialTargetPage={item === initialPageNumber}
                loadingColor={palette.text}
                onExactHeightResolved={handleExactHeightResolved}
                onExactPageFirstHeight={handleExactPageFirstHeight}
                onSelectionChange={handleMushafSelectionChange}
                onVersePress={handleVersePress}
              />
            );
          }}
          extraData={listExtraData}
          initialScrollIndex={initialPageIndex}
          drawDistance={Math.max(estimatedItemSize * 2, 1200)}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={listContentContainerStyle}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          showsVerticalScrollIndicator={false}
        />
      )}

      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeTab="mushaf"
      />

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={activeVerse?.title ?? 'Surah'}
        verseKey={activeVerse?.verseKey ?? ''}
        isPlaying={Boolean(audio.isPlaying && audio.activeVerseKey === activeVerse?.verseKey)}
        isBookmarked={activeVersePinned}
        onPlayPause={handlePlayPause}
        onOpenTafsir={handleOpenTafsir}
        onBookmark={handleBookmark}
        onAddToPlan={handleAddToPlan}
        onShare={activeVerse ? handleShare : undefined}
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
    </View>
  );
}
