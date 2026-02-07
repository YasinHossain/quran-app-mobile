import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { highlightMissingQueryWords, isArabicQuery } from '@/lib/utils/searchHighlight';
import { useAppTheme } from '@/providers/ThemeContext';

import { HighlightedText } from './HighlightedText';

import type { SearchVerseResult } from '@/lib/api/search';

const AVAILABLE_ARABIC_FONT_FAMILIES = new Set(['UthmanicHafs1Ver18', 'Scheherazade New']);
const QURAN_ANNOTATION_MARKS_REGEX = /[\u06D6-\u06ED]/;

function getFirstFontFamily(fontFace: string | undefined): string | undefined {
  if (!fontFace) return undefined;
  const first = fontFace.split(',')[0]?.trim();
  if (!first) return undefined;
  return first.replace(/^['"]|['"]$/g, '').trim() || undefined;
}

function resolveArabicFontFamily(fontFace: string | undefined, arabicText: string): string {
  const arabicFontFamily = getFirstFontFamily(fontFace);
  const normalized =
    arabicFontFamily && AVAILABLE_ARABIC_FONT_FAMILIES.has(arabicFontFamily)
      ? arabicFontFamily
      : 'UthmanicHafs1Ver18';

  const sanitized = arabicText.trim();
  const shouldUseScheherazadeFallback =
    normalized.includes('UthmanicHafs1Ver18') &&
    (sanitized.includes('\u06DF') || QURAN_ANNOTATION_MARKS_REGEX.test(sanitized));

  return shouldUseScheherazadeFallback ? 'Scheherazade New' : normalized;
}

export function SearchVerseResultCard({
  verse,
  query,
  arabicFontSize,
  arabicFontFace,
  translationFontSize,
  onPress,
}: {
  verse: SearchVerseResult;
  query: string;
  arabicFontSize: number;
  arabicFontFace?: string;
  translationFontSize: number;
  onPress: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const arabic = isArabicQuery(query);

  const highlighted = React.useMemo(() => {
    const base = arabic ? verse.textArabic : verse.highlightedTranslation;
    return highlightMissingQueryWords(base ?? '', query);
  }, [arabic, query, verse.highlightedTranslation, verse.textArabic]);

  const arabicFamily = React.useMemo(
    () => resolveArabicFontFamily(arabicFontFace, verse.textArabic ?? ''),
    [arabicFontFace, verse.textArabic]
  );

  const arabicLineHeight = Math.max(arabicFontSize + 6, Math.round(arabicFontSize * 1.55));
  const translationLineHeight = Math.max(
    translationFontSize + 6,
    Math.round(translationFontSize * 1.55)
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Go to ${verse.verseKey}`}
      className="border-b border-border/40 py-5 dark:border-border-dark/30"
      style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
    >
      <View className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
            {verse.verseKey}
          </Text>
          {verse.translationName ? (
            <Text numberOfLines={1} className="flex-1 text-right text-xs text-muted dark:text-muted-dark">
              {verse.translationName}
            </Text>
          ) : null}
        </View>

        {!arabic ? (
          <Text
            className="text-right text-foreground dark:text-foreground-dark"
            style={{
              fontSize: arabicFontSize,
              lineHeight: arabicLineHeight,
              fontFamily: arabicFamily,
              writingDirection: 'rtl',
              textAlign: 'right',
            }}
          >
            {verse.textArabic?.trim() ?? ''}
          </Text>
        ) : null}

        <View className="gap-2">
          <Text className="text-xs font-medium text-muted dark:text-muted-dark">Match</Text>
          <HighlightedText
            html={highlighted}
            textStyle={{
              color: palette.text,
              fontSize: arabic ? arabicFontSize : translationFontSize,
              lineHeight: arabic ? arabicLineHeight : translationLineHeight,
              fontFamily: arabic ? arabicFamily : undefined,
              writingDirection: arabic ? 'rtl' : 'auto',
              textAlign: arabic ? 'right' : 'left',
            }}
            highlightStyle={{
              backgroundColor: `${palette.tint}22`,
              color: palette.text,
              fontWeight: '700',
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}

