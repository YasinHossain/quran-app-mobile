import { ArrowUpRight, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import type {
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
  getOccurrenceCounters,
  getOccurrenceFilters,
  getOccurrenceGloss,
  getOccurrencePageLabel,
} from './occurrenceExplorerModel';

type Palette = (typeof Colors)['light'];
type PageState =
  | { status: 'loading' }
  | { status: 'ready'; page: PaginatedWordOccurrences }
  | { status: 'error'; message: string };

export function OccurrenceExplorer({
  analysis,
  palette,
  onOpenReader,
}: {
  analysis: WordAnalysis;
  palette: Palette;
  onOpenReader: (occurrence: WordOccurrence) => void;
}): React.JSX.Element {
  const [scope, setScope] = React.useState<WordOccurrenceScope>('surface');
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = React.useState<Array<string | undefined>>([]);
  const [surfaceCount, setSurfaceCount] = React.useState<number | undefined>();
  const [pageState, setPageState] = React.useState<PageState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);
  const requestIdRef = React.useRef(0);
  const filters = React.useMemo(() => getOccurrenceFilters(analysis), [analysis]);
  const effectiveScope = filters.some((filter) => filter.scope === scope && filter.enabled)
    ? scope
    : 'surface';

  React.useEffect(() => {
    setScope('surface');
    setCursor(undefined);
    setCursorHistory([]);
    setSurfaceCount(undefined);
  }, [analysis.location.locationKey]);

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
    setPageState({ status: 'loading' });

    void container
      .getWordStudyRepository()
      .findOccurrences(buildOccurrenceQuery(analysis, effectiveScope, cursor), {
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (effectiveScope === 'surface') setSurfaceCount(page.pageInfo.totalCount);
        setPageState({ status: 'ready', page });
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
  }, [analysis, cursor, effectiveScope, retryNonce]);

  const selectScope = React.useCallback((nextScope: WordOccurrenceScope) => {
    setScope(nextScope);
    setCursor(undefined);
    setCursorHistory([]);
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

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: palette.text }]}>Explore occurrences</Text>
        <Text style={[styles.explanation, { color: palette.muted }]}> 
          Counts name the exact grouping used. Surface matching uses the pack’s normalized Arabic form,
          so differently marked spellings can appear together while every result retains its exact text.
        </Text>
      </View>

      <View style={styles.counterGrid}>
        {counters.map((counter) => (
          <View
            key={counter.key}
            style={[styles.counterCard, { borderColor: palette.border, backgroundColor: palette.surface }]}
          >
            <Text style={[styles.counterValue, { color: palette.tint }]}> 
              {counter.value === undefined ? '…' : counter.value.toLocaleString()}
            </Text>
            <Text style={[styles.counterLabel, { color: palette.muted }]}>{counter.label}</Text>
          </View>
        ))}
      </View>

      <View accessibilityRole="tablist" style={[styles.filters, { backgroundColor: palette.interactive }]}> 
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
              effectiveScope === filter.scope && { backgroundColor: palette.surface },
            ]}
          >
            <Text style={[styles.filterText, { color: effectiveScope === filter.scope ? palette.tint : palette.muted }]}> 
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>

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
          <Text style={[styles.pageLabel, { color: palette.muted }]} accessibilityLiveRegion="polite">
            {getOccurrencePageLabel(cursor, readyPage.items.length, readyPage.pageInfo.totalCount)} · {effectiveScope} results
          </Text>
          <View style={styles.results}>
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
              icon={<ChevronLeft color={cursorHistory.length ? palette.tint : palette.muted} size={18} />}
              disabled={!cursorHistory.length}
              onPress={showPreviousPage}
              palette={palette}
            />
            <PageButton
              label="Next page"
              icon={<ChevronRight color={readyPage.pageInfo.nextCursor ? palette.tint : palette.muted} size={18} />}
              disabled={!readyPage.pageInfo.nextCursor}
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
    </View>
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
  heading: { gap: 4, paddingHorizontal: 2 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  explanation: { fontSize: 13, lineHeight: 20 },
  counterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  counterCard: { minWidth: '47%', flexGrow: 1, flexBasis: 150, borderWidth: 1, borderRadius: 16, padding: 14, gap: 3 },
  counterValue: { fontSize: 22, lineHeight: 29, fontWeight: '800' },
  counterLabel: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  filters: { flexDirection: 'row', padding: 4, borderRadius: 15 },
  filter: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  state: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateCard: { minHeight: 100, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  stateText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retry: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  retryText: { fontSize: 14, fontWeight: '700' },
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
