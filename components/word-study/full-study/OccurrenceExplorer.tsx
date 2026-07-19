import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Info,
  RotateCw,
  X,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { getPosLabel } from '@/components/word-study/wordQuickSheetModel';
import type {
  Lemma,
  PaginatedWordOccurrences,
  WordAnalysis,
  WordOccurrence,
  WordOccurrenceScope,
} from '@/src/core/domain/word-study';
import {
  WordStudyQueryCancelledError,
} from '@/src/core/infrastructure/word-study/SQLiteWordStudyRepository';
import { container } from '@/src/core/infrastructure/di/container';

import {
  buildOccurrenceQuery,
  buildRootFamilyLemmaQuery,
  getOccurrenceCounters,
  getOccurrenceFilters,
  getOccurrenceGloss,
  getOccurrencePageLabel,
  orderRootFamilyLemmas,
} from './occurrenceExplorerModel';
import { OccurrenceGuideSheet } from './OccurrenceGuideSheet';

type Palette = (typeof Colors)['light'];
type PageState =
  | { status: 'loading' }
  | { status: 'ready'; page: PaginatedWordOccurrences; refreshing: boolean }
  | { status: 'error'; message: string };
type RootFamilyState =
  | { status: 'loading' }
  | { status: 'ready'; lemmas: readonly Lemma[] }
  | { status: 'error'; message: string };

const MAX_EXPANDED_FAMILY_RESULTS_HEIGHT_FLOOR = 720;

function formatOccurrenceCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'occurrence' : 'occurrences'}`;
}

export function OccurrenceExplorer({
  analysis,
  palette,
  onOpenReader,
  onRequestScrollToFilters,
}: {
  analysis: WordAnalysis;
  palette: Palette;
  onOpenReader: (occurrence: WordOccurrence) => void;
  onRequestScrollToFilters?: (offsetY: number, animated: boolean) => void;
}): React.JSX.Element {
  const [scope, setScope] = React.useState<WordOccurrenceScope>('surface');
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = React.useState<Array<string | undefined>>([]);
  const [surfaceCount, setSurfaceCount] = React.useState<number | undefined>();
  const [rootFamilyExpanded, setRootFamilyExpanded] = React.useState(true);
  const [rootFamilyState, setRootFamilyState] = React.useState<RootFamilyState>({ status: 'loading' });
  const [rootFamilyRetryNonce, setRootFamilyRetryNonce] = React.useState(0);
  const [lemmaOverride, setLemmaOverride] = React.useState<Lemma | null>(null);
  const [resultsHeightFloor, setResultsHeightFloor] = React.useState(0);
  const [pageState, setPageState] = React.useState<PageState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);
  const requestIdRef = React.useRef(0);
  const filtersOffsetYRef = React.useRef<number | null>(null);
  const rootFamilyOffsetYRef = React.useRef<number | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const filters = React.useMemo(() => getOccurrenceFilters(analysis), [analysis]);
  const effectiveScope = filters.some((filter) => filter.scope === scope && filter.enabled)
    ? scope
    : 'surface';
  const root = analysis.root.status === 'available' ? analysis.root.value : null;
  const selectedLemmaId = analysis.lemma.status === 'available' ? analysis.lemma.value.id : undefined;

  React.useEffect(() => {
    setScope('surface');
    setCursor(undefined);
    setCursorHistory([]);
    setSurfaceCount(undefined);
    setRootFamilyExpanded(true);
    setLemmaOverride(null);
    setResultsHeightFloor(0);
  }, [analysis.location.locationKey]);

  React.useEffect(() => {
    if (!root) {
      setRootFamilyState({ status: 'ready', lemmas: [] });
      return;
    }
    const controller = new AbortController();
    setRootFamilyState({ status: 'loading' });
    void container
      .getWordStudyRepository()
      .findLemmasByRoot(root.id, { signal: controller.signal })
      .then((lemmas) => {
        if (controller.signal.aborted) return;
        setRootFamilyState({
          status: 'ready',
          lemmas: orderRootFamilyLemmas(lemmas, selectedLemmaId),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof WordStudyQueryCancelledError) return;
        setRootFamilyState({
          status: 'error',
          message: 'The forms in this root could not be read from the installed study pack.',
        });
      });
    return () => controller.abort();
  }, [root, rootFamilyRetryNonce, selectedLemmaId]);

  React.useEffect(() => {
    const controller = new AbortController();
    const surfaceQuery = buildOccurrenceQuery(analysis, 'surface');
    void container
      .getWordStudyRepository()
      .findOccurrences({ ...surfaceQuery, limit: 1 }, { signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted) setSurfaceCount(page.pageInfo.totalCount);
      })
      .catch(() => {
        // The active page keeps its own retry state; an unavailable count remains visibly pending.
      });
    return () => controller.abort();
  }, [analysis, retryNonce]);

  React.useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setPageState((current) =>
      current.status === 'ready'
        ? { ...current, refreshing: true }
        : { status: 'loading' }
    );

    const query =
      effectiveScope === 'lemma' && lemmaOverride
        ? buildRootFamilyLemmaQuery(lemmaOverride, cursor)
        : buildOccurrenceQuery(analysis, effectiveScope, cursor);
    void container
      .getWordStudyRepository()
      .findOccurrences(query, {
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (effectiveScope === 'surface') setSurfaceCount(page.pageInfo.totalCount);
        setPageState({ status: 'ready', page, refreshing: false });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current ||
          error instanceof WordStudyQueryCancelledError
        ) {
          return;
        }
        setPageState({
          status: 'error',
          message: 'Occurrences could not be read from the installed offline study pack.',
        });
      });

    return () => controller.abort();
  }, [analysis, cursor, effectiveScope, lemmaOverride, retryNonce]);

  const scrollToFilters = React.useCallback(() => {
    requestAnimationFrame(() => {
      const offsetY = filtersOffsetYRef.current;
      if (offsetY !== null) onRequestScrollToFilters?.(Math.max(0, offsetY - 12), !reduceMotion);
    });
  }, [onRequestScrollToFilters, reduceMotion]);

  const selectScope = React.useCallback((nextScope: WordOccurrenceScope) => {
    setLemmaOverride(null);
    setScope(nextScope);
    setCursor(undefined);
    setCursorHistory([]);
  }, []);

  const selectCounter = React.useCallback((counterKey: 'surface' | 'lemma' | 'root' | 'root-lemma-family') => {
    if (counterKey === 'root-lemma-family') {
      setRootFamilyExpanded(true);
      requestAnimationFrame(() => {
        const offsetY = rootFamilyOffsetYRef.current;
        if (offsetY !== null) onRequestScrollToFilters?.(Math.max(0, offsetY - 12), !reduceMotion);
      });
      return;
    }
    selectScope(counterKey);
    scrollToFilters();
  }, [onRequestScrollToFilters, reduceMotion, scrollToFilters, selectScope]);

  const selectRootFamilyLemma = React.useCallback((lemma: Lemma) => {
    setLemmaOverride(lemma);
    setScope('lemma');
    setCursor(undefined);
    setCursorHistory([]);
    scrollToFilters();
  }, [scrollToFilters]);

  const toggleRootFamily = React.useCallback(() => {
    setRootFamilyExpanded((value) => !value);
  }, []);

  const showNextPage = React.useCallback((nextCursor: string) => {
    setCursorHistory((history) => [...history, cursor]);
    setCursor(nextCursor);
  }, [cursor]);

  const showPreviousPage = React.useCallback(() => {
    setCursorHistory((history) => {
      const previousCursor = history.at(-1);
      setCursor(previousCursor);
      return history.slice(0, -1);
    });
  }, []);

  const counters = getOccurrenceCounters(analysis, surfaceCount);
  const readyPage = pageState.status === 'ready' ? pageState.page : null;
  const isPageRefreshing = pageState.status === 'ready' && pageState.refreshing;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: palette.text }]}>Explore occurrences</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About occurrence counts and root-family forms"
          accessibilityHint="Opens occurrence information"
          hitSlop={8}
          onPress={() => setIsGuideOpen(true)}
          style={styles.infoButton}
        >
          <Info color={palette.tint} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={[styles.counterGrid, { backgroundColor: palette.surface }]}>
        {counters.length > 1 ? (
          <View pointerEvents="none" style={[styles.counterVerticalDivider, { backgroundColor: palette.border }]} />
        ) : null}
        {counters.length > 2 ? (
          <View pointerEvents="none" style={[styles.counterHorizontalDivider, { backgroundColor: palette.border }]} />
        ) : null}
        {counters.map((counter) => (
          <View key={counter.key} style={styles.counterCell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${counter.value === undefined ? 'Loading' : counter.value.toLocaleString()} ${counter.label}. ${counter.key === 'root-lemma-family' ? 'Show root-family forms' : `Show ${counter.label.toLowerCase()} occurrences`}`}
              accessibilityState={counter.key === 'root-lemma-family'
                ? { expanded: rootFamilyExpanded }
                : { selected: effectiveScope === counter.key && !lemmaOverride }}
              onPress={() => selectCounter(counter.key)}
              style={({ pressed }) => [
                StyleSheet.absoluteFill,
                { backgroundColor: pressed ? palette.interactive : 'transparent' },
              ]}
            />
            <View pointerEvents="none" style={styles.counterContent}>
              <Text style={[styles.counterValue, { color: palette.tint }]}>
                {counter.value === undefined ? '…' : counter.value.toLocaleString()}
              </Text>
              <Text style={[styles.counterLabel, { color: palette.text }]}>{counter.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {root ? (
        <View
          onLayout={(event) => {
            rootFamilyOffsetYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <RootFamilyBrowser
            rootArabic={root.arabic}
            rootOccurrenceCount={root.occurrenceCount}
            expectedLemmaCount={root.lemmaCount}
            selectedLemmaId={selectedLemmaId}
            activeLemmaId={lemmaOverride?.id}
            expanded={rootFamilyExpanded}
            reduceMotion={reduceMotion}
            state={rootFamilyState}
            palette={palette}
            onToggle={toggleRootFamily}
            onRetry={() => setRootFamilyRetryNonce((value) => value + 1)}
            onSelect={selectRootFamilyLemma}
          />
        </View>
      ) : null}

      <View
        accessibilityRole="tablist"
        onLayout={(event) => {
          filtersOffsetYRef.current = event.nativeEvent.layout.y;
        }}
        style={[styles.filters, { backgroundColor: palette.interactive, borderColor: `${palette.border}55` }]}
      >
        {filters.map((filter) => (
          <Pressable
            key={filter.scope}
            accessibilityRole="tab"
            accessibilityLabel={filter.enabled ? `${filter.label} occurrences` : filter.unavailableExplanation}
            accessibilityState={{ selected: effectiveScope === filter.scope, disabled: !filter.enabled }}
            disabled={!filter.enabled}
            onPress={() => selectScope(filter.scope)}
            style={[
              styles.filter,
              { opacity: filter.enabled ? 1 : 0.4 },
              effectiveScope === filter.scope && styles.activeFilter,
              effectiveScope === filter.scope && { backgroundColor: palette.surfaceNavigation },
            ]}
          >
            <Text style={[styles.filterText, { color: effectiveScope === filter.scope ? palette.tint : palette.muted }]}> 
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {lemmaOverride ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.activeLemma, { borderColor: palette.tint, backgroundColor: palette.surface }]}
        >
          <View style={styles.activeLemmaCopy}>
            <Text style={[styles.activeLemmaEyebrow, { color: palette.tint }]}>VIEWING ROOT-FAMILY FORM</Text>
            <View
              accessibilityLabel={`${lemmaOverride.arabic}, ${formatOccurrenceCount(lemmaOverride.occurrenceCount)}`}
              style={styles.activeLemmaValue}
            >
              <Text style={[styles.activeLemmaArabic, { color: palette.text }]}>{lemmaOverride.arabic}</Text>
              <Text style={[styles.activeLemmaCount, { color: palette.text }]}>
                {formatOccurrenceCount(lemmaOverride.occurrenceCount)}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to the selected word's lemma"
            hitSlop={8}
            onPress={() => selectScope('lemma')}
            style={styles.clearLemma}
          >
            <X color={palette.muted} size={20} strokeWidth={2.25} />
          </Pressable>
        </View>
      ) : null}

      {pageState.status === 'loading' ? (
        <View style={styles.state} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.tint} />
          <Text style={[styles.stateText, { color: palette.muted }]}>Loading {effectiveScope} occurrences…</Text>
        </View>
      ) : pageState.status === 'error' ? (
        <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surface }]} accessibilityLiveRegion="polite">
          <Text style={[styles.stateText, { color: palette.muted }]}>{pageState.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryNonce((value) => value + 1)} style={styles.retry}>
            <RotateCw color={palette.tint} size={17} />
            <Text style={[styles.retryText, { color: palette.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : readyPage && readyPage.items.length ? (
        <>
          <View
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: isPageRefreshing }}
            style={styles.pageStatusRow}
          >
            <Text style={[styles.pageLabel, { color: palette.muted }]}>
              {getOccurrencePageLabel(cursor, readyPage.items.length, readyPage.pageInfo.totalCount)} · {lemmaOverride ? `${lemmaOverride.arabic} lemma` : effectiveScope} results
            </Text>
            {isPageRefreshing ? (
              <ActivityIndicator color={palette.tint} size="small" />
            ) : null}
          </View>
          <View
            onLayout={(event) => {
              if (!rootFamilyExpanded) return;
              const nextFloor = Math.min(
                event.nativeEvent.layout.height,
                MAX_EXPANDED_FAMILY_RESULTS_HEIGHT_FLOOR
              );
              if (nextFloor > resultsHeightFloor + 0.5) setResultsHeightFloor(nextFloor);
            }}
            style={[
              styles.results,
              rootFamilyExpanded && resultsHeightFloor > 0
                ? { minHeight: resultsHeightFloor }
                : null,
            ]}
          >
            {readyPage.items.map((occurrence) => (
              <OccurrenceResult
                key={occurrence.location.locationKey}
                occurrence={occurrence}
                palette={palette}
                onOpenReader={onOpenReader}
              />
            ))}
          </View>
          <View style={styles.pagination}>
            <PageButton
              label="Previous page"
              icon={<ChevronLeft color={cursorHistory.length && !isPageRefreshing ? palette.tint : palette.muted} size={18} />}
              disabled={!cursorHistory.length || isPageRefreshing}
              onPress={showPreviousPage}
              palette={palette}
            />
            <PageButton
              label="Next page"
              icon={<ChevronRight color={readyPage.pageInfo.nextCursor && !isPageRefreshing ? palette.tint : palette.muted} size={18} />}
              disabled={!readyPage.pageInfo.nextCursor || isPageRefreshing}
              onPress={() => readyPage.pageInfo.nextCursor && showNextPage(readyPage.pageInfo.nextCursor)}
              palette={palette}
              iconAfter
            />
          </View>
        </>
      ) : (
        <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <Text style={[styles.stateText, { color: palette.muted }]}>No {effectiveScope} occurrences are available.</Text>
        </View>
      )}
      <OccurrenceGuideSheet isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </View>
  );
}

