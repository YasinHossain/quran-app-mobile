import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { DEFAULT_ARABIC_FONT_FAMILY } from '@/src/core/infrastructure/fonts/arabicFonts';

import type { MushafLineGroup, MushafPageData, MushafScaleStep, MushafWord } from '@/types';
import {
  resolveMushafVerseKey,
  type MushafWordPressPayload,
} from '@/components/mushaf/mushafWordPayload';

import { mushafScaleStepToFontSize } from '@/types';

type MushafNativePageProps = {
  data: MushafPageData;
  mushafScaleStep: MushafScaleStep;
  highlightVerseKey?: string;
  onWordLongPress?: (payload: MushafWordPressPayload) => void;
  onWordPress?: (payload: MushafWordPressPayload) => void;
};

const PAGE_MAX_WIDTH = 720;

function resolveWordText(word: MushafWord, page: MushafPageData): string {
  if (page.pack.script === 'indopak') {
    return word.textIndopak ?? word.textUthmani ?? '';
  }

  return word.textUthmani ?? word.textIndopak ?? word.textQpcHafs ?? '';
}

function buildWordPayload(word: MushafWord, page: MushafPageData): MushafWordPressPayload {
  return {
    charType: word.charType,
    lineNumber: word.lineNumber,
    location: word.location,
    text: resolveWordText(word, page),
    verseKey: resolveMushafVerseKey(word),
    wordPosition: word.position,
  };
}

function buildLineSlots(page: MushafPageData): Array<MushafLineGroup | null> {
  const linesByNumber = new Map(page.pageLines.lines.map((line) => [line.lineNumber, line] as const));
  return Array.from({ length: page.pack.lines }, (_, index) => linesByNumber.get(index + 1) ?? null);
}

function MushafLineText({
  page,
  line,
  fontSize,
  lineHeight,
  textColor,
  highlightVerseKey,
  highlightBackgroundColor,
  onWordLongPress,
  onWordPress,
}: {
  page: MushafPageData;
  line: MushafLineGroup | null;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  highlightVerseKey?: string;
  highlightBackgroundColor: string;
  onWordLongPress?: (payload: MushafWordPressPayload) => void;
  onWordPress?: (payload: MushafWordPressPayload) => void;
}): React.JSX.Element {
  const baseTextStyle = React.useMemo(
    () => [
      styles.lineText,
      {
        fontFamily: DEFAULT_ARABIC_FONT_FAMILY,
        fontSize,
        lineHeight,
        color: textColor,
      },
    ],
    [fontSize, lineHeight, textColor]
  );

  if (!line) {
    return (
      <Text selectable={false} allowFontScaling={false} style={[baseTextStyle, styles.blankLineText]}>
        {'\u00A0'}
      </Text>
    );
  }

  return (
    <Text selectable allowFontScaling={false} style={baseTextStyle}>
      {line.words.map((word, index) => {
        const wordText = resolveWordText(word, page);
        if (!wordText) return null;

        const payload = buildWordPayload(word, page);
        const isHighlighted = highlightVerseKey === resolveMushafVerseKey(word);
        const spacer = index === line.words.length - 1 ? '' : ' ';

        return (
          <Text
            key={word.location ?? `${line.key}:${word.position}`}
            suppressHighlighting
            allowFontScaling={false}
            onLongPress={onWordLongPress ? () => onWordLongPress(payload) : undefined}
            onPress={onWordPress ? () => onWordPress(payload) : undefined}
            style={
              isHighlighted
                ? [styles.highlightedWord, { backgroundColor: highlightBackgroundColor }]
                : undefined
            }
          >
            {wordText}
            {spacer}
          </Text>
        );
      })}
    </Text>
  );
}

export function MushafNativePage({
  data,
  mushafScaleStep,
  highlightVerseKey,
  onWordLongPress,
  onWordPress,
}: MushafNativePageProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const pageWidth = Math.min(Math.max(width - 8, 280), PAGE_MAX_WIDTH);
  const fontSize = mushafScaleStepToFontSize(mushafScaleStep);
  const lineHeight = Math.round(fontSize * 1.72);
  const verticalPadding = Math.max(6, Math.round(fontSize * 0.18));
  const lineSlots = React.useMemo(() => buildLineSlots(data), [data]);
  const normalizedHighlightVerseKey =
    typeof highlightVerseKey === 'string' && highlightVerseKey.trim()
      ? highlightVerseKey.trim()
      : undefined;
  const highlightBackgroundColor =
    resolvedTheme === 'dark' ? 'rgba(250, 204, 21, 0.22)' : 'rgba(245, 158, 11, 0.18)';

  return (
    <View className="items-center">
      <View
        className="w-full"
        style={{
          maxWidth: pageWidth,
          minHeight: lineHeight * data.pack.lines + verticalPadding * 2,
          paddingVertical: verticalPadding,
        }}
      >
        {lineSlots.map((line, index) => (
          <View
            key={line?.key ?? `${data.pageNumber}:blank:${index + 1}`}
            style={index > 0 ? styles.lineSpacing : null}
          >
            <MushafLineText
              page={data}
              line={line}
              fontSize={fontSize}
              lineHeight={lineHeight}
              textColor={palette.text}
              highlightVerseKey={normalizedHighlightVerseKey}
              highlightBackgroundColor={highlightBackgroundColor}
              onWordLongPress={onWordLongPress}
              onWordPress={onWordPress}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blankLineText: {
    color: 'transparent',
  },
  lineSpacing: {
    marginTop: 2,
  },
  lineText: {
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  highlightedWord: {
    borderRadius: 6,
  },
});
