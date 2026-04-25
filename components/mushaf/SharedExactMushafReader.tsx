import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import {
  resolveMushafVerseKey,
  type MushafHighlightAnchorPayload,
  type MushafSelectionPayload,
} from '@/components/mushaf/mushafWordPayload';
import { MushafWebViewPage, MushafWebViewPagePlaceholder } from '@/components/mushaf/MushafWebViewPage';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { container } from '@/src/core/infrastructure/di/container';

import type { MushafPackId, MushafPageData, MushafScaleStep, MushafVerse } from '@/types';

const EXACT_PAGE_MIN_HEIGHT = 280;
const VISIBLE_PAGE_THRESHOLD_PERCENT = 20;
const VISIBLE_PAGE_MINIMUM_VIEW_TIME_MS = 32;
const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;

export type SharedExactMushafVersePress = {
  title: string;
  surahId: number;
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
  translationTexts: string[];
  wordPosition: number;
};

type SharedExactMushafReaderProps = {
  pageNumbers: number[];
  initialPageIndex: number;
  initialPageNumber: number;
  packId: MushafPackId;
  expectedVersion: string;
  mushafScaleStep: MushafScaleStep;
  estimatedHeight: number;
  initialHighlightVerseKey?: string | null;
  initialPageViewOffset?: number;
  chapterNamesById: Map<number, string>;
  contentContainerStyle: ViewStyle;
  cacheVersion: number;
  getCachedHeight: (pageNumber: number) => number | null;
  getHeightCacheKey: (pageNumber: number) => string;
  onHeightResolved: (payload: { cacheKey: string; height: number; pageNumber: number }) => void;
  onInitialHighlightAnchorResolved?: (payload: MushafHighlightAnchorPayload) => void;
  onInitialPageFirstHeight: (payload: { pageNumber: number; height: number; durationMs: number }) => void;
  onSelectionChange: (payload: MushafSelectionPayload) => void;
  onVersePress: (verse: SharedExactMushafVersePress) => void;
};

type ActivePageSelectionSource =
  | 'visible-range-change'
  | 'pending-page-ready';

function createCollapsedSelectionPayload(pageNumber: number): MushafSelectionPayload {
  return {
    isCollapsed: true,
    pageNumber,
    text: '',
    verseKeys: [],
    wordPositions: [],
  };
}

function ExactPageFooter({ pageNumber }: { pageNumber: number }): React.JSX.Element {
  return (
    <View className="items-center px-3 pt-3">
      <View className="w-full max-w-[220px] flex-row items-center justify-center gap-3">
        <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
        <Text className="text-xs font-medium text-muted dark:text-muted-dark">Page {pageNumber}</Text>
        <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
      </View>
    </View>
  );
}

function logSharedExactReaderDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][SharedExactMushafReader] ${event}`, details);
}

function normalizeVisiblePageNumbers(viewableItems: Array<ViewToken<number>>): number[] {
  return Array.from(
    new Set(
      viewableItems
        .filter((token) => token.isViewable)
        .map((token) =>
          typeof token.item === 'number'
            ? token.item
            : Number.parseInt(String(token.item ?? ''), 10)
        )
        .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber >= 1)
        .sort((left, right) => left - right)
    )
  );
}

function arePageListsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function chooseCandidatePageNumber(
  visiblePageNumbers: number[],
  currentPageNumber: number,
  scrollDirection: -1 | 0 | 1
): number | null {
  if (visiblePageNumbers.length === 0) {
    return null;
  }

  if (scrollDirection > 0) {
    return (
      visiblePageNumbers.find((pageNumber) => pageNumber > currentPageNumber) ??
      visiblePageNumbers[visiblePageNumbers.length - 1] ??
      null
    );
  }

  if (scrollDirection < 0) {
    return (
      [...visiblePageNumbers]
        .reverse()
        .find((pageNumber) => pageNumber < currentPageNumber) ??
      visiblePageNumbers[0] ??
      null
    );
  }

  return (
    [...visiblePageNumbers].sort((left, right) => {
      const leftDistance = Math.abs(left - currentPageNumber);
      const rightDistance = Math.abs(right - currentPageNumber);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return left - right;
    })[0] ?? null
  );
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

function ExactPlaceholderRow({
  pageNumber,
  anchorHeight,
  errorMessage,
  renderAnchorOnly,
  showLoadingIndicator,
  onLayout,
}: {
  pageNumber: number;
  anchorHeight: number;
  errorMessage: string | null;
  renderAnchorOnly: boolean;
  showLoadingIndicator: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
}): React.JSX.Element {
  const resolvedAnchorHeight = Math.max(anchorHeight, EXACT_PAGE_MIN_HEIGHT);

  return (
    <View onLayout={onLayout}>
      {errorMessage ? (
        <View
          className="items-center justify-center px-6 py-6"
          style={{ minHeight: resolvedAnchorHeight }}
        >
          <Text className="text-center text-sm text-muted dark:text-muted-dark">{errorMessage}</Text>
        </View>
      ) : renderAnchorOnly ? (
        <View pointerEvents="none" style={{ height: resolvedAnchorHeight }} />
      ) : (
        <MushafWebViewPagePlaceholder
          estimatedHeight={resolvedAnchorHeight}
          showLoadingIndicator={showLoadingIndicator}
        />
      )}
      <ExactPageFooter pageNumber={pageNumber} />
    </View>
  );
}

export function SharedExactMushafReader({
  pageNumbers,
  initialPageIndex,
  initialPageNumber,
  packId,
  expectedVersion,
  mushafScaleStep,
  estimatedHeight,
  initialHighlightVerseKey,
  initialPageViewOffset = 0,
  chapterNamesById,
  contentContainerStyle,
  cacheVersion,
  getCachedHeight,
  getHeightCacheKey,
  onHeightResolved,
  onInitialHighlightAnchorResolved,
  onInitialPageFirstHeight,
  onSelectionChange,
  onVersePress,
}: SharedExactMushafReaderProps): React.JSX.Element {
  const [activePageNumber, setActivePageNumber] = React.useState(initialPageNumber);
  const [pendingPageNumber, setPendingPageNumber] = React.useState<number | null>(null);
  const activePageNumberRef = React.useRef(initialPageNumber);
  const pendingPageNumberRef = React.useRef<number | null>(null);
  const rowYByPageNumberRef = React.useRef(new Map<number, number>());
  const visiblePageNumbersRef = React.useRef<number[]>([initialPageNumber]);
  const reconcileActivePageSelectionRef =
    React.useRef<(source: ActivePageSelectionSource) => void>(() => {});
  const scrollOffsetYRef = React.useRef(0);
  const scrollDirectionRef = React.useRef<-1 | 0 | 1>(0);
  const visibleRangeViewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: VISIBLE_PAGE_THRESHOLD_PERCENT,
    minimumViewTime: VISIBLE_PAGE_MINIMUM_VIEW_TIME_MS,
  }).current;
  const listRef = React.useRef<FlashListRef<number> | null>(null);
  const initialPageScrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedInitialPageScrollRef = React.useRef(false);
  const initialAnchorScrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedInitialAnchorScrollRef = React.useRef(false);
  const maxPageNumber = pageNumbers[pageNumbers.length - 1] ?? initialPageNumber;
  const pageRepositoryRef = React.useRef(container.getMushafPageRepository());
  const [residentPageDataByNumber, setResidentPageDataByNumber] = React.useState<
    Map<number, MushafPageData>
  >(() => new Map());
  const residentPageDataByNumberRef = React.useRef(residentPageDataByNumber);

  const resolvePageHeight = React.useCallback(
    (pageNumber: number): number => getCachedHeight(pageNumber) ?? estimatedHeight,
    [estimatedHeight, getCachedHeight]
  );

  React.useEffect(() => {
    activePageNumberRef.current = activePageNumber;
    onSelectionChange(createCollapsedSelectionPayload(activePageNumber));

    logSharedExactReaderDev('active-page-selection-reset', {
      activePageNumber,
    });
  }, [activePageNumber, onSelectionChange]);

  React.useEffect(() => {
    activePageNumberRef.current = initialPageNumber;
    pendingPageNumberRef.current = null;
    rowYByPageNumberRef.current.clear();
    visiblePageNumbersRef.current = [initialPageNumber];
    hasAppliedInitialPageScrollRef.current = false;
    hasAppliedInitialAnchorScrollRef.current = false;
    if (initialPageScrollTimeoutRef.current) {
      clearTimeout(initialPageScrollTimeoutRef.current);
      initialPageScrollTimeoutRef.current = null;
    }
    if (initialAnchorScrollTimeoutRef.current) {
      clearTimeout(initialAnchorScrollTimeoutRef.current);
      initialAnchorScrollTimeoutRef.current = null;
    }
    setPendingPageNumber(null);
    setActivePageNumber(initialPageNumber);
  }, [initialPageNumber]);

  React.useEffect(() => {
    residentPageDataByNumberRef.current = residentPageDataByNumber;
  }, [residentPageDataByNumber]);

  React.useEffect(() => {
    residentPageDataByNumberRef.current = new Map();
    setResidentPageDataByNumber(new Map());
  }, [expectedVersion, packId]);

  React.useEffect(() => {
    return () => {
      if (initialPageScrollTimeoutRef.current) {
        clearTimeout(initialPageScrollTimeoutRef.current);
      }
      if (initialAnchorScrollTimeoutRef.current) {
        clearTimeout(initialAnchorScrollTimeoutRef.current);
      }
    };
  }, []);

  const beforePreviousPageNumber = activePageNumber > 2 ? activePageNumber - 2 : null;
  const previousPageNumber = activePageNumber > 1 ? activePageNumber - 1 : null;
  const nextPageNumber = activePageNumber < maxPageNumber ? activePageNumber + 1 : null;
  const afterNextPageNumber = activePageNumber < maxPageNumber - 1 ? activePageNumber + 2 : null;

  const activePage = useMushafPageData({
    packId,
    pageNumber: activePageNumber,
    expectedVersion,
    enabled: true,
  });
  const beforePreviousPage = useMushafPageData({
    packId,
    pageNumber: beforePreviousPageNumber,
    expectedVersion,
    enabled: beforePreviousPageNumber !== null,
  });
  const previousPage = useMushafPageData({
    packId,
    pageNumber: previousPageNumber,
    expectedVersion,
    enabled: previousPageNumber !== null,
  });
  const nextPage = useMushafPageData({
    packId,
    pageNumber: nextPageNumber,
    expectedVersion,
    enabled: nextPageNumber !== null,
  });
  const afterNextPage = useMushafPageData({
    packId,
    pageNumber: afterNextPageNumber,
    expectedVersion,
    enabled: afterNextPageNumber !== null,
  });
  const shouldLoadPendingPage =
    pendingPageNumber !== null &&
    pendingPageNumber !== activePageNumber &&
    pendingPageNumber !== beforePreviousPageNumber &&
    pendingPageNumber !== previousPageNumber &&
    pendingPageNumber !== nextPageNumber &&
    pendingPageNumber !== afterNextPageNumber;
  const pendingPage = useMushafPageData({
    packId,
    pageNumber: pendingPageNumber,
    expectedVersion,
    enabled: shouldLoadPendingPage,
  });

  const activePageData =
    activePage.data && activePage.data.pageNumber === activePageNumber ? activePage.data : null;
  const beforePreviousPageData =
    beforePreviousPageNumber !== null &&
    beforePreviousPage.data?.pageNumber === beforePreviousPageNumber
      ? beforePreviousPage.data
      : null;
  const previousPageData =
    previousPageNumber !== null && previousPage.data?.pageNumber === previousPageNumber
      ? previousPage.data
      : null;
  const nextPageData =
    nextPageNumber !== null && nextPage.data?.pageNumber === nextPageNumber
      ? nextPage.data
      : null;
  const afterNextPageData =
    afterNextPageNumber !== null && afterNextPage.data?.pageNumber === afterNextPageNumber
      ? afterNextPage.data
      : null;
  const pendingPageData =
    pendingPageNumber !== null && pendingPage.data?.pageNumber === pendingPageNumber
      ? pendingPage.data
      : null;
  const activePageError = activePage.errorMessage;

  const freshLoadedPageData = React.useMemo(
    () =>
      [
        beforePreviousPageData,
        previousPageData,
        activePageData,
        nextPageData,
        afterNextPageData,
        pendingPageData,
      ].filter((pageData): pageData is MushafPageData => pageData !== null),
    [
      activePageData,
      afterNextPageData,
      beforePreviousPageData,
      nextPageData,
      pendingPageData,
      previousPageData,
    ]
  );

  const loadedPageDataByNumber = React.useMemo(() => {
    const pageDataByNumber = new Map(residentPageDataByNumber);
    for (const pageData of freshLoadedPageData) {
      pageDataByNumber.set(pageData.pageNumber, pageData);
    }
    return pageDataByNumber;
  }, [freshLoadedPageData, residentPageDataByNumber]);

  React.useEffect(() => {
    if (freshLoadedPageData.length === 0) {
      return;
    }

    setResidentPageDataByNumber((current) => {
      let didChange = false;
      const next = new Map(current);

      for (const pageData of freshLoadedPageData) {
        const existing = next.get(pageData.pageNumber);
        if (
          existing?.pack.packId === pageData.pack.packId &&
          existing.pack.version === pageData.pack.version
        ) {
          continue;
        }

        next.set(pageData.pageNumber, pageData);
        didChange = true;
      }

      if (!didChange) {
        return current;
      }

      residentPageDataByNumberRef.current = next;
      return next;
    });
  }, [freshLoadedPageData]);

  const isPageReady = React.useCallback(
    (pageNumber: number): boolean => {
      if (activePageData?.pageNumber === pageNumber) {
        return true;
      }

      if (beforePreviousPageData?.pageNumber === pageNumber) {
        return true;
      }

      if (previousPageData?.pageNumber === pageNumber) {
        return true;
      }

      if (nextPageData?.pageNumber === pageNumber) {
        return true;
      }

      if (afterNextPageData?.pageNumber === pageNumber) {
        return true;
      }

      if (pendingPageData?.pageNumber === pageNumber) {
        return true;
      }

      if (residentPageDataByNumberRef.current.has(pageNumber)) {
        return true;
      }

      return (
        pageRepositoryRef.current.peekCachedPage({
          packId,
          pageNumber,
          expectedVersion,
        }) !== null
      );
    },
    [
      activePageData?.pageNumber,
      afterNextPageData?.pageNumber,
      beforePreviousPageData?.pageNumber,
      expectedVersion,
      nextPageData?.pageNumber,
      packId,
      pendingPageData?.pageNumber,
      previousPageData?.pageNumber,
    ]
  );

  const getPageErrorMessage = React.useCallback(
    (pageNumber: number): string | null => {
      if (pageNumber === activePageNumber && activePageError) {
        return activePageError;
      }

      if (pageNumber === beforePreviousPageNumber && beforePreviousPage.errorMessage) {
        return beforePreviousPage.errorMessage;
      }

      if (pageNumber === previousPageNumber && previousPage.errorMessage) {
        return previousPage.errorMessage;
      }

      if (pageNumber === nextPageNumber && nextPage.errorMessage) {
        return nextPage.errorMessage;
      }

      if (pageNumber === afterNextPageNumber && afterNextPage.errorMessage) {
        return afterNextPage.errorMessage;
      }

      if (pageNumber === pendingPageNumber && pendingPage.errorMessage) {
        return pendingPage.errorMessage;
      }

      return null;
    },
    [
      activePageError,
      activePageNumber,
      afterNextPage.errorMessage,
      afterNextPageNumber,
      beforePreviousPage.errorMessage,
      beforePreviousPageNumber,
      nextPage.errorMessage,
      nextPageNumber,
      pendingPage.errorMessage,
      pendingPageNumber,
      previousPage.errorMessage,
      previousPageNumber,
    ]
  );

  const chooseDesiredActivePageNumber = React.useCallback((): number => {
    const currentPageNumber = activePageNumberRef.current;
    const visiblePageNumbers = visiblePageNumbersRef.current;

    if (visiblePageNumbers.length === 0) {
      return currentPageNumber;
    }

    if (visiblePageNumbers.includes(currentPageNumber)) {
      return currentPageNumber;
    }

    return (
      chooseCandidatePageNumber(
        visiblePageNumbers,
        currentPageNumber,
        scrollDirectionRef.current
      ) ?? currentPageNumber
    );
  }, []);

  const commitActivePageNumber = React.useCallback(
    (nextPageNumber: number, source: ActivePageSelectionSource) => {
      const previousActivePageNumber = activePageNumberRef.current;
      if (nextPageNumber === previousActivePageNumber) {
        return;
      }

      pendingPageNumberRef.current = null;
      setPendingPageNumber(null);
      activePageNumberRef.current = nextPageNumber;
      setActivePageNumber(nextPageNumber);

      logSharedExactReaderDev('active-page-committed', {
        nextPageNumber,
        previousActivePageNumber,
        source,
      });
    },
    []
  );

  const reconcileActivePageSelection = React.useCallback(
    (source: ActivePageSelectionSource) => {
      const currentPageNumber = activePageNumberRef.current;
      const desiredPageNumber = chooseDesiredActivePageNumber();

      if (desiredPageNumber === currentPageNumber) {
        if (pendingPageNumberRef.current !== null) {
          pendingPageNumberRef.current = null;
          setPendingPageNumber(null);
        }
        return;
      }

      if (!isPageReady(desiredPageNumber)) {
        if (pendingPageNumberRef.current !== desiredPageNumber) {
          pendingPageNumberRef.current = desiredPageNumber;
          setPendingPageNumber(desiredPageNumber);
          logSharedExactReaderDev('active-page-pending', {
            currentPageNumber,
            desiredPageNumber,
            source,
          });
        }

        const pendingErrorMessage = getPageErrorMessage(desiredPageNumber);
        if (pendingErrorMessage) {
          logSharedExactReaderDev('active-page-pending-error', {
            currentPageNumber,
            desiredPageNumber,
            errorMessage: pendingErrorMessage,
            source,
          });
        }
        return;
      }

      commitActivePageNumber(desiredPageNumber, source);
    },
    [chooseDesiredActivePageNumber, commitActivePageNumber, getPageErrorMessage, isPageReady]
  );

  React.useEffect(() => {
    reconcileActivePageSelectionRef.current = reconcileActivePageSelection;
  }, [reconcileActivePageSelection]);

  const handleRowLayout = React.useCallback(
    (pageNumber: number, event: LayoutChangeEvent) => {
      const nextY = event.nativeEvent.layout.y;
      const currentY = rowYByPageNumberRef.current.get(pageNumber);
      if (currentY !== undefined && Math.abs(currentY - nextY) <= 1) {
        return;
      }

      rowYByPageNumberRef.current.set(pageNumber, nextY);
    },
    []
  );

  React.useEffect(() => {
    pendingPageNumberRef.current = pendingPageNumber;
  }, [pendingPageNumber]);

  React.useEffect(() => {
    if (pendingPageNumberRef.current === null) {
      return;
    }

    reconcileActivePageSelection('pending-page-ready');
  }, [
    afterNextPageData?.pageNumber,
    beforePreviousPageData?.pageNumber,
    nextPageData?.pageNumber,
    pendingPageData?.pageNumber,
    previousPageData?.pageNumber,
    reconcileActivePageSelection,
  ]);

  const visibleRangeChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken<number>> }) => {
      const nextVisiblePageNumbers = normalizeVisiblePageNumbers(viewableItems);
      if (nextVisiblePageNumbers.length === 0) {
        return;
      }

      if (arePageListsEqual(visiblePageNumbersRef.current, nextVisiblePageNumbers)) {
        return;
      }

      visiblePageNumbersRef.current = nextVisiblePageNumbers;
      reconcileActivePageSelectionRef.current('visible-range-change');
    }
  ).current;

  const handleWordPress = React.useCallback(
    (
      pageData: NonNullable<typeof activePageData>,
      payload: {
        verseKey?: string;
        location?: string;
        wordPosition: number;
      }
    ) => {
      const verseKey = resolveMushafVerseKey(payload);
      if (!verseKey) return;

      const verse = pageData.verses.find((candidate) => candidate.verseKey === verseKey);
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
    [chapterNamesById, onVersePress]
  );

  React.useEffect(() => {
    if (hasAppliedInitialPageScrollRef.current) {
      return;
    }

    if (initialPageScrollTimeoutRef.current) {
      clearTimeout(initialPageScrollTimeoutRef.current);
      initialPageScrollTimeoutRef.current = null;
    }

    const scrollToInitialPage = (attempt: number) => {
      const list = listRef.current;
      if (!list) {
        if (attempt >= 5) {
          return;
        }
        initialPageScrollTimeoutRef.current = setTimeout(
          () => scrollToInitialPage(attempt + 1),
          80
        );
        return;
      }

      list
        .scrollToIndex({
          animated: false,
          index: initialPageIndex,
          viewOffset: 0,
          viewPosition: 0,
        })
        .then(() => {
          hasAppliedInitialPageScrollRef.current = true;
        })
        .catch(() => {
          if (attempt >= 5) {
            return;
          }
          initialPageScrollTimeoutRef.current = setTimeout(
            () => scrollToInitialPage(attempt + 1),
            80
          );
        });
    };

    initialPageScrollTimeoutRef.current = setTimeout(() => scrollToInitialPage(0), 0);
  }, [initialPageIndex]);

  React.useEffect(() => {
    if (!initialHighlightVerseKey) {
      return;
    }

    if (hasAppliedInitialAnchorScrollRef.current) {
      return;
    }

    const normalizedOffset = Math.max(0, Math.round(initialPageViewOffset));
    if (normalizedOffset <= 0) {
      return;
    }

    if (initialAnchorScrollTimeoutRef.current) {
      clearTimeout(initialAnchorScrollTimeoutRef.current);
      initialAnchorScrollTimeoutRef.current = null;
    }

    const scrollToInitialAnchor = (attempt: number) => {
      const list = listRef.current;
      const rowY = rowYByPageNumberRef.current.get(initialPageNumber);
      if (!list || rowY === undefined) {
        if (attempt >= 3) {
          return;
        }
        initialAnchorScrollTimeoutRef.current = setTimeout(
          () => scrollToInitialAnchor(attempt + 1),
          90
        );
        return;
      }

      list
        .scrollToOffset({
          animated: false,
          offset: Math.max(0, rowY + normalizedOffset),
        });
      hasAppliedInitialAnchorScrollRef.current = true;
    };

    initialAnchorScrollTimeoutRef.current = setTimeout(() => scrollToInitialAnchor(0), 0);
  }, [initialHighlightVerseKey, initialPageNumber, initialPageViewOffset]);

  return (
    <View style={styles.container}>
      <FlashList
        ref={listRef}
        data={pageNumbers}
        keyExtractor={(item) => `mushaf-page:${packId}:${item}`}
        renderItem={({ item }) => {
          const rowPageData = loadedPageDataByNumber.get(item) ?? null;
          const pageErrorMessage = rowPageData ? null : getPageErrorMessage(item);

          if (rowPageData) {
            const rowHighlightVerseKey =
              item === initialPageNumber && initialHighlightVerseKey
                ? initialHighlightVerseKey
                : undefined;
            return (
              <View onLayout={(event) => handleRowLayout(item, event)}>
                <MushafWebViewPage
                  data={rowPageData}
                  mushafScaleStep={mushafScaleStep}
                  highlightVerseKey={rowHighlightVerseKey}
                  initialHeightOverride={getCachedHeight(item) ?? undefined}
                  onHighlightAnchorResolved={
                    rowHighlightVerseKey ? onInitialHighlightAnchorResolved : undefined
                  }
                  onFirstContentHeight={
                    item === initialPageNumber
                      ? ({ height, durationMs }) =>
                          onInitialPageFirstHeight({
                            durationMs,
                            height,
                            pageNumber: item,
                          })
                      : undefined
                  }
                  onHeightResolved={({ height }) =>
                    onHeightResolved({
                      cacheKey: getHeightCacheKey(item),
                      height,
                      pageNumber: item,
                    })
                  }
                  onSelectionChange={onSelectionChange}
                  onWordPress={(payload) => handleWordPress(rowPageData, payload)}
                />
                <ExactPageFooter pageNumber={item} />
              </View>
            );
          }

          return (
            <ExactPlaceholderRow
              pageNumber={item}
              anchorHeight={resolvePageHeight(item)}
              errorMessage={pageErrorMessage}
              renderAnchorOnly={false}
              showLoadingIndicator={false}
              onLayout={(event) => handleRowLayout(item, event)}
            />
          );
        }}
        extraData={{
          activePageNumber,
          cacheVersion,
          mushafScaleStep,
          loadedPageNumbers: Array.from(loadedPageDataByNumber.keys()).join(','),
          pendingPageNumber,
          packId,
        }}
        initialScrollIndex={initialPageIndex}
        drawDistance={Math.max(estimatedHeight * 5, 3600)}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={contentContainerStyle}
        maintainVisibleContentPosition={{ disabled: true }}
        viewabilityConfig={visibleRangeViewabilityConfig}
        onViewableItemsChanged={visibleRangeChanged}
        removeClippedSubviews={false}
        onScroll={(event) => {
          const nextOffsetY = event.nativeEvent.contentOffset.y;
          if (nextOffsetY > scrollOffsetYRef.current) {
            scrollDirectionRef.current = 1;
          } else if (nextOffsetY < scrollOffsetYRef.current) {
            scrollDirectionRef.current = -1;
          }

          scrollOffsetYRef.current = nextOffsetY;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