function RootFamilyBrowser({
  rootArabic,
  rootOccurrenceCount,
  expectedLemmaCount,
  selectedLemmaId,
  activeLemmaId,
  expanded,
  reduceMotion,
  state,
  palette,
  onToggle,
  onRetry,
  onSelect,
}: {
  rootArabic: string;
  rootOccurrenceCount: number;
  expectedLemmaCount: number;
  selectedLemmaId?: string;
  activeLemmaId?: string;
  expanded: boolean;
  reduceMotion: boolean;
  state: RootFamilyState;
  palette: Palette;
  onToggle: () => void;
  onRetry: () => void;
  onSelect: (lemma: Lemma) => void;
}): React.JSX.Element {
  const displayedLemmaCount = state.status === 'ready' ? state.lemmas.length : expectedLemmaCount;
  const layoutTransition = LinearTransition.duration(reduceMotion ? 0 : 220)
    .easing(Easing.out(Easing.cubic))
    .reduceMotion(reduceMotion ? ReduceMotion.Always : ReduceMotion.System);
  const bodyEntering = reduceMotion ? undefined : FadeIn.duration(140);
  const bodyExiting = reduceMotion ? undefined : FadeOut.duration(100);
  return (
    <Animated.View
      layout={layoutTransition}
      style={[styles.familyCard, { backgroundColor: palette.surface }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${displayedLemmaCount} forms in root ${rootArabic}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.familyHeader}
      >
        <View style={styles.familyHeaderCopy}>
          <Text style={[styles.familyEyebrow, { color: palette.tint }]}>ROOT {rootArabic}</Text>
          <Text style={[styles.familySummary, { color: palette.muted }]}>
            {displayedLemmaCount.toLocaleString()} lemmas · {rootOccurrenceCount.toLocaleString()} occurrences
          </Text>
        </View>
        {expanded ? (
          <ChevronUp color={palette.tint} size={21} />
        ) : (
          <ChevronDown color={palette.tint} size={21} />
        )}
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={bodyEntering}
          exiting={bodyExiting}
          style={[styles.familyBody, { borderTopColor: palette.border }]}
        >
          {state.status === 'loading' ? (
            <View style={styles.familyState} accessibilityLiveRegion="polite">
              <ActivityIndicator color={palette.tint} />
              <Text style={[styles.stateText, { color: palette.muted }]}>Loading root-family forms…</Text>
            </View>
          ) : state.status === 'error' ? (
            <View style={styles.familyState} accessibilityLiveRegion="polite">
              <Text style={[styles.stateText, { color: palette.muted }]}>{state.message}</Text>
              <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
                <RotateCw color={palette.tint} size={17} />
                <Text style={[styles.retryText, { color: palette.tint }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.familyRows}>
              {state.lemmas.map((lemma) => {
                const isSelectedWordLemma = lemma.id === selectedLemmaId;
                const isActive = lemma.id === activeLemmaId;
                const posLabel = lemma.posCode ? getPosLabel(lemma.posCode) : 'Part of speech unavailable';
                return (
                  <Pressable
                    key={lemma.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${lemma.arabic}, ${posLabel}, ${formatOccurrenceCount(lemma.occurrenceCount)}${isSelectedWordLemma ? ', selected word lemma' : ''}`}
                    accessibilityState={{ selected: isActive }}
                    onPress={() => onSelect(lemma)}
                    style={[
                      styles.familyRow,
                      { borderTopColor: palette.border, backgroundColor: isActive ? palette.interactive : palette.surface },
                    ]}
                  >
                    <View style={styles.familyRowMeta}>
                      <View style={styles.familyPosRow}>
                        <Text style={[styles.familyPos, { color: palette.muted }]}>{posLabel}</Text>
                        {isSelectedWordLemma ? (
                          <View style={[styles.selectedBadge, { backgroundColor: palette.interactive }]}>
                            <Text style={[styles.selectedBadgeText, { color: palette.tint }]}>Selected</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.familyCount, { color: palette.text }]}>
                        {formatOccurrenceCount(lemma.occurrenceCount)}
                      </Text>
                    </View>
                    <View style={styles.familyArabicBlock}>
                      <Text style={[styles.familyArabic, { color: palette.text }]}>{lemma.arabic}</Text>
                      {isActive ? (
                        <Check color={palette.tint} size={18} strokeWidth={2.4} />
                      ) : (
                        <ChevronRight color={palette.muted} size={19} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function OccurrenceResult({
  occurrence,
  palette,
  onOpenReader,
}: {
  occurrence: WordOccurrence;
  palette: Palette;
  onOpenReader: (occurrence: WordOccurrence) => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open reader at ${occurrence.location.locationKey}, ${getOccurrenceGloss(occurrence)}`}
      onPress={() => onOpenReader(occurrence)}
      style={[styles.resultCard, { borderColor: palette.border, backgroundColor: palette.surface }]}
    >
      <View style={styles.resultHeader}>
        <View style={styles.resultLocationBlock}>
          <Text style={[styles.resultLocation, { color: palette.tint }]}>{occurrence.location.locationKey}</Text>
          <Text style={[styles.resultGloss, { color: palette.text }]}>{getOccurrenceGloss(occurrence)}</Text>
        </View>
        <Text style={[styles.resultArabic, { color: palette.text }]}>{occurrence.surfaceUthmani}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.ayahContext, { color: palette.muted }]}> 
        {occurrence.ayahContextUthmani || 'Ayah context unavailable.'}
      </Text>
      <View style={styles.openRow}>
        <Text style={[styles.openText, { color: palette.tint }]}>Open in reader</Text>
        <ArrowUpRight color={palette.tint} size={16} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

function PageButton({
  label,
  icon,
  disabled,
  onPress,
  palette,
  iconAfter = false,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
  palette: Palette;
  iconAfter?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pageButton, { opacity: disabled ? 0.4 : 1 }]}
    >
      {iconAfter ? null : icon}
      <Text style={[styles.pageButtonText, { color: disabled ? palette.muted : palette.tint }]}>{label}</Text>
      {iconAfter ? icon : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16 },
  heading: { minHeight: 36, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  infoButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  counterGrid: { position: 'relative', flexDirection: 'row', flexWrap: 'wrap', borderRadius: 20, overflow: 'hidden', paddingVertical: 6 },
  counterCell: { width: '50%', flexBasis: '50%', flexGrow: 0, flexShrink: 0, minHeight: 92, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  counterContent: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  counterVerticalDivider: { position: 'absolute', width: StyleSheet.hairlineWidth, top: 17, bottom: 17, left: '50%' },
  counterHorizontalDivider: { position: 'absolute', height: StyleSheet.hairlineWidth, left: 17, right: 17, top: '50%' },
  counterValue: { fontSize: 24, lineHeight: 31, fontWeight: '800', textAlign: 'center' },
  counterLabel: { fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  familyCard: { borderRadius: 20 },
  familyHeader: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  familyHeaderCopy: { flex: 1, gap: 2 },
  familyEyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.55 },
  familySummary: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  familyBody: { borderTopWidth: 1 },
  familyState: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  familyRows: { paddingBottom: 2 },
  familyRow: { minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  familyRowMeta: { flex: 1, gap: 3 },
  familyPosRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  familyPos: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  selectedBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  selectedBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  familyCount: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  familyArabicBlock: { maxWidth: '48%', flexDirection: 'row', alignItems: 'center', gap: 9 },
  familyArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 25, lineHeight: 38, writingDirection: 'rtl', textAlign: 'right' },
  filters: { flexDirection: 'row', padding: 4, borderWidth: 1, borderRadius: 24 },
  filter: { zIndex: 1, flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  activeFilter: Platform.OS === 'android'
    ? { elevation: 2 }
    : { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  filterText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  activeLemma: { minHeight: 64, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  activeLemmaCopy: { flex: 1, gap: 2 },
  activeLemmaEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45 },
  activeLemmaValue: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  activeLemmaArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 21, lineHeight: 31, writingDirection: 'rtl' },
  activeLemmaCount: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  clearLemma: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  state: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateCard: { minHeight: 100, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  stateText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retry: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  retryText: { fontSize: 14, fontWeight: '700' },
  pageStatusRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pageLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  results: { gap: 10 },
  resultCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 10 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  resultLocationBlock: { flex: 1, gap: 3 },
  resultLocation: { fontSize: 12, lineHeight: 17, fontWeight: '800', letterSpacing: 0.25 },
  resultGloss: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  resultArabic: { maxWidth: '46%', fontFamily: 'UthmanicHafs1Ver18', fontSize: 27, lineHeight: 40, writingDirection: 'rtl', textAlign: 'right' },
  ayahContext: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 19, lineHeight: 31, writingDirection: 'rtl', textAlign: 'right' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pageButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pageButtonText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
