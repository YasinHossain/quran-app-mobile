import { type FlashListRef } from '@shopify/flash-list';
import React from 'react';
import { FlatList, InteractionManager, Platform, type ViewToken } from 'react-native';

import type { SurahVerse } from '@/hooks/useSurahVerses';
import { resolveActiveMushafVersion } from '@/lib/utils/mushafPages';
import { parseVerseKeyNumbers } from '@/lib/utils/verseKey';
import { container } from '@/src/core/infrastructure/di/container';
import type { MushafPackId } from '@/types';

type UseSurahVerseListControllerParams = {
  audioActiveVerseKey?: string | null;
  audioIsPlaying: boolean;
  chapterNumber: number;
  ensureVerseRangeLoaded: (startVerse: number, endVerse: number, paddingPages?: number) => void;
  getVerseByNumber: (verseNumber: number) => SurahVerse | undefined;
  isMushafView: boolean;
  isSettingsOpen: boolean;
  normalizedStartVerse?: number;
  selectedMushafId: MushafPackId;
  selectedMushafRenderer?: string;
  selectedMushafVersion: string;
  setLastRead: (
    surahId: string,
    verseNumber: number,
    verseKey?: string,
    globalVerseId?: number
  ) => void;
  startVerse: number;
  startVerseParam?: string;
  surahId?: string;
  verseCount: number;
};

export function useSurahVerseListController({
  audioActiveVerseKey,
  audioIsPlaying,
  chapterNumber,
  ensureVerseRangeLoaded,
  getVerseByNumber,
  isMushafView,
  isSettingsOpen,
  normalizedStartVerse,
  selectedMushafId,
  selectedMushafRenderer,
  selectedMushafVersion,
  setLastRead,
  startVerse,
  startVerseParam,
  surahId,
  verseCount,
}: UseSurahVerseListControllerParams): {
  flatListRef: React.RefObject<FlatList<number> | null>;
  flashListRef: React.RefObject<FlashListRef<number> | null>;
  handleScrubEnd: () => void;
  handleScrubToVerse: (verseNumber: number) => void;
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: Array<ViewToken> }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  visibleVerseKeyRef: React.MutableRefObject<string | null>;
  visibleVerseNumber: number;
} {
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
    if (selectedMushafRenderer !== 'webview') return;

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
    selectedMushafRenderer,
  ]);

  const lastReadReportedRef = React.useRef<string | null>(null);
  const [visibleVerseNumber, setVisibleVerseNumber] = React.useState(
    normalizedStartVerse ?? 1
  );
  const visibleVerseNumberRef = React.useRef(normalizedStartVerse ?? 1);
  const scrubTargetVerseRef = React.useRef<number | null>(null);
  const scrubFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    visibleVerseNumberRef.current = visibleVerseNumber;
  }, [visibleVerseNumber]);

  React.useEffect(() => {
    lastReadReportedRef.current = null;
    visibleVerseKeyRef.current = null;
    scrubTargetVerseRef.current = null;
    if (scrubFrameRef.current !== null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
    visibleVerseNumberRef.current = normalizedStartVerse ?? 1;
    setVisibleVerseNumber(normalizedStartVerse ?? 1);
  }, [normalizedStartVerse, surahId]);

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
      if (visibleRange && Number.isFinite(targetStartVerse) && targetStartVerse > 0) {
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
      visibleVerseNumberRef.current = verseNumber;
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
      if (autoScrollRetryTimeoutRef.current) {
        clearTimeout(autoScrollRetryTimeoutRef.current);
        autoScrollRetryTimeoutRef.current = null;
      }
      if (scrubFrameRef.current !== null) {
        cancelAnimationFrame(scrubFrameRef.current);
        scrubFrameRef.current = null;
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
    if (!audioIsPlaying) {
      didAutoScrollToAudioVerseRef.current = null;
      autoScrollRetryCountRef.current = 0;
      if (autoScrollRetryTimeoutRef.current) {
        clearTimeout(autoScrollRetryTimeoutRef.current);
        autoScrollRetryTimeoutRef.current = null;
      }
      return;
    }

    const verseKey = audioActiveVerseKey;
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
    audioActiveVerseKey,
    audioIsPlaying,
    autoScrollTick,
    chapterNumber,
    verseCount,
  ]);

  const scrollScrubFrameToVerse = React.useCallback((verseNumber: number) => {
    if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;
    const targetVerseNumber = Math.max(
      1,
      Math.min(Math.trunc(verseNumber), Math.max(1, verseCountRef.current))
    );
    const targetIndex = targetVerseNumber - 1;

    visibleVerseNumberRef.current = targetVerseNumber;
    setVisibleVerseNumber((currentVerseNumber) =>
      currentVerseNumber === targetVerseNumber ? currentVerseNumber : targetVerseNumber
    );
    ensureVerseRangeLoadedRef.current(targetVerseNumber, targetVerseNumber, 1);

    const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
    if (!list) return;

    try {
      list.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0 });
    } catch {
      ensureVerseRangeLoadedRef.current(targetVerseNumber, targetVerseNumber, 2);
    }
  }, []);

  const runScrubFrame = React.useCallback(() => {
    scrubFrameRef.current = null;

    const targetVerseNumber = scrubTargetVerseRef.current;
    if (!targetVerseNumber) return;

    scrollScrubFrameToVerse(targetVerseNumber);
  }, [scrollScrubFrameToVerse]);

  const handleScrubToVerse = React.useCallback(
    (verseNumber: number) => {
      if (!Number.isFinite(verseNumber) || verseNumber <= 0) return;
      const targetVerseNumber = Math.max(
        1,
        Math.min(Math.trunc(verseNumber), Math.max(1, verseCountRef.current))
      );

      scrubTargetVerseRef.current = targetVerseNumber;
      ensureVerseRangeLoadedRef.current(targetVerseNumber, targetVerseNumber, 2);

      if (scrubFrameRef.current === null) {
        scrubFrameRef.current = requestAnimationFrame(runScrubFrame);
      }
    },
    [runScrubFrame]
  );

  const handleScrubEnd = React.useCallback(() => {
    scrubTargetVerseRef.current = null;
    if (scrubFrameRef.current !== null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
  }, []);

  return {
    flatListRef,
    flashListRef,
    handleScrubEnd,
    handleScrubToVerse,
    onViewableItemsChanged,
    viewabilityConfig,
    visibleVerseKeyRef,
    visibleVerseNumber,
  };
}
