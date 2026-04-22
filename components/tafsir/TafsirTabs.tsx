import React from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { TafsirHtml } from './TafsirHtml';

const MAX_TAFSIR_TABS = 3;
const TAB_SCROLL_MARGIN = 12;
const SLIDE_DURATION_MS = 220;

type TafsirTab = {
  id: number;
  label: string;
};

type TabLayout = { x: number; width: number };

export type TafsirTabContentState = {
  html: string;
  isLoading: boolean;
  error: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeTafsirIds(ids: number[]): number[] {
  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const rawId of ids ?? []) {
    if (typeof rawId !== 'number' || !Number.isFinite(rawId)) continue;
    const id = Math.trunc(rawId);
    if (id <= 0 || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= MAX_TAFSIR_TABS) break;
  }

  return normalized;
}

function resolveActiveTafsirId(tafsirIds: number[], activeTafsirId?: number): number | undefined {
  if (typeof activeTafsirId === 'number' && tafsirIds.includes(activeTafsirId)) {
    return activeTafsirId;
  }

  return tafsirIds[0];
}

function toLanguageAbbreviation(language: string | undefined): string {
  const normalized = String(language ?? '').trim().toLowerCase();
  if (!normalized) return 'Tf';

  switch (normalized) {
    case 'english':
      return 'En';
    case 'bengali':
    case 'bangla':
      return 'Bn';
    case 'arabic':
      return 'Ar';
    case 'urdu':
      return 'Ur';
    case 'indonesian':
      return 'Id';
    case 'turkish':
      return 'Tr';
    case 'french':
      return 'Fr';
    default: {
      const compact = normalized.replace(/[^a-z]/g, '');
      if (compact.length >= 2) {
        return `${compact[0]!.toUpperCase()}${compact[1]!.toLowerCase()}`;
      }
      return normalized.slice(0, 2).padEnd(2, 'f');
    }
  }
}

function buildTafsirTabs(
  tafsirIds: number[],
  tafsirById: Map<number, { displayName: string; formattedLanguage: string }>
): TafsirTab[] {
  return normalizeTafsirIds(tafsirIds).map((id) => {
    const resource = tafsirById.get(id);
    const name = resource?.displayName ?? `Tafsir ${id}`;
    const languagePrefix = toLanguageAbbreviation(resource?.formattedLanguage);
    return {
      id,
      label: `${languagePrefix}: ${name}`,
    };
  });
}

function SkeletonBar({
  width,
  height = 14,
}: {
  width: number | `${number}%`;
  height?: number;
}): React.JSX.Element {
  return <View className="rounded-full bg-surface dark:bg-surface-dark" style={{ width, height }} />;
}

function TafsirLoadingSkeleton({ minHeight }: { minHeight: number }): React.JSX.Element {
  return (
    <View className="justify-start gap-4 pt-2" style={{ minHeight }}>
      <View className="gap-3">
        <SkeletonBar width="96%" />
        <SkeletonBar width="92%" />
        <SkeletonBar width="98%" />
        <SkeletonBar width="84%" />
      </View>
      <View className="gap-3">
        <SkeletonBar width="94%" />
        <SkeletonBar width="90%" />
        <SkeletonBar width="97%" />
        <SkeletonBar width="78%" />
      </View>
    </View>
  );
}

