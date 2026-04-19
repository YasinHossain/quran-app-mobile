import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { getJuzByPage } from '@/lib/utils/surah-navigation';
import { DEFAULT_ARABIC_FONT_FAMILY } from '@/src/core/infrastructure/fonts/arabicFonts';

import type { MushafLineGroup, MushafPageData, MushafScaleStep, MushafWord } from '@/types';
import {
  resolveMushafVerseKey,
  type MushafWordPressPayload,
} from '@/components/mushaf/mushafWordPayload';

import { mushafScaleStepToFontSize } from '@/types';

type MushafNativePageProps = {
  data: MushafPageData;
  mushafName: string;
  mushafScaleStep: MushafScaleStep;
  onWordLongPress?: (payload: MushafWordPressPayload) => void;
  onWordPress?: (payload: MushafWordPressPayload) => void;
};

const PAGE_MAX_WIDTH = 720;

function resolveWordText(word: MushafWord, page: MushafPageData): string {
  if (page.pack.script === 'indopak') {
    return word.textIndopak ?? word.textUthmani ?? '';
  }

  return word.textUthmani ?? word.textIndopak ?? '';
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
  onWordLongPress,
  onWordPress,
}: {
  page: MushafPageData;
  line: MushafLineGroup | null;
  fontSize: number;
  lineHeight: number;
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
      },
    ],
    [fontSize, lineHeight]
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
        const spacer = index === line.words.length - 1 ? '' : ' ';

        return (
          <Text
            key={word.location ?? `${line.key}:${word.position}`}
            suppressHighlighting
            allowFontScaling={false}
            onLongPress={onWordLongPress ? () => onWordLongPress(payload) : undefined}
            onPress={onWordPress ? () => onWordPress(payload) : undefined}
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
  mushafName,
  mushafScaleStep,
  onWordLongPress,
  onWordPress,
}: MushafNativePageProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(Math.max(width - 32, 280), PAGE_MAX_WIDTH);
  const fontSize = mushafScaleStepToFontSize(mushafScaleStep);
  const lineHeight = Math.round(fontSize * 1.72);
  const verticalPadding = Math.max(18, Math.round(fontSize * 0.8));
  const lineSlots = React.useMemo(() => buildLineSlots(data), [data]);
  const juzNumber = getJuzByPage(data.pageNumber);

  return (
    <View className="items-center">
      <View
        className="w-full rounded-[32px] border border-border/40 bg-surface px-4 py-4 dark:border-border-dark/30 dark:bg-surface-dark"
        style={{ maxWidth: pageWidth }}
      >
        <View className="flex-row items-center justify-between gap-3 border-b border-border/30 pb-3 dark:border-border-dark/20">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
              {mushafName}
            </Text>
            <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
              Native Unicode renderer
            </Text>
          </View>
          <View className="rounded-full bg-interactive px-3 py-1.5 dark:bg-interactive-dark">
            <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
              Page {data.pageNumber}
            </Text>
          </View>
        </View>

        <View
          className="mt-4 rounded-[24px] px-4"
          style={{
            backgroundColor: '#FCFBF7',
            borderColor: '#E5D9C5',
            borderWidth: 1,
            minHeight: lineHeight * data.pack.lines + verticalPadding * 2,
            paddingVertical: verticalPadding,
          }}
        >
          {lineSlots.map((line, index) => (
            <View key={line?.key ?? `${data.pageNumber}:blank:${index + 1}`} style={index > 0 ? styles.lineSpacing : null}>
              <MushafLineText
                page={data}
                line={line}
                fontSize={fontSize}
                lineHeight={lineHeight}
                onWordLongPress={onWordLongPress}
                onWordPress={onWordPress}
              />
            </View>
          ))}
        </View>

        <View className="mt-4 flex-row items-center justify-center gap-2">
          <View className="rounded-full bg-interactive px-3 py-1.5 dark:bg-interactive-dark">
            <Text className="text-xs font-semibold uppercase tracking-[0.5px] text-foreground dark:text-foreground-dark">
              Juz {juzNumber}
            </Text>
          </View>
          <Text className="text-xs text-muted dark:text-muted-dark">
            Selectable offline text from {data.pack.packId}@{data.pack.version}
          </Text>
        </View>
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
});
