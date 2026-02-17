import { Clock } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { LastReadCard } from './LastReadCard';
import { LastReadHeader } from './LastReadHeader';

import type { Chapter, LastReadMap } from '@/types';

type NormalizedLastReadEntry = { surahId: string; verseNumber: number; chapter: Chapter; verseKey?: string };

function getNumColumns(width: number): number {
  const horizontalPadding = 16 * 2;
  const gap = 12;
  const minCardWidth = 176; // ~11rem
  const available = Math.max(0, width - horizontalPadding);
  const columns = Math.floor((available + gap) / (minCardWidth + gap));
  return Math.max(1, Math.min(3, columns || 1));
}

export function LastReadSection({
  lastRead,
  onRemove,
  topContent,
  registerScrollToTop,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
  scrollEventThrottle,
}: {
  lastRead: LastReadMap;
  onRemove: (surahId: string) => void;
  topContent?: React.ReactNode;
  registerScrollToTop?: (handler: (() => void) | null) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { width } = useWindowDimensions();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);
  const listRef = React.useRef<FlatList<NormalizedLastReadEntry> | null>(null);
  const contentContainerStyle = React.useMemo(
    () => ({ paddingHorizontal: 16, paddingBottom: 24 + audioPlayerBarHeight }),
    [audioPlayerBarHeight]
  );

  const { chapters, isLoading: isChaptersLoading, errorMessage: chaptersError } = useChapters();

  const normalizedEntries = React.useMemo(
    () => buildNormalizedLastReadEntries(lastRead, chapters),
    [chapters, lastRead]
  );

  const shouldHoldEmptyState = Object.keys(lastRead).length > 0 && chapters.length === 0 && isChaptersLoading;

  React.useEffect(() => {
    if (!registerScrollToTop) return;
    registerScrollToTop(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => registerScrollToTop(null);
  }, [registerScrollToTop]);

  return (
    <FlatList
      ref={listRef}
      key={numColumns}
      style={{ flex: 1 }}
      data={normalizedEntries}
      keyExtractor={(item) => item.surahId}
      numColumns={numColumns}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      scrollEventThrottle={scrollEventThrottle}
      contentContainerStyle={contentContainerStyle}
      ListHeaderComponent={
        <View>
          {topContent}
          <View className="pt-2 pb-3">
            <LastReadHeader />
            {shouldHoldEmptyState ? (
              <View className="mt-1 flex-row items-center gap-2">
                <ActivityIndicator size="small" color={palette.muted} />
                <Text className="text-xs text-muted dark:text-muted-dark">Loading surah info…</Text>
              </View>
            ) : chaptersError ? (
              <Text className="mt-1 text-xs text-muted dark:text-muted-dark">{chaptersError}</Text>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        shouldHoldEmptyState ? (
          <View className="px-2 pt-2" />
        ) : (
          <LastReadEmptyState />
        )
      }
      renderItem={({ item, index }) => {
        const gap = 12;
        const isLastInRow = numColumns === 1 ? true : (index + 1) % numColumns === 0;

        return (
          <View
            style={{
              flex: 1,
              marginBottom: gap,
              marginRight: isLastInRow ? 0 : gap,
            }}
          >
            <LastReadCard
              surahId={item.surahId}
              verseNumber={item.verseNumber}
              chapter={item.chapter}
              onRemove={() => onRemove(item.surahId)}
            />
          </View>
        );
      }}
    />
  );
}

function LastReadEmptyState(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="items-center py-16">
      <View className="h-16 w-16 rounded-full bg-surface dark:bg-surface-dark items-center justify-center mb-4">
        <Clock size={32} strokeWidth={2.25} color={palette.muted} />
      </View>
      <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">
        No Recent Activity
      </Text>
      <Text className="text-muted dark:text-muted-dark text-center px-6">
        Start reading the Quran and your progress will be automatically tracked here.
      </Text>
    </View>
  );
}

function buildNormalizedLastReadEntries(
  lastRead: LastReadMap,
  chapters: Chapter[]
): NormalizedLastReadEntry[] {
  const entries = Object.entries(lastRead ?? {});
  if (entries.length === 0) return [];

  const sorted = entries.sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const normalized: NormalizedLastReadEntry[] = [];

  for (const [surahId, entry] of sorted) {
    const item = normalizeLastReadEntry(surahId, entry, chapters);
    if (item) {
      normalized.push(item);
      if (normalized.length === 5) break;
    }
  }

  return normalized;
}

function normalizeLastReadEntry(
  surahId: string,
  entry: LastReadMap[string],
  chapters: Chapter[]
): NormalizedLastReadEntry | null {
  const chapter = chapters.find((c) => c.id === Number(surahId));
  if (!chapter) return null;

  const totalVerses = chapter.verses_count || 0;
  const rawVerseNumber = getRawVerseNumber(entry);
  if (!isValidVerseNumber(rawVerseNumber)) return null;
  const verseNumber = clampVerseNumber(rawVerseNumber, totalVerses);

  return {
    surahId,
    verseNumber,
    chapter,
    ...(typeof entry.verseKey === 'string' ? { verseKey: entry.verseKey } : {}),
  };
}

function getRawVerseNumber(entry: LastReadMap[string]): number | undefined {
  const verseNumberFromKeyRaw =
    typeof entry.verseKey === 'string' ? Number(entry.verseKey.split(':')[1]) : undefined;
  const verseNumberFromKey =
    typeof verseNumberFromKeyRaw === 'number' && !Number.isNaN(verseNumberFromKeyRaw)
      ? verseNumberFromKeyRaw
      : undefined;

  return entry.verseNumber ?? verseNumberFromKey ?? entry.verseId;
}

function isValidVerseNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0;
}

function clampVerseNumber(num: number, total: number): number {
  return total > 0 ? Math.min(num, total) : num;
}
