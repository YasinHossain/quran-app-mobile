import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
    <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: palette.background }]}>
      <View
        accessibilityRole="text"
        accessibilityLabel={buildSegmentsAccessibilityLabel(
          segments,
          analysis.surfaceUthmani,
          legendLayout === 'stacked'
        )}
        style={styles.segmentedWord}
      >
        {segments.length ? (
          segments.map((segment) => (
            <SegmentText
              key={`${segment.locationKey}:${segment.segmentIndex}`}
              segment={segment}
              isDark={isDark}
              compact={compact}
              includeMorphology={legendLayout === 'stacked'}
            />
          ))
        ) : (
          <Text style={[styles.arabicWord, compact && styles.arabicWordCompact, { color: palette.text }]}>
            {analysis.surfaceUthmani}
          </Text>
        )}
      </View>

      {segments.length && legendLayout === 'horizontal' ? (
        <ScrollView
          horizontal
          accessibilityLabel="Part of speech legend"
          showsHorizontalScrollIndicator={false}
          style={styles.legendHorizontal}
          contentContainerStyle={styles.legendHorizontalContent}
        >
          {segments.map((segment) => {
            const color = POS_COLORS[isDark ? 'dark' : 'light'][getPosColorGroup(segment.posCode)];
            return (
              <View
                key={`legend:${segment.segmentIndex}`}
                style={[styles.legendItemHorizontal, { backgroundColor: palette.surface }]}
              >
                <View style={[styles.legendLine, { backgroundColor: color }]} />
                <Text style={[styles.legendText, { color: palette.muted }]}>
                  {segment.arabic} — {getPosLabel(segment.posCode)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : segments.length ? (
        <View style={styles.legend} accessibilityLabel="Part of speech legend">
          {segments.map((segment) => {
            const color = POS_COLORS[isDark ? 'dark' : 'light'][getPosColorGroup(segment.posCode)];
            return (
              <View key={`legend:${segment.segmentIndex}`} style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: color }]} />
                <Text style={[styles.legendText, styles.legendTextStacked, { color: palette.muted }]}>
                  {segment.arabic} — {getPosLabel(segment.posCode)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
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
  legendHorizontal: { alignSelf: 'stretch' },
  legendHorizontalContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendItemHorizontal: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendLine: { width: 18, height: 4, borderRadius: 2 },
  legendText: { fontSize: 13, lineHeight: 19 },
  legendTextStacked: { flex: 1 },
});
