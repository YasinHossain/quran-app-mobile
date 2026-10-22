import { Clock } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { LastReadCard } from './LastReadCard';
import { LastReadHeader } from './LastReadHeader';
import { buildNormalizedLastReadEntries, type NormalizedLastReadEntry } from './lastReadEntries';
import {
  getLastReadCardWidth,
  getLastReadNumColumns,
  LAST_READ_GRID_GAP,
  LAST_READ_HORIZONTAL_PADDING,
} from './lastReadLayout';

import type { LastReadMap } from '@/types';

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
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const { width: windowWidth } = useWindowDimensions();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const effectiveWidth = containerWidth > 0 ? containerWidth : windowWidth;
  const numColumns = React.useMemo(() => getLastReadNumColumns(effectiveWidth), [effectiveWidth]);
  const listRef = React.useRef<FlatList<NormalizedLastReadEntry> | null>(null);
  const contentContainerStyle = React.useMemo(
    () => ({
      paddingHorizontal: LAST_READ_HORIZONTAL_PADDING / 2,
      paddingBottom: 24 + audioPlayerBarHeight,
    }),
    [audioPlayerBarHeight]
  );

  const cardWidth = React.useMemo(
    () => getLastReadCardWidth(effectiveWidth, numColumns),
    [effectiveWidth, numColumns]
  );

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = Math.round(event.nativeEvent.layout.width);
      if (nextWidth > 0 && Math.abs(nextWidth - containerWidth) > 1) {
        setContainerWidth(nextWidth);
      }
    },
    [containerWidth]
  );

  React.useEffect(() => {
    setContainerWidth(windowWidth);
  }, [windowWidth]);

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
      onLayout={handleLayout}
      data={normalizedEntries}
      keyExtractor={(item) => item.surahId}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? { justifyContent: 'flex-start' } : undefined}
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
                <Text className="text-xs text-muted dark:text-muted-dark">{t('loading_surah')}</Text>
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
        const isLastInRow = numColumns === 1 ? true : (index + 1) % numColumns === 0;

        return (
          <View
            style={{
              width: cardWidth,
              maxWidth: cardWidth,
              flex: numColumns === 1 ? 1 : undefined,
              marginBottom: LAST_READ_GRID_GAP,
              marginEnd: isLastInRow ? 0 : LAST_READ_GRID_GAP,
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
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];

  return (
    <View className="items-center py-16">
      <View className="h-16 w-16 rounded-full bg-surface dark:bg-surface-dark items-center justify-center mb-4">
        <Clock size={32} strokeWidth={2.25} color={palette.muted} />
      </View>
      <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">
        {t('last_read_empty_title')}
      </Text>
      <Text className="text-muted dark:text-muted-dark text-center px-6">
        {t('last_read_empty_description')}
      </Text>
    </View>
  );
}
