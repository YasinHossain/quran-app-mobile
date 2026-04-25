import { FlashList, type FlashListRef } from '@shopify/flash-list';
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
import {
  estimateMushafWebViewPageHeight,
  MushafWebViewPage,
  MushafWebViewPagePlaceholder,
} from '@/components/mushaf/MushafWebViewPage';
import { MushafSingleDocumentReader } from '@/components/mushaf/MushafSingleDocumentReader';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { preloadOfflineTafsirSurah } from '@/lib/tafsir/tafsirCache';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { container } from '@/src/core/infrastructure/di/container';

import type { Bookmark, MushafPackId, MushafScaleStep, MushafVerse } from '@/types';
import { mushafScaleStepToFontSize } from '@/types';

const FALLBACK_TOTAL_PAGES = 604;
const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;
const EXACT_ACTIVE_PAGE_WINDOW_PADDING = 2;
const EXACT_HEIGHT_CACHE_EPSILON_PX = 1;
const EXACT_PAGE_HEIGHT_CACHE_MAX_ENTRIES = 96;
const INITIAL_LOCKED_EXACT_WINDOW_PADDING = 1;
const MUSHAF_NATIVE_LINE_GAP_PX = 2;
const MUSHAF_WEBVIEW_PAGE_MAX_WIDTH = 720;

const exactPageHeightCache = new Map<string, number>();
let activeExactPageHeightCacheIdentity: string | null = null;

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

function getPackVersionCacheIdentity(packId: MushafPackId, version: string): string {
  return `${packId}@${version.trim()}`;
}

function readExactPageHeightCache(cacheKey: string | null): number | null {
  if (!cacheKey) {
    return null;
  }

  return exactPageHeightCache.get(cacheKey) ?? null;
}

function writeExactPageHeightCache(cacheKey: string, height: number): void {
  if (exactPageHeightCache.has(cacheKey)) {
    exactPageHeightCache.delete(cacheKey);
  }

  exactPageHeightCache.set(cacheKey, height);

  while (exactPageHeightCache.size > EXACT_PAGE_HEIGHT_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = exactPageHeightCache.keys().next().value;
    if (!oldestCacheKey) {
      break;
    }

    exactPageHeightCache.delete(oldestCacheKey);
  }
}

function syncExactPageHeightCacheIdentity(packId: MushafPackId, version: string): boolean {
  const nextIdentity = getPackVersionCacheIdentity(packId, version);
  if (activeExactPageHeightCacheIdentity === nextIdentity) {
    return false;
  }

  activeExactPageHeightCacheIdentity = nextIdentity;

  if (exactPageHeightCache.size === 0) {
    return false;
  }

  exactPageHeightCache.clear();
  return true;
}

type ExactPageWindow = {
  firstPageNumber: number;
  lastPageNumber: number;
};