export function TafsirTabs({
  tafsirIds,
  activeTafsirId,
  onAddTafsir,
  onActiveTafsirChange,
  onTabsTouchStart,
  onTabsTouchEnd,
}: {
  tafsirIds: number[];
  activeTafsirId?: number;
  onAddTafsir?: () => void;
  onActiveTafsirChange?: (tafsirId: number) => void;
  onTabsTouchStart?: () => void;
  onTabsTouchEnd?: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { tafsirById, isLoading: isResourcesLoading, errorMessage } = useTafsirResources({
    enabled: true,
  });

  const tabs = React.useMemo(() => buildTafsirTabs(tafsirIds, tafsirById), [tafsirById, tafsirIds]);
  const resolvedActiveTafsirId = React.useMemo(
    () => resolveActiveTafsirId(normalizeTafsirIds(tafsirIds), activeTafsirId),
    [activeTafsirId, tafsirIds]
  );

  const scrollRef = React.useRef<ScrollView | null>(null);
  const tabLayoutsRef = React.useRef<Partial<Record<number, TabLayout>>>({});
  const scrollXRef = React.useRef(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [contentWidth, setContentWidth] = React.useState(0);

  const scrollActiveTabIntoView = React.useCallback(() => {
    if (typeof resolvedActiveTafsirId !== 'number' || !containerWidth) return;

    const layout = tabLayoutsRef.current[resolvedActiveTafsirId];
    if (!layout) return;

    const currentX = scrollXRef.current;
    const maxX = Math.max(0, contentWidth - containerWidth);
    const leftEdge = currentX + TAB_SCROLL_MARGIN;
    const rightEdge = currentX + containerWidth - TAB_SCROLL_MARGIN;

    let nextX = currentX;
    if (layout.x < leftEdge) {
      nextX = layout.x - TAB_SCROLL_MARGIN;
    } else if (layout.x + layout.width > rightEdge) {
      nextX = layout.x + layout.width - containerWidth + TAB_SCROLL_MARGIN;
    }

    const clampedX = clamp(nextX, 0, maxX);
    if (Math.abs(clampedX - currentX) < 1) return;

    scrollRef.current?.scrollTo({ x: clampedX, y: 0, animated: true });
    scrollXRef.current = clampedX;
  }, [containerWidth, contentWidth, resolvedActiveTafsirId]);

  React.useEffect(() => {
    if (typeof resolvedActiveTafsirId !== 'number') return;
    const frame = requestAnimationFrame(() => {
      scrollActiveTabIntoView();
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedActiveTafsirId, scrollActiveTabIntoView]);

  const handleTabsLayout = React.useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const handleTabsContentSizeChange = React.useCallback((width: number) => {
    setContentWidth(Math.round(width));
  }, []);

  const handleTabsScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollXRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  const handleTabLayout = React.useCallback(
    (tafsirId: number, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      tabLayoutsRef.current[tafsirId] = { x, width };

      if (resolvedActiveTafsirId !== tafsirId) return;
      requestAnimationFrame(() => {
        scrollActiveTabIntoView();
      });
    },
    [resolvedActiveTafsirId, scrollActiveTabIntoView]
  );

  if (isResourcesLoading && tabs.length === 0) {
    return (
      <View className="flex-row items-center gap-3 border-y border-border/60 bg-background px-4 py-4 dark:border-border-dark/30 dark:bg-background-dark">
        <ActivityIndicator color={palette.text} />
        <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsir…</Text>
      </View>
    );
  }

  if (tabs.length === 0) {
    return (
      <View className="border-y border-border/60 bg-background px-4 py-4 dark:border-border-dark/30 dark:bg-background-dark">
        <Text className="text-sm text-muted dark:text-muted-dark">No tafsir resources available.</Text>
      </View>
    );
  }

  const showAddButton = Boolean(onAddTafsir);

  return (
    <View className="border-y border-border/60 bg-background dark:border-border-dark/30 dark:bg-background-dark">
      {errorMessage ? (
        <Text className="px-4 pb-2 pt-3 text-sm text-error dark:text-error-dark">{errorMessage}</Text>
      ) : null}

      <View onLayout={handleTabsLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'stretch', paddingHorizontal: 2 }}
          nestedScrollEnabled
          directionalLockEnabled
          onTouchStart={() => onTabsTouchStart?.()}
          onTouchEnd={() => onTabsTouchEnd?.()}
          onTouchCancel={() => onTabsTouchEnd?.()}
          onScrollBeginDrag={() => onTabsTouchStart?.()}
          onScrollEndDrag={() => onTabsTouchEnd?.()}
          onMomentumScrollEnd={() => onTabsTouchEnd?.()}
          onScroll={handleTabsScroll}
          onContentSizeChange={handleTabsContentSizeChange}
          scrollEventThrottle={16}
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === resolvedActiveTafsirId;
            const showSeparator = index < tabs.length - 1 || showAddButton;

            return (
              <React.Fragment key={tab.id}>
                <Pressable
                  onLayout={(event) => handleTabLayout(tab.id, event)}
                  onPress={() => onActiveTafsirChange?.(tab.id)}
                  className="relative justify-center px-4 pb-3 pt-4"
                  style={({ pressed }) => ({
                    minHeight: 56,
                    opacity: pressed ? 0.82 : 1,
                  })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Select ${tab.label}`}
                >
                  <Text
                    numberOfLines={1}
                    className={[
                      'max-w-[240px] text-base font-semibold',
                      isActive
                        ? 'text-foreground dark:text-foreground-dark'
                        : 'text-muted dark:text-muted-dark',
                    ].join(' ')}
                  >
                    {tab.label}
                  </Text>
                  {isActive ? (
                    <View className="absolute bottom-0 left-3 right-3 h-1 rounded-full bg-foreground dark:bg-foreground-dark" />
                  ) : null}
                </Pressable>

                {showSeparator ? (
                  <View className="my-4 h-6 w-px bg-border/60 dark:bg-border-dark/35" />
                ) : null}
              </React.Fragment>
            );
          })}

          {showAddButton ? (
            <Pressable
              onPress={onAddTafsir}
              className="flex-row items-center justify-center gap-2 px-4 pb-3 pt-4"
              style={({ pressed }) => ({
                minHeight: 56,
                opacity: pressed ? 0.82 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel="Open manage tafsirs"
            >
              <View className="h-5 w-5 items-center justify-center rounded-full border border-border/70 dark:border-border-dark/40">
                <Text className="text-xs font-bold text-muted dark:text-muted-dark">+</Text>
              </View>
              <Text numberOfLines={1} className="text-sm font-semibold text-muted dark:text-muted-dark">
                Add
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

export function TafsirTabPanels({
  verseKey,
  tafsirIds,
  activeTafsirId,
  contentByTafsirId,
}: {
  verseKey: string;
  tafsirIds: number[];
  activeTafsirId?: number;
  contentByTafsirId: Partial<Record<number, TafsirTabContentState>>;
}): React.JSX.Element {
  const { height: viewportHeight } = useWindowDimensions();
  const skeletonMinHeight = React.useMemo(
    () => Math.max(220, Math.round(viewportHeight * 0.42)),
    [viewportHeight]
  );
  const { settings } = useSettings();

  const resolvedTafsirIds = React.useMemo(() => normalizeTafsirIds(tafsirIds), [tafsirIds]);
  const resolvedActiveTafsirId = React.useMemo(
    () => resolveActiveTafsirId(resolvedTafsirIds, activeTafsirId),
    [activeTafsirId, resolvedTafsirIds]
  );
  const activeIndex = React.useMemo(() => {
    if (typeof resolvedActiveTafsirId !== 'number') return -1;
    return resolvedTafsirIds.indexOf(resolvedActiveTafsirId);
  }, [resolvedActiveTafsirId, resolvedTafsirIds]);

  const activeContentState =
    typeof resolvedActiveTafsirId === 'number'
      ? contentByTafsirId[resolvedActiveTafsirId]
      : undefined;
  const isActivePanelLoading =
    typeof resolvedActiveTafsirId === 'number'
      ? activeContentState?.isLoading ?? typeof activeContentState === 'undefined'
      : false;

  const [panelWidth, setPanelWidth] = React.useState(0);
  const [panelHeightsById, setPanelHeightsById] = React.useState<Record<number, number>>({});
  const [lastStableHeight, setLastStableHeight] = React.useState(0);
  const animatedIndex = React.useRef(new Animated.Value(activeIndex >= 0 ? activeIndex : 0)).current;
  const lastAnimatedIndexRef = React.useRef(activeIndex >= 0 ? activeIndex : 0);

  const activeMeasuredHeight =
    typeof resolvedActiveTafsirId === 'number' ? panelHeightsById[resolvedActiveTafsirId] ?? 0 : 0;
  const panelViewportHeight = isActivePanelLoading
    ? Math.max(skeletonMinHeight, lastStableHeight)
    : Math.max(activeMeasuredHeight || lastStableHeight || 0, 1);

  React.useEffect(() => {
    if (activeMeasuredHeight <= 0 || isActivePanelLoading) return;
    setLastStableHeight((current) => (current === activeMeasuredHeight ? current : activeMeasuredHeight));
  }, [activeMeasuredHeight, isActivePanelLoading]);

  React.useEffect(() => {
    const targetIndex = activeIndex >= 0 ? activeIndex : 0;

    if (panelWidth <= 0 || lastAnimatedIndexRef.current === targetIndex) {
      animatedIndex.setValue(targetIndex);
      lastAnimatedIndexRef.current = targetIndex;
      return;
    }

    const animation = Animated.timing(animatedIndex, {
      toValue: targetIndex,
      duration: SLIDE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished) {
        lastAnimatedIndexRef.current = targetIndex;
      }
    });

    return () => {
      animation.stop();
    };
  }, [activeIndex, animatedIndex, panelWidth, verseKey]);

  const handlePanelViewportLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth <= 0) return;
    setPanelWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  const handlePanelLayout = React.useCallback(
    (tafsirId: number, event: LayoutChangeEvent) => {
      const nextHeight = Math.round(event.nativeEvent.layout.height);
      if (nextHeight <= 0) return;

      setPanelHeightsById((current) => {
        if (current[tafsirId] === nextHeight) return current;
        return { ...current, [tafsirId]: nextHeight };
      });

      if (tafsirId === resolvedActiveTafsirId) {
        setLastStableHeight((current) => (current === nextHeight ? current : nextHeight));
      }
    },
    [resolvedActiveTafsirId]
  );

  const renderPanelContent = React.useCallback(
    (tafsirId: number) => {
      const contentState = contentByTafsirId[tafsirId];
      const isLoading = contentState?.isLoading ?? typeof contentState === 'undefined';
      const error = contentState?.error ?? null;
      const html = contentState?.html ?? '';

      return (
        <View
          onLayout={(event) => handlePanelLayout(tafsirId, event)}
          style={panelWidth > 0 ? { width: panelWidth } : undefined}
        >
          {error ? (
            <Text className="text-sm text-error dark:text-error-dark">{error}</Text>
          ) : isLoading ? (
            <TafsirLoadingSkeleton minHeight={Math.max(skeletonMinHeight, lastStableHeight)} />
          ) : (
            <TafsirHtml
              html={html}
              fontSize={settings.tafsirFontSize || 18}
              contentKey={`${verseKey}-${tafsirId}`}
            />
          )}
        </View>
      );
    },
    [contentByTafsirId, handlePanelLayout, lastStableHeight, panelWidth, settings.tafsirFontSize, skeletonMinHeight, verseKey]
  );

  if (resolvedTafsirIds.length === 0 || typeof resolvedActiveTafsirId !== 'number') {
    return (
      <View className="pt-4">
        <Text className="text-sm text-muted dark:text-muted-dark">
          No tafsir resources available.
        </Text>
      </View>
    );
  }

  return (
    <View className="pt-4">
      <View
        onLayout={handlePanelViewportLayout}
        style={{
          minHeight: panelViewportHeight,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {panelWidth <= 0
          ? renderPanelContent(resolvedActiveTafsirId)
          : resolvedTafsirIds.map((tafsirId, index) => {
              const translateX = Animated.multiply(
                Animated.subtract(animatedIndex, index),
                -panelWidth
              );
              const opacity = animatedIndex.interpolate({
                inputRange: [index - 1, index, index + 1],
                outputRange: [0.5, 1, 0.5],
                extrapolate: 'clamp',
              });

              return (
                <Animated.View
                  key={tafsirId}
                  pointerEvents={tafsirId === resolvedActiveTafsirId ? 'auto' : 'none'}
                  style={{
                    left: 0,
                    opacity,
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    transform: [{ translateX }],
                  }}
                >
                  {renderPanelContent(tafsirId)}
                </Animated.View>
              );
            })}
      </View>
    </View>
  );
}
