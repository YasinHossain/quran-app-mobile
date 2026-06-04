import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';

import Colors from '@/constants/Colors';
import { highlightMissingQueryWords, isArabicQuery } from '@/lib/utils/searchHighlight';
import { useAppTheme } from '@/providers/ThemeContext';

import { HighlightedText } from './HighlightedText';

import type { SearchVerseResult } from '@/lib/api/search';

const QPC_UNSUPPORTED_GLYPH = '\u06DF';

function getFirstFontFamily(fontFace: string | undefined): string | undefined {
  if (!fontFace) return undefined;
  const first = fontFace.split(',')[0]?.trim();
  if (!first) return undefined;
  return first.replace(/^['"]|['"]$/g, '').trim() || undefined;
}

function resolveArabicFontFamily(fontFace: string | undefined, arabicText: string): string {
  const arabicFontFamily = getFirstFontFamily(fontFace);
  const normalized = arabicFontFamily ?? 'UthmanicHafs1Ver18';

  const sanitized = arabicText.trim();
  const shouldUseScheherazadeFallback =
    normalized.includes('UthmanicHafs1Ver18') &&
    sanitized.includes(QPC_UNSUPPORTED_GLYPH);

  return shouldUseScheherazadeFallback ? 'Scheherazade New' : normalized;
}

export function SearchVerseResultCard({
  verse,
  query,
  arabicFontSize,
  arabicFontFace,
  translationFontSize,
  isAudioActive,
  onOpenActions,
  onPress,
}: {
  verse: SearchVerseResult;
  query: string;
  arabicFontSize: number;
  arabicFontFace?: string;
  translationFontSize: number;
  isAudioActive?: boolean;
  onOpenActions?: () => void;
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

  const arabicLineHeight = Math.max(arabicFontSize + 14, Math.round(arabicFontSize * 2.2));
  const translationLineHeight = Math.max(
    translationFontSize + 8,
    Math.round(translationFontSize * 1.7)
  );

  const containerClassName = [
    'border-b border-border/40 py-5 dark:border-border-dark/30',
    isAudioActive ? 'bg-accent/5 rounded-xl' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Go to ${verse.verseKey}`}
      className={containerClassName}
      style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
    >
      <View className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
            {verse.verseKey}
          </Text>
          <View className="flex-1 flex-row items-center justify-end gap-2">
            {verse.translationName ? (
              <Text numberOfLines={1} className="text-xs text-muted dark:text-muted-dark">
                {verse.translationName}
              </Text>
            ) : null}
            {onOpenActions ? (
              <Pressable
                onPress={onOpenActions}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Open verse actions"
                className="h-8 w-8 items-center justify-center rounded-full"
                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
              >
                <MoreHorizontal color={palette.muted} size={18} strokeWidth={2.25} />
              </Pressable>
            ) : null}
          </View>
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