function buildExactPageWindow({
  firstPageNumber,
  lastPageNumber,
  totalPages,
  paddingPages = EXACT_ACTIVE_PAGE_WINDOW_PADDING,
}: {
  firstPageNumber: number;
  lastPageNumber: number;
  totalPages: number;
  paddingPages?: number;
}): ExactPageWindow {
  return {
    firstPageNumber: Math.max(1, firstPageNumber - Math.max(0, paddingPages)),
    lastPageNumber: Math.min(totalPages, lastPageNumber + Math.max(0, paddingPages)),
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

function resolveHighlightVerseFirstLineNumber(
  data: { pageLines: { lines: Array<{ lineNumber: number; words: Array<{ verseKey?: string; location?: string }> }> } },
  highlightVerseKey: string
): number | null {
  let firstLineNumber = Number.POSITIVE_INFINITY;

  for (const line of data.pageLines.lines) {
    const lineHasVerse = line.words.some((word) => resolveMushafVerseKey(word) === highlightVerseKey);
    if (!lineHasVerse) {
      continue;
    }

    firstLineNumber = Math.min(firstLineNumber, line.lineNumber);
  }

  return Number.isFinite(firstLineNumber) ? firstLineNumber : null;
}

function buildNativeHighlightAnchor({
  data,
  highlightVerseKey,
  mushafScaleStep,
}: {
  data: {
    pack: { lines: number };
    pageLines: { lines: Array<{ lineNumber: number; words: Array<{ verseKey?: string; location?: string }> }> };
  };
  highlightVerseKey: string;
  mushafScaleStep: MushafScaleStep;
}): { height: number; offsetY: number; pageHeight: number; verseKey: string } | null {
  const firstLineNumber = resolveHighlightVerseFirstLineNumber(data, highlightVerseKey);
  if (firstLineNumber === null) {
    return null;
  }

  const fontSize = mushafScaleStepToFontSize(mushafScaleStep);
  const lineHeight = Math.round(fontSize * 1.72);
  const verticalPadding = Math.max(6, Math.round(fontSize * 0.18));
  const normalizedLineIndex = Math.max(0, Math.min(data.pack.lines - 1, firstLineNumber - 1));
  const pageHeight =
    verticalPadding * 2 +
    data.pack.lines * lineHeight +
    Math.max(0, data.pack.lines - 1) * MUSHAF_NATIVE_LINE_GAP_PX;

  return {
    height: lineHeight,
    offsetY: verticalPadding + normalizedLineIndex * (lineHeight + MUSHAF_NATIVE_LINE_GAP_PX),
    pageHeight,
    verseKey: highlightVerseKey,
  };
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
  highlightVerseKey,
  onHighlightAnchorResolved,
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
  highlightVerseKey?: string;
  onHighlightAnchorResolved?: (payload: {
    height: number;
    offsetY: number;
    pageHeight: number;
    verseKey: string;
  }) => void;
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
  const nativeHighlightAnchor = React.useMemo(() => {
    if (!data || data.pack.renderer !== 'text' || !highlightVerseKey) {
      return null;
    }

    return buildNativeHighlightAnchor({
      data,
      highlightVerseKey,
      mushafScaleStep,
    });
  }, [data, highlightVerseKey, mushafScaleStep]);

  React.useEffect(() => {
    if (!nativeHighlightAnchor || !onHighlightAnchorResolved) {
      return;
    }

    onHighlightAnchorResolved(nativeHighlightAnchor);
  }, [nativeHighlightAnchor, onHighlightAnchorResolved]);

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
        showLoadingIndicator={false}
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
          highlightVerseKey={highlightVerseKey}
          onWordPress={handleWordPress}
        />
      ) : (
        <MushafWebViewPage
          data={data}
          mushafScaleStep={mushafScaleStep}
          highlightVerseKey={highlightVerseKey}
          initialHeightOverride={cachedExactHeight ?? undefined}
          onHighlightAnchorResolved={onHighlightAnchorResolved}
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
  const params = useLocalSearchParams<{
    pageNumber?: string | string[];
    focusVerse?: string | string[];
  }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const palette = Colors[resolvedTheme];
  const pageNumberParam = Array.isArray(params.pageNumber)
    ? params.pageNumber[0]
    : params.pageNumber;
  const focusVerseParam = Array.isArray(params.focusVerse) ? params.focusVerse[0] : params.focusVerse;
  const parsedPageNumber = Number.parseInt(pageNumberParam ?? '', 10);
  const initialPageNumber = clampPageNumber(
    Number.isInteger(parsedPageNumber) ? parsedPageNumber : null
  );
  const arrivalHighlightVerseKey = React.useMemo(() => {
    const parsed = parseVerseKeyNumbers(focusVerseParam ?? null);
    return parsed ? `${parsed.surahId}:${parsed.verseNumber}` : null;
  }, [focusVerseParam]);

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
  const translationIds = React.useMemo(() => {
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);
  const tafsirIds = React.useMemo(() => {
    const ids = Array.isArray(settings.tafsirIds) ? settings.tafsirIds : [];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.tafsirIds]);

  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
  const selectedMushafOption = findMushafOption(selectedMushafId);
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
  const resolvedMushafRenderer =
    initialPageProbe.data?.pack.renderer ?? selectedMushafOption?.renderer ?? 'text';
  const isExactRenderer = resolvedMushafRenderer === 'webview';
  const activeMushafVersion = initialPageProbe.data?.pack.version ?? selectedMushafVersion;
  const canSyncActivePageCacheIdentity =
    initialPageProbe.data !== null || selectedMushafOption?.channel === 'bundled';

  React.useEffect(() => {
    if (!canSyncActivePageCacheIdentity) {
      return;
    }

    container.getMushafPageRepository().setActivePageCacheIdentity({
      packId: selectedMushafId,
      version: activeMushafVersion,
    });

    const didClearExactHeightCache = syncExactPageHeightCacheIdentity(
      selectedMushafId,
      activeMushafVersion
    );
    if (!didClearExactHeightCache) {
      return;
    }

    bumpExactHeightCacheVersion();
    logMushafQcfDev('exact-height-cache-reset', {
      packId: selectedMushafId,
      version: activeMushafVersion,
    });
  }, [activeMushafVersion, canSyncActivePageCacheIdentity, selectedMushafId]);

  const chapterNamesById = React.useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.name_simple] as const)),
    [chapters]
  );

  const totalPages = initialPageProbe.data?.pack.totalPages ?? FALLBACK_TOTAL_PAGES;
  const pageNumbers = React.useMemo(
    () => Array.from({ length: totalPages }, (_value, index) => index + 1),
    [totalPages]
  );
  const exactReaderBackgroundPageNumbers = React.useMemo(() => {
    const pageSet = new Set<number>();
    for (let pageNumber = initialPageNumber - 2; pageNumber <= initialPageNumber + 2; pageNumber += 1) {
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        pageSet.add(pageNumber);
      }
    }

    const parsedHighlight = parseVerseKeyNumbers(arrivalHighlightVerseKey);
    const chapterPages =
      parsedHighlight === null
        ? null
        : chapters.find((chapter) => chapter.id === parsedHighlight.surahId)?.pages ?? null;

    if (chapterPages) {
      const [firstPage, lastPage] = chapterPages;
      for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
        if (pageNumber >= 1 && pageNumber <= totalPages) {
          pageSet.add(pageNumber);
        }
      }
    } else {
      for (let pageNumber = initialPageNumber - 6; pageNumber <= initialPageNumber + 6; pageNumber += 1) {
        if (pageNumber >= 1 && pageNumber <= totalPages) {
          pageSet.add(pageNumber);
        }
      }
    }

    return Array.from(pageSet).sort((left, right) => {
      const leftDistance = Math.abs(left - initialPageNumber);
      const rightDistance = Math.abs(right - initialPageNumber);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left - right;
    });
  }, [arrivalHighlightVerseKey, chapters, initialPageNumber, totalPages]);
  const shouldLockInitialExactWindow = Boolean(isExactRenderer && arrivalHighlightVerseKey);
  const initialExactPageWindow = React.useMemo(
    () =>
      buildExactPageWindow({
        firstPageNumber: initialPageNumber,
        lastPageNumber: initialPageNumber,
        paddingPages: shouldLockInitialExactWindow
          ? INITIAL_LOCKED_EXACT_WINDOW_PADDING
          : EXACT_ACTIVE_PAGE_WINDOW_PADDING,
        totalPages,
      }),
    [initialPageNumber, shouldLockInitialExactWindow, totalPages]
  );
  const [activeExactPageWindow, setActiveExactPageWindow] =
    React.useState<ExactPageWindow>(initialExactPageWindow);
  const [isInitialExactWindowLocked, setIsInitialExactWindowLocked] =
    React.useState(shouldLockInitialExactWindow);
  const totalPagesRef = React.useRef(FALLBACK_TOTAL_PAGES);
  const isExactRendererRef = React.useRef(isExactRenderer);
  const isInitialExactWindowLockedRef = React.useRef(shouldLockInitialExactWindow);
  const feedListRef = React.useRef<FlashListRef<number> | null>(null);
  const initialPageNumberRef = React.useRef(initialPageNumber);
  const initialPageViewOffsetRef = React.useRef(0);
  const lastAppliedInitialScrollSignatureRef = React.useRef<string | null>(null);
  const didScrollToInitialPageRef = React.useRef(false);
  const [initialPageViewOffset, setInitialPageViewOffset] = React.useState(0);
  const [initialPageScrollTick, bumpInitialPageScrollTick] = React.useReducer(
    (value) => value + 1,
    0
  );
  const initialPageScrollRetryCountRef = React.useRef(0);
  const initialPageScrollRetryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
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
    () => readExactPageHeightCache(initialExactHeightCacheKey),
    [exactHeightCacheVersion, initialExactHeightCacheKey]
  );
  const arrivalFocusTopInset = React.useMemo(
    () => Math.round(Math.min(Math.max(height * 0.18, 72), 136)),
    [height]
  );
  const estimatedItemSize = React.useMemo(() => {
    if (!isExactRenderer && initialPageProbe.data?.pack.renderer === 'text') {
      const fontSize = mushafScaleStepToFontSize(settings.mushafScaleStep);
      return Math.round(fontSize * 1.72 * initialPageProbe.data.pack.lines + fontSize * 2);
    }

    if (initialExactCachedHeight !== null) {
      return initialExactCachedHeight;
    }

    if (isExactRenderer) {
      return estimateMushafWebViewPageHeight({
        packId: selectedMushafId,
        lines: initialPageProbe.data?.pack.lines ?? selectedMushafOption?.lines ?? 15,
        mushafScaleStep: settings.mushafScaleStep,
        viewportHeight: height,
        viewportWidth: width,
      });
    }

    return Math.round(Math.max(height * 0.9, 620));
  }, [
    height,
    initialExactCachedHeight,
    initialPageProbe.data,
    isExactRenderer,
    selectedMushafId,
    selectedMushafOption?.lines,
    settings.mushafScaleStep,
    width,
  ]);
  const listContentContainerStyle = React.useMemo(
    () => ({ paddingTop: 12, paddingBottom: 24 + audioPlayerBarHeight }),
    [audioPlayerBarHeight]
  );
  const listExtraData = React.useMemo(
    () => ({
      activeExactPageWindowFirst: activeExactPageWindow.firstPageNumber,
      activeExactPageWindowLast: activeExactPageWindow.lastPageNumber,
      arrivalHighlightVerseKey,
      exactHeightCacheVersion,
      exactViewportSignature,
      isExactRenderer,
      mushafScaleStep: settings.mushafScaleStep,
      selectedMushafId,
    }),
    [
      activeExactPageWindow,
      arrivalHighlightVerseKey,
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
    isInitialExactWindowLockedRef.current = isInitialExactWindowLocked;
  }, [isInitialExactWindowLocked]);

  React.useEffect(() => {
    initialPageNumberRef.current = initialPageNumber;
  }, [initialPageNumber]);

  const updateInitialPageViewOffset = React.useCallback((nextOffset: number) => {
    const normalizedOffset = Math.max(0, Math.round(nextOffset));
    if (Math.abs(initialPageViewOffsetRef.current - normalizedOffset) <= EXACT_HEIGHT_CACHE_EPSILON_PX) {
      return;
    }

    initialPageViewOffsetRef.current = normalizedOffset;
    setInitialPageViewOffset(normalizedOffset);
  }, []);

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
    setIsInitialExactWindowLocked(shouldLockInitialExactWindow);
    isInitialExactWindowLockedRef.current = shouldLockInitialExactWindow;
    didScrollToInitialPageRef.current = false;
    initialPageScrollRetryCountRef.current = 0;
    lastAppliedInitialScrollSignatureRef.current = null;
    initialPageViewOffsetRef.current = 0;
    setInitialPageViewOffset(0);

    if (initialPageScrollRetryTimeoutRef.current) {
      clearTimeout(initialPageScrollRetryTimeoutRef.current);
      initialPageScrollRetryTimeoutRef.current = null;
    }
  }, [arrivalHighlightVerseKey, initialPageNumber, selectedMushafId, shouldLockInitialExactWindow]);

  React.useEffect(() => {
    return () => {
      if (initialPageScrollRetryTimeoutRef.current) {
        clearTimeout(initialPageScrollRetryTimeoutRef.current);
        initialPageScrollRetryTimeoutRef.current = null;
      }
    };
  }, []);

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

      const targetInitialPageNumber = initialPageNumberRef.current;
      if (
        targetInitialPageNumber >= firstVisiblePageNumber &&
        targetInitialPageNumber <= lastVisiblePageNumber
      ) {
        didScrollToInitialPageRef.current = true;
        initialPageScrollRetryCountRef.current = 0;
        if (initialPageScrollRetryTimeoutRef.current) {
          clearTimeout(initialPageScrollRetryTimeoutRef.current);
          initialPageScrollRetryTimeoutRef.current = null;
        }
      }

      if (!isExactRendererRef.current) {
        return;
      }

      if (isInitialExactWindowLockedRef.current) {
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

  const handleMushafScrollBegin = React.useCallback(() => {
    if (!isInitialExactWindowLockedRef.current) {
      return;
    }

    isInitialExactWindowLockedRef.current = false;
    setIsInitialExactWindowLocked(false);
  }, []);

  React.useEffect(() => {
    if (!isHydrated || isExactRenderer) return;

    const scrollSignature = `${initialPageIndex}:${initialPageViewOffset}`;
    if (
      didScrollToInitialPageRef.current &&
      lastAppliedInitialScrollSignatureRef.current === scrollSignature
    ) {
      return;
    }

    const scheduleRetry = () => {
      if (
        didScrollToInitialPageRef.current &&
        lastAppliedInitialScrollSignatureRef.current === scrollSignature
      ) {
        return;
      }
      if (initialPageScrollRetryCountRef.current >= 10) return;
      if (initialPageScrollRetryTimeoutRef.current) return;
      initialPageScrollRetryCountRef.current += 1;
      initialPageScrollRetryTimeoutRef.current = setTimeout(() => {
        initialPageScrollRetryTimeoutRef.current = null;
        bumpInitialPageScrollTick();
      }, 140);
    };

    const list = feedListRef.current;
    if (!list) {
      scheduleRetry();
      return;
    }

    try {
      void list.scrollToIndex({
        index: initialPageIndex,
        animated: false,
        viewOffset: initialPageViewOffset,
        viewPosition: 0,
      });
      lastAppliedInitialScrollSignatureRef.current = scrollSignature;
    } catch {}

    scheduleRetry();
  }, [
    initialPageIndex,
    initialPageViewOffset,
    initialPageScrollTick,
    initialPageNumber,
    isExactRenderer,
    isHydrated,
    selectedMushafId,
  ]);

  const handleInitialHighlightAnchorResolved = React.useCallback(
    ({
      height: anchorHeight,
      offsetY,
      pageHeight,
      verseKey,
    }: {
      height: number;
      offsetY: number;
      pageHeight: number;
      verseKey: string;
    }) => {
      if (!arrivalHighlightVerseKey || verseKey !== arrivalHighlightVerseKey) {
        return;
      }

      const nextViewOffset = Math.max(
        0,
        Math.min(
          Math.round(offsetY - arrivalFocusTopInset),
          Math.max(0, Math.round(pageHeight - anchorHeight))
        )
      );
      updateInitialPageViewOffset(nextViewOffset);
    },
    [arrivalFocusTopInset, arrivalHighlightVerseKey, updateInitialPageViewOffset]
  );

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

    primeVerseDetailsCache({
      verseKey,
      arabicText: activeVerse?.arabicText,
      translationIds,
      translationTexts: activeVerse?.translationTexts,
    });

    void preloadOfflineTafsirSurah({ surahId: parsed.surahId, tafsirIds });

    router.push({
      pathname: '/tafsir/[surahId]/[ayahId]',
      params: {
        surahId: String(parsed.surahId),
        ayahId: String(parsed.verseNumber),
      },
    });
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
      const currentHeight = readExactPageHeightCache(cacheKey);
      const previousRenderedHeight = currentHeight ?? estimatedItemSize;
      if (
        currentHeight !== null &&
        Math.abs(currentHeight - measuredHeight) <= EXACT_HEIGHT_CACHE_EPSILON_PX
      ) {
        return;
      }

      writeExactPageHeightCache(cacheKey, measuredHeight);
      bumpExactHeightCacheVersion();

      if (
        isInitialExactWindowLockedRef.current &&
        pageNumber < initialPageNumberRef.current &&
        Math.abs(measuredHeight - previousRenderedHeight) > EXACT_HEIGHT_CACHE_EPSILON_PX
      ) {
        const list = feedListRef.current;
        const currentOffset = list?.getAbsoluteLastScrollOffset();
        if (list && typeof currentOffset === 'number' && Number.isFinite(currentOffset)) {
          list.scrollToOffset({
            animated: false,
            offset: Math.max(0, currentOffset + (measuredHeight - previousRenderedHeight)),
          });
        }
      }

      logMushafQcfDev('exact-height-cache-store', {
        cacheKey,
        height: measuredHeight,
        pageNumber,
      });
    },
    [estimatedItemSize]
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
      ) : initialPageProbe.errorMessage ? (
        <ErrorState message={initialPageProbe.errorMessage} />
      ) : isExactRenderer ? (
        <MushafSingleDocumentReader
          backgroundPageNumbers={exactReaderBackgroundPageNumbers}
          chapterNamesById={chapterNamesById}
          expectedVersion={activeMushafVersion}
          focusTopInsetPx={arrivalFocusTopInset}
          highlightVerseKey={arrivalHighlightVerseKey}
          initialPageData={initialPageProbe.data}
          initialPageNumber={initialPageNumber}
          mushafScaleStep={settings.mushafScaleStep}
          onSelectionChange={handleMushafSelectionChange}
          onVersePress={handleVersePress}
          packId={selectedMushafId}
          totalPages={totalPages}
        />
      ) : (
        <FlashList
          ref={feedListRef}
          key={`mushaf-feed:${selectedMushafId}:${initialPageNumber}`}
          data={pageNumbers}
          keyExtractor={(item) => `mushaf-page:${selectedMushafId}:${item}`}
          renderItem={({ item }) => {
            const exactHeightCacheKey = isExactRenderer
              ? getExactHeightCacheKeyForPage(item)
              : null;
            const cachedExactHeight =
              exactHeightCacheKey === null ? null : readExactPageHeightCache(exactHeightCacheKey);

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
                highlightVerseKey={
                  item === initialPageNumber ? arrivalHighlightVerseKey ?? undefined : undefined
                }
                onHighlightAnchorResolved={
                  item === initialPageNumber && arrivalHighlightVerseKey
                    ? handleInitialHighlightAnchorResolved
                    : undefined
                }
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
          onScrollBeginDrag={handleMushafScrollBegin}
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
