import { FlashList, type ViewToken } from '@shopify/flash-list';
import React from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';

import { resolveMushafVerseKey, type MushafSelectionPayload } from '@/components/mushaf/mushafWordPayload';
import { MushafWebViewPage, MushafWebViewPagePlaceholder } from '@/components/mushaf/MushafWebViewPage';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { container } from '@/src/core/infrastructure/di/container';

import type { MushafPackId, MushafScaleStep, MushafVerse } from '@/types';

const EXACT_PAGE_LAYOUT_EPSILON_PX = 1;
const EXACT_PAGE_MIN_HEIGHT = 280;
const VISIBLE_PAGE_THRESHOLD_PERCENT = 20;
const DOMINANT_PAGE_THRESHOLD_PERCENT = 65;
const VISIBLE_PAGE_MINIMUM_VIEW_TIME_MS = 32;
const DOMINANT_PAGE_MINIMUM_VIEW_TIME_MS = 120;
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
  chapterNamesById: Map<number, string>;
  contentContainerStyle: ViewStyle;
  cacheVersion: number;
  getCachedHeight: (pageNumber: number) => number | null;
  getHeightCacheKey: (pageNumber: number) => string;
  onHeightResolved: (payload: { cacheKey: string; height: number; pageNumber: number }) => void;
  onInitialPageFirstHeight: (payload: { pageNumber: number; height: number; durationMs: number }) => void;
  onSelectionChange: (payload: MushafSelectionPayload) => void;
  onVersePress: (verse: SharedExactMushafVersePress) => void;
};

