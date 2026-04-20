import { FlashList } from '@shopify/flash-list';
import React from 'react';
import {
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

import type { MushafPackId, MushafScaleStep, MushafVerse } from '@/types';

const EXACT_PAGE_LAYOUT_EPSILON_PX = 1;

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
  estimatedHeight,
  errorMessage,
  isActivePage,
  isLoading,
  onLayout,
}: {
  pageNumber: number;
  estimatedHeight: number;
  errorMessage: string | null;
  isActivePage: boolean;
  isLoading: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
}): React.JSX.Element {
  return (
    <View onLayout={onLayout}>
      {errorMessage && isActivePage ? (
        <View
          className="items-center justify-center px-6 py-6"
          style={{ minHeight: Math.max(estimatedHeight, 280) }}
        >
          <Text className="text-center text-sm text-muted dark:text-muted-dark">{errorMessage}</Text>
        </View>
      ) : (
        <MushafWebViewPagePlaceholder
          estimatedHeight={estimatedHeight}
          showLoadingIndicator={isActivePage && isLoading}
        />
      )}
      <View className="items-center px-3 pt-3">
        <View className="w-full max-w-[220px] flex-row items-center justify-center gap-3">
          <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
          <Text className="text-xs font-medium text-muted dark:text-muted-dark">Page {pageNumber}</Text>
          <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
        </View>
      </View>
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
  const [listViewportHeight, setListViewportHeight] = React.useState(0);

  const activePageNumberRef = React.useRef(initialPageNumber);
  const scrollOffsetYRef = React.useRef(0);
  const listViewportHeightRef = React.useRef(0);
  const visiblePageNumbersRef = React.useRef<number[]>([initialPageNumber]);
  const rowYByPageNumberRef = React.useRef(new Map<number, number>());
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 20 }).current;

  const resolvePageHeight = React.useCallback(
    (pageNumber: number): number => getCachedHeight(pageNumber) ?? estimatedHeight,
    [estimatedHeight, getCachedHeight]
  );

  const previousPageNumber = activePageNumber > 1 ? activePageNumber - 1 : null;
  const nextPageNumber = activePageNumber < pageNumbers.length ? activePageNumber + 1 : null;

  const activePage = useMushafPageData({
    packId,
    pageNumber: activePageNumber,
    expectedVersion,
    enabled: true,
  });
  useMushafPageData({
    packId,
    pageNumber: previousPageNumber,
    expectedVersion,
    enabled: previousPageNumber !== null,
  });
  useMushafPageData({
    packId,
    pageNumber: nextPageNumber,
    expectedVersion,
    enabled: nextPageNumber !== null,
  });

  const activePageData =
    activePage.data && activePage.data.pageNumber === activePageNumber ? activePage.data : null;
  const activePageError = activePage.errorMessage;
  const activePageIsLoading = activePage.isLoading || (!activePageData && !activePageError);

  const activeVersesByKey = React.useMemo(
    () => new Map((activePageData?.verses ?? []).map((verse) => [verse.verseKey, verse] as const)),
    [activePageData?.verses]
  );

  const updateActivePageNumber = React.useCallback(() => {
    const visiblePageNumbers = visiblePageNumbersRef.current;
    if (visiblePageNumbers.length === 0) {
      return;
    }

    const viewportCenter = scrollOffsetYRef.current + listViewportHeightRef.current / 2;
    let nextActivePageNumber = visiblePageNumbers[0] ?? activePageNumberRef.current;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const pageNumber of visiblePageNumbers) {
      const rowY = rowYByPageNumberRef.current.get(pageNumber);
      if (rowY === undefined) {
        continue;
      }

      const centerY = rowY + resolvePageHeight(pageNumber) / 2;
      const distance = Math.abs(centerY - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextActivePageNumber = pageNumber;
      }
    }

    if (nextActivePageNumber === activePageNumberRef.current) {
      return;
    }

    activePageNumberRef.current = nextActivePageNumber;
    setActivePageNumber(nextActivePageNumber);
  }, [resolvePageHeight]);

  React.useEffect(() => {
    activePageNumberRef.current = initialPageNumber;
    setActivePageNumber(initialPageNumber);
    visiblePageNumbersRef.current = [initialPageNumber];
  }, [initialPageNumber]);

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
      updateActivePageNumber();
    },
    [updateActivePageNumber]
  );

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextOffsetY = event.nativeEvent.contentOffset.y;
      scrollOffsetYRef.current = nextOffsetY;
      updateActivePageNumber();
    },
    [updateActivePageNumber]
  );

  const handleViewportLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (Math.abs(listViewportHeightRef.current - nextHeight) <= EXACT_PAGE_LAYOUT_EPSILON_PX) {
        return;
      }

      listViewportHeightRef.current = nextHeight;
      setListViewportHeight(nextHeight);
      updateActivePageNumber();
    },
    [updateActivePageNumber]
  );

  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: unknown; isViewable?: boolean | null }> }) => {
      const nextVisiblePageNumbers = viewableItems
        .filter((token) => token.isViewable)
        .map((token) =>
          typeof token.item === 'number'
            ? token.item
            : Number.parseInt(String(token.item ?? ''), 10)
        )
        .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber >= 1)
        .sort((left, right) => left - right);

      if (nextVisiblePageNumbers.length === 0) {
        return;
      }

      visiblePageNumbersRef.current = nextVisiblePageNumbers;
      updateActivePageNumber();
    }
  ).current;

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

  return (
    <View style={styles.container} onLayout={handleViewportLayout}>
      <FlashList
        data={pageNumbers}
        keyExtractor={(item) => `mushaf-page:${packId}:${item}`}
        renderItem={({ item }) => {
          const resolvedHeight = resolvePageHeight(item);
          const isActivePage = item === activePageNumber;
          const shouldRenderActiveWebView =
            isActivePage && activePageData !== null && activePageData.pageNumber === item;

          if (shouldRenderActiveWebView) {
            return (
              <View onLayout={(event) => handleRowLayout(item, event)}>
                <MushafWebViewPage
                  data={activePageData}
                  mushafScaleStep={mushafScaleStep}
                  initialHeightOverride={getCachedHeight(item) ?? undefined}
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
                  onWordPress={handleWordPress}
                />
                <View className="items-center px-3 pt-3">
                  <View className="w-full max-w-[220px] flex-row items-center justify-center gap-3">
                    <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
                    <Text className="text-xs font-medium text-muted dark:text-muted-dark">
                      Page {item}
                    </Text>
                    <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
                  </View>
                </View>
              </View>
            );
          }

          return (
            <ExactPlaceholderRow
              pageNumber={item}
              estimatedHeight={resolvedHeight}
              errorMessage={isActivePage ? activePageError : null}
              isActivePage={isActivePage}
              isLoading={isActivePage && activePageIsLoading}
              onLayout={(event) => handleRowLayout(item, event)}
            />
          );
        }}
        extraData={{
          activePageNumber,
          cacheVersion,
          listViewportHeight,
          mushafScaleStep,
          packId,
        }}
        initialScrollIndex={initialPageIndex}
        drawDistance={Math.max(estimatedHeight * 2, 1200)}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={contentContainerStyle}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScroll={handleScroll}
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
