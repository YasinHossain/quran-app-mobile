import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import type { Morpheme, WordAnalysis } from '@/src/core/domain/word-study';

import {
  describeMorphology,
  getAnalysisSegments,
  getPosColorGroup,
  getPosLabel,
} from './wordQuickSheetModel';

const POS_COLORS = {
  light: {
    verb: '#C2410C',
    noun: '#047857',
    pronoun: '#1D4ED8',
    particle: '#7E22CE',
  },
  dark: {
    verb: '#FB923C',
    noun: '#34D399',
    pronoun: '#60A5FA',
    particle: '#C084FC',
  },
} as const;

export function WordSegmentsCard({
  analysis,
  compact = false,
  legendLayout = 'stacked',
}: {
  analysis: WordAnalysis;
  compact?: boolean;
  legendLayout?: 'stacked' | 'horizontal';
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const segments = getAnalysisSegments(analysis);

  return (
    <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: palette.surface }]}>
      <SegmentedWord
        analysis={analysis}
        compact={compact}
        includeMorphology={legendLayout === 'stacked'}
      />
      <WordSegmentsLegend analysis={analysis} layout={legendLayout} />
    </View>
  );
}

export function SegmentedWord({
  analysis,
  compact = false,
  alignment = 'center',
  includeMorphology = false,
}: {
  analysis: WordAnalysis;
  compact?: boolean;
  alignment?: 'center' | 'end';
  includeMorphology?: boolean;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const segments = getAnalysisSegments(analysis);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={buildSegmentsAccessibilityLabel(
        segments,
        analysis.surfaceUthmani,
        includeMorphology
      )}
      style={[styles.segmentedWord, alignment === 'end' && styles.segmentedWordEnd]}
    >
      {segments.length ? (
        segments.map((segment) => (
          <SegmentText
            key={`${segment.locationKey}:${segment.segmentIndex}`}
            segment={segment}
            isDark={isDark}
            compact={compact}
            includeMorphology={includeMorphology}
          />
        ))
      ) : (
        <Text style={[styles.arabicWord, compact && styles.arabicWordCompact, { color: palette.text }]}>
          {analysis.surfaceUthmani}
        </Text>
      )}
    </View>
  );
}

export function WordSegmentsLegend({
  analysis,
  layout = 'stacked',
}: {
  analysis: WordAnalysis;
  layout?: 'stacked' | 'horizontal' | 'wrapped';
}): React.JSX.Element | null {
  const { resolvedTheme, isDark } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const palette = Colors[resolvedTheme];
  const segments = getAnalysisSegments(analysis);
  const useSingleColumn = width < 340 || fontScale > 1.35;

  if (!segments.length) return null;

  if (layout === 'horizontal') {
    return (
      <ScrollView
        horizontal
        accessibilityLabel="Part of speech legend"
        showsHorizontalScrollIndicator={false}
        style={styles.legendHorizontal}
        contentContainerStyle={styles.legendHorizontalContent}
      >
        {segments.map((segment) => (
          <LegendItem
            key={`legend:${segment.segmentIndex}`}
            segment={segment}
            isDark={isDark}
            palette={palette}
            layout="horizontal"
          />
        ))}
      </ScrollView>
    );
  }

  if (layout === 'wrapped') {
    return (
      <View style={styles.legendWrapped} accessibilityLabel="Part of speech legend">
        {segments.map((segment) => (
          <LegendItem
            key={`legend:${segment.segmentIndex}`}
            segment={segment}
            isDark={isDark}
            palette={palette}
            layout={useSingleColumn ? 'full-width' : 'wrapped'}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.legend} accessibilityLabel="Part of speech legend">
      {segments.map((segment) => (
        <LegendItem
          key={`legend:${segment.segmentIndex}`}
          segment={segment}
          isDark={isDark}
          palette={palette}
          layout="stacked"
        />
      ))}
    </View>
  );
}

function LegendItem({
  segment,
  isDark,
  palette,
  layout,
}: {
  segment: Morpheme;
  isDark: boolean;
  palette: (typeof Colors)['light'];
  layout: 'stacked' | 'horizontal' | 'wrapped' | 'full-width';
}): React.JSX.Element {
  const color = POS_COLORS[isDark ? 'dark' : 'light'][getPosColorGroup(segment.posCode)];
  const isTile = layout !== 'stacked';
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${segment.arabic}, ${getPosLabel(segment.posCode)}`}
      style={[
        styles.legendItem,
        isTile && styles.legendItemTile,
        layout === 'wrapped' && styles.legendItemWrapped,
        layout === 'full-width' && styles.legendItemFullWidth,
        isTile && { backgroundColor: layout === 'horizontal' ? palette.surface : palette.interactive },
      ]}
    >
      <View style={[styles.legendLine, { backgroundColor: color }]} />
      <Text style={[styles.legendText, styles.legendTextStacked, { color: palette.text }]}>
        {segment.arabic} — {getPosLabel(segment.posCode)}
      </Text>
    </View>
  );
}

function SegmentText({
  segment,
  isDark,
  compact,
  includeMorphology,
}: {
  segment: Morpheme;
  isDark: boolean;
  compact: boolean;
  includeMorphology: boolean;
}): React.JSX.Element {
  const color = POS_COLORS[isDark ? 'dark' : 'light'][getPosColorGroup(segment.posCode)];
  const accessibilityLabel = includeMorphology
    ? `${segment.arabic} — ${getPosLabel(segment.posCode)}; ${describeMorphology(segment.features)}`
    : `${segment.arabic} — ${getPosLabel(segment.posCode)}`;
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      style={[styles.arabicSegment, compact && styles.arabicSegmentCompact, { color, borderBottomColor: color }]}
    >
      {segment.arabic}
    </Text>
  );
}

function buildSegmentsAccessibilityLabel(
  segments: readonly Morpheme[],
  fallback: string,
  includeMorphology: boolean
): string {
  if (!segments.length) return fallback;
  return segments
    .map((segment) => {
      const segmentLabel = `${segment.arabic} — ${getPosLabel(segment.posCode)}`;
      return includeMorphology
        ? `${segmentLabel}; ${describeMorphology(segment.features)}`
        : segmentLabel;
    })
    .join('. ');
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 16,
  },
  cardCompact: { paddingVertical: 16 },
  segmentedWord: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  segmentedWordEnd: { alignSelf: 'stretch', justifyContent: 'flex-start' },
  arabicWord: {
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: 38,
    lineHeight: 62,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  arabicWordCompact: { fontSize: 34, lineHeight: 54 },
  arabicSegment: {
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: 38,
    lineHeight: 62,
    borderBottomWidth: 3,
    paddingHorizontal: 1,
    writingDirection: 'rtl',
  },
  arabicSegmentCompact: { fontSize: 34, lineHeight: 54 },
  legend: { alignSelf: 'stretch', gap: 8 },
  legendWrapped: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendHorizontal: { alignSelf: 'stretch' },
  legendHorizontalContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendItemTile: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  legendItemWrapped: { flexBasis: '47%', flexGrow: 1, maxWidth: '48%' },
  legendItemFullWidth: { flexBasis: '100%', flexGrow: 1, maxWidth: '100%' },
  legendLine: { width: 18, height: 4, borderRadius: 2 },
  legendText: { fontSize: 13, lineHeight: 19 },
  legendTextStacked: { flex: 1 },
});