type ActivePageSelectionSource =
  | 'visible-range-change'
  | 'dominant-visible-change'
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
  chapterNamesById,
  contentContainerStyle,
  cacheVersion,
  getCachedHeight,
  getHeightCacheKey,
  onHeightResolved,
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
  const dominantVisiblePageNumbersRef = React.useRef<number[]>([]);
  const reconcileActivePageSelectionRef =
    React.useRef<(source: ActivePageSelectionSource) => void>(() => {});
  const scrollOffsetYRef = React.useRef(0);
  const scrollDirectionRef = React.useRef<-1 | 0 | 1>(0);
  const visibleRangeViewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: VISIBLE_PAGE_THRESHOLD_PERCENT,
    minimumViewTime: VISIBLE_PAGE_MINIMUM_VIEW_TIME_MS,
  }).current;
  const dominantViewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: DOMINANT_PAGE_THRESHOLD_PERCENT,
    minimumViewTime: DOMINANT_PAGE_MINIMUM_VIEW_TIME_MS,
  }).current;
  const hostAnchorY = React.useRef(new Animated.Value(0)).current;
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const maxPageNumber = pageNumbers[pageNumbers.length - 1] ?? initialPageNumber;
  const pageRepositoryRef = React.useRef(container.getMushafPageRepository());

  const resolvePageHeight = React.useCallback(
    (pageNumber: number): number => getCachedHeight(pageNumber) ?? estimatedHeight,
    [estimatedHeight, getCachedHeight]
  );

  const syncHostAnchor = React.useCallback(
    (pageNumber: number) => {
      const rowY = rowYByPageNumberRef.current.get(pageNumber);
      if (rowY === undefined) {
        hostAnchorY.setValue(0);
        return;
      }

      hostAnchorY.setValue(rowY);
    },
    [hostAnchorY]
  );

  React.useEffect(() => {
    activePageNumberRef.current = activePageNumber;
    syncHostAnchor(activePageNumber);
    onSelectionChange(createCollapsedSelectionPayload(activePageNumber));

    logSharedExactReaderDev('active-page-selection-reset', {
      activePageNumber,
    });
  }, [activePageNumber, onSelectionChange, syncHostAnchor]);

  React.useEffect(() => {
    activePageNumberRef.current = initialPageNumber;
    pendingPageNumberRef.current = null;
    visiblePageNumbersRef.current = [initialPageNumber];
    dominantVisiblePageNumbersRef.current = [];
    setPendingPageNumber(null);
    setActivePageNumber(initialPageNumber);
  }, [initialPageNumber]);

  const previousPageNumber = activePageNumber > 1 ? activePageNumber - 1 : null;
  const nextPageNumber = activePageNumber < maxPageNumber ? activePageNumber + 1 : null;

  const activePage = useMushafPageData({
    packId,
    pageNumber: activePageNumber,
    expectedVersion,
    enabled: true,
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
  const shouldLoadPendingPage =
    pendingPageNumber !== null &&
    pendingPageNumber !== activePageNumber &&
    pendingPageNumber !== previousPageNumber &&
    pendingPageNumber !== nextPageNumber;
  const pendingPage = useMushafPageData({
    packId,
    pageNumber: pendingPageNumber,
    expectedVersion,
    enabled: shouldLoadPendingPage,
  });

  const activePageData =
    activePage.data && activePage.data.pageNumber === activePageNumber ? activePage.data : null;
  const activePageError = activePage.errorMessage;
  const activePageIsLoading = activePage.isLoading || (!activePageData && !activePageError);

  const activeVersesByKey = React.useMemo(
    () => new Map((activePageData?.verses ?? []).map((verse) => [verse.verseKey, verse] as const)),
    [activePageData?.verses]
  );

  const isPageReady = React.useCallback(
    (pageNumber: number): boolean => {
      if (activePageData?.pageNumber === pageNumber) {
        return true;
      }

      if (previousPage.data?.pageNumber === pageNumber) {
        return true;
      }

      if (nextPage.data?.pageNumber === pageNumber) {
        return true;
      }

      if (pendingPage.data?.pageNumber === pageNumber) {
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
      expectedVersion,
      nextPage.data?.pageNumber,
      packId,
      pendingPage.data?.pageNumber,
      previousPage.data?.pageNumber,
    ]
  );

  const getPageErrorMessage = React.useCallback(
    (pageNumber: number): string | null => {
      if (pageNumber === activePageNumber && activePageError) {
        return activePageError;
      }

      if (pageNumber === previousPageNumber && previousPage.errorMessage) {
        return previousPage.errorMessage;
      }

      if (pageNumber === nextPageNumber && nextPage.errorMessage) {
        return nextPage.errorMessage;
      }

      if (pageNumber === pendingPageNumber && pendingPage.errorMessage) {
        return pendingPage.errorMessage;
      }

      return null;
    },
    [
      activePageError,
      activePageNumber,
      nextPage.errorMessage,
      nextPageNumber,
      pendingPage.errorMessage,
      pendingPageNumber,
      previousPage.errorMessage,
      previousPageNumber,
    ]
  );

  const isPageLoading = React.useCallback(
    (pageNumber: number): boolean => {
      if (pageNumber === activePageNumber) {
        return activePageIsLoading;
      }

      if (pageNumber === previousPageNumber) {
        return previousPage.isLoading;
      }

      if (pageNumber === nextPageNumber) {
        return nextPage.isLoading;
      }

      if (pageNumber === pendingPageNumber) {
        return pendingPage.isLoading;
      }

      return false;
    },
    [
      activePageIsLoading,
      activePageNumber,
      nextPage.isLoading,
      nextPageNumber,
      pendingPage.isLoading,
      pendingPageNumber,
      previousPage.isLoading,
      previousPageNumber,
    ]
  );

  const chooseDesiredActivePageNumber = React.useCallback((): number => {
    const currentPageNumber = activePageNumberRef.current;
    const visiblePageNumbers = visiblePageNumbersRef.current;
    const dominantPageNumbers = dominantVisiblePageNumbersRef.current;

    if (visiblePageNumbers.length === 0) {
      return currentPageNumber;
    }

    if (dominantPageNumbers.includes(currentPageNumber)) {
      return currentPageNumber;
    }

    const dominantCandidate = chooseCandidatePageNumber(
      dominantPageNumbers,
      currentPageNumber,
      scrollDirectionRef.current
    );
    if (dominantCandidate !== null && dominantCandidate !== currentPageNumber) {
      return dominantCandidate;
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
      if (
        currentY !== undefined &&
        Math.abs(currentY - nextY) <= EXACT_PAGE_LAYOUT_EPSILON_PX
      ) {
        return;
      }

      rowYByPageNumberRef.current.set(pageNumber, nextY);

      if (pageNumber === activePageNumberRef.current) {
        syncHostAnchor(pageNumber);
      }
    },
    [syncHostAnchor]
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
    nextPage.data?.pageNumber,
    pendingPage.data?.pageNumber,
    previousPage.data?.pageNumber,
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

  const dominantVisibleChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken<number>> }) => {
      const nextDominantPageNumbers = normalizeVisiblePageNumbers(viewableItems);
      if (arePageListsEqual(dominantVisiblePageNumbersRef.current, nextDominantPageNumbers)) {
        return;
      }

      dominantVisiblePageNumbersRef.current = nextDominantPageNumbers;
      reconcileActivePageSelectionRef.current('dominant-visible-change');
    }
  ).current;

  const viewabilityConfigCallbackPairs = React.useRef([
    {
      viewabilityConfig: visibleRangeViewabilityConfig,
      onViewableItemsChanged: visibleRangeChanged,
    },
    {
      viewabilityConfig: dominantViewabilityConfig,
      onViewableItemsChanged: dominantVisibleChanged,
    },
  ]).current;

  const handleWordPress = React.useCallback(
    (payload: {
      verseKey?: string;
      location?: string;
      wordPosition: number;
    }) => {
      const verseKey = resolveMushafVerseKey(payload);
      if (!verseKey) return;

      const verse = activeVersesByKey.get(verseKey);
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
    [activeVersesByKey, chapterNamesById, onVersePress]
  );

  const hostTranslateY = React.useMemo(
    () => Animated.subtract(hostAnchorY, scrollY),
    [hostAnchorY, scrollY]
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={pageNumbers}
        keyExtractor={(item) => `mushaf-page:${packId}:${item}`}
        renderItem={({ item }) => {
          const isActivePage = item === activePageNumber;
          const renderAnchorOnly =
            isActivePage && activePageData !== null && activePageData.pageNumber === item;
          const pageErrorMessage = renderAnchorOnly ? null : getPageErrorMessage(item);

          return (
            <ExactPlaceholderRow
              pageNumber={item}
              anchorHeight={resolvePageHeight(item)}
              errorMessage={pageErrorMessage}
              renderAnchorOnly={renderAnchorOnly}
              showLoadingIndicator={
                !renderAnchorOnly &&
                !pageErrorMessage &&
                ((isActivePage && activePageIsLoading) ||
                  (item === pendingPageNumber && isPageLoading(item) && !isPageReady(item)))
              }
              onLayout={(event) => handleRowLayout(item, event)}
            />
          );
        }}
        extraData={{
          activePageNumber,
          cacheVersion,
          mushafScaleStep,
          pendingPageNumber,
          packId,
        }}
        initialScrollIndex={initialPageIndex}
        drawDistance={Math.max(estimatedHeight * 2, 1200)}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={contentContainerStyle}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const nextOffsetY = event.nativeEvent.contentOffset.y;
            if (nextOffsetY > scrollOffsetYRef.current) {
              scrollDirectionRef.current = 1;
            } else if (nextOffsetY < scrollOffsetYRef.current) {
              scrollDirectionRef.current = -1;
            }

            scrollOffsetYRef.current = nextOffsetY;
          },
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />

      {activePageData ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.hostContainer,
              {
                transform: [{ translateY: hostTranslateY }],
              },
            ]}
          >
            <MushafWebViewPage
              data={activePageData}
              mushafScaleStep={mushafScaleStep}
              initialHeightOverride={getCachedHeight(activePageNumber) ?? undefined}
              onFirstContentHeight={
                activePageNumber === initialPageNumber
                  ? ({ height, durationMs }) =>
                      onInitialPageFirstHeight({
                        durationMs,
                        height,
                        pageNumber: activePageNumber,
                      })
                  : undefined
              }
              onHeightResolved={({ height }) =>
                onHeightResolved({
                  cacheKey: getHeightCacheKey(activePageNumber),
                  height,
                  pageNumber: activePageNumber,
                })
              }
              onSelectionChange={onSelectionChange}
              onWordPress={handleWordPress}
            />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  hostContainer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
});
