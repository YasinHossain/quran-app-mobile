import React from 'react';
import { MoreHorizontal } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

const AVAILABLE_ARABIC_FONT_FAMILIES = new Set(['UthmanicHafs1Ver18', 'Scheherazade New']);
const QURAN_ANNOTATION_MARKS_REGEX = /[\u06D6-\u06ED]/;

function getFirstFontFamily(fontFace: string | undefined): string | undefined {
  if (!fontFace) return undefined;
  const first = fontFace.split(',')[0]?.trim();
  if (!first) return undefined;
  return first.replace(/^["']|["']$/g, '').trim() || undefined;
}

function VerseCardComponent({
  verseKey,
  arabicText,
  translationTexts,
  arabicFontSize,
  arabicFontFace,
  translationFontSize,
  showByWords,
  renderSignal: _renderSignal,
  onOpenActions,
  onPress,
}: {
  verseKey: string;
  arabicText: string;
  translationTexts?: string[];
  arabicFontSize: number;
  arabicFontFace?: string;
  translationFontSize: number;
  showByWords?: boolean;
  renderSignal?: number;
  onOpenActions?: () => void;
  onPress?: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const arabicFontFamily = getFirstFontFamily(arabicFontFace);
  const sanitizedArabicText = arabicText.trim();
  const normalizedArabicFontFamily =
    arabicFontFamily && AVAILABLE_ARABIC_FONT_FAMILIES.has(arabicFontFamily)
      ? arabicFontFamily
      : 'UthmanicHafs1Ver18';
  const shouldUseScheherazadeFallback =
    normalizedArabicFontFamily.includes('UthmanicHafs1Ver18') &&
    (sanitizedArabicText.includes('\u06DF') || QURAN_ANNOTATION_MARKS_REGEX.test(sanitizedArabicText));
  const effectiveArabicFontFamily = shouldUseScheherazadeFallback
    ? 'Scheherazade New'
    : normalizedArabicFontFamily;
  const arabicLineHeight = Math.max(arabicFontSize + 6, Math.round(arabicFontSize * 1.55));
  const translationLineHeight = Math.max(
    translationFontSize + 6,
    Math.round(translationFontSize * 1.55)
  );

  const cleanedTranslations = (translationTexts ?? []).map((t) => t.trim()).filter(Boolean);
  const renderSignal = typeof _renderSignal === 'number' ? _renderSignal : 0;

  const content = (
    <View className="flex-1 gap-4">
        <View
          className={[
            'flex-row items-center',
            onOpenActions ? 'justify-between' : 'justify-start',
          ].join(' ')}
        >
          <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
            {verseKey}
          </Text>
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

        <Text
          key={`${verseKey}-arabic-${renderSignal}`}
          className="text-right text-foreground dark:text-foreground-dark"
          style={{
            fontSize: arabicFontSize,
            lineHeight: arabicLineHeight,
            fontFamily: effectiveArabicFontFamily,
            writingDirection: 'rtl',
            textAlign: 'right',
          }}
        >
          {sanitizedArabicText}
        </Text>

        {showByWords ? (
          <Text className="text-xs text-muted dark:text-muted-dark">
            Word-by-word view is UI-ready. Data fetching is coming next.
          </Text>
        ) : null}

        {cleanedTranslations.length ? (
          <View className="gap-6">
            {cleanedTranslations.map((text, idx) => (
              <Text
                key={`${renderSignal}-${idx}-${text.slice(0, 24)}`}
                className="text-content-secondary dark:text-content-secondary-dark"
                style={{
                  fontSize: translationFontSize,
                  lineHeight: translationLineHeight,
                  writingDirection: 'auto',
                }}
              >
                {text}
              </Text>
            ))}
          </View>
        ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        className="border-b border-border/40 py-4 dark:border-border-dark/30"
        style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
      >
        {content}
      </Pressable>
    );
  }

  return <View className="border-b border-border/40 py-4 dark:border-border-dark/30">{content}</View>;
}

export const VerseCard = React.memo(VerseCardComponent);
VerseCard.displayName = 'VerseCard';
