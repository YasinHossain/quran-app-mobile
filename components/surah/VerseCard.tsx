import React from 'react';
import { MoreHorizontal } from 'lucide-react-native';
import { Platform, Pressable, Text, ToastAndroid, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import type { VerseWord } from '@/types';

import { WordByWordVerse } from './WordByWordVerse';
import type { VerseAudioWordSync } from './useVerseAudioWordSync';

const QPC_UNSUPPORTED_GLYPH = '\u06DF';

function getFirstFontFamily(fontFace: string | undefined): string | undefined {
  if (!fontFace) return undefined;
  const first = fontFace.split(',')[0]?.trim();
  if (!first) return undefined;
  return first.replace(/^["']|["']$/g, '').trim() || undefined;
}

function VerseCardComponent({
  verseKey,
  arabicText,
  words,
  translationTexts,
  translationItems,
  showTranslationAttribution,
  arabicFontSize,
  arabicFontFace,
  translationFontSize,
  showByWords,
  isAudioActive,
  audioWordSync,
  renderSignal: _renderSignal,
  onOpenActions,
  onPress,
}: {
  verseKey: string;
  arabicText: string;
  words?: VerseWord[];
  translationTexts?: string[];
  translationItems?: Array<{
    text: string;
    resourceId?: number;
    resourceName?: string;
  }>;
  showTranslationAttribution?: boolean;
  arabicFontSize: number;
  arabicFontFace?: string;
  translationFontSize: number;
  showByWords?: boolean;
  isAudioActive?: boolean;
  audioWordSync?: VerseAudioWordSync;
  renderSignal?: number;
  onOpenActions?: () => void;
  onPress?: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [wordTranslationTooltip, setWordTranslationTooltip] = React.useState<string | null>(null);
  const tooltipHideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const arabicFontFamily = getFirstFontFamily(arabicFontFace);
  const sanitizedArabicText = arabicText.trim();
  // Use the selected family as-is; many options are system fonts on Android,
  // and custom fonts are handled by Expo font loading in `app/_layout.tsx`.
  const normalizedArabicFontFamily = arabicFontFamily ?? 'UthmanicHafs1Ver18';
  const shouldUseScheherazadeFallback =
    normalizedArabicFontFamily.includes('UthmanicHafs1Ver18') &&
    sanitizedArabicText.includes(QPC_UNSUPPORTED_GLYPH);
  const effectiveArabicFontFamily = shouldUseScheherazadeFallback
    ? 'Scheherazade New'
    : normalizedArabicFontFamily;
  // Web uses a fairly loose Arabic line-height (see `../quran-app/app/shared/VerseArabic.tsx`).
  // Keep mobile close for parity + to prevent diacritics from colliding on wrap.
  const arabicLineHeight = Math.max(arabicFontSize + 14, Math.round(arabicFontSize * 2.2));
  const translationLineHeight = Math.max(
    translationFontSize + 8,
    Math.round(translationFontSize * 1.7)
  );

  const cleanedTranslationItems = React.useMemo(() => {
    const incomingItems = (translationItems ?? [])
      .map((item) => ({
        ...item,
        text: String(item?.text ?? '').trim(),
        resourceName: String(item?.resourceName ?? '').trim() || undefined,
      }))
      .filter((item) => item.text.length > 0);

    if (incomingItems.length) return incomingItems;

    return (translationTexts ?? [])
      .map((text) => ({ text: String(text ?? '').trim() }))
      .filter((item) => item.text.length > 0);
  }, [translationItems, translationTexts]);

  const shouldShowTranslationAttribution =
    Boolean(showTranslationAttribution) &&
    cleanedTranslationItems.some((t) => Boolean((t as { resourceName?: string }).resourceName));
  const renderSignal = typeof _renderSignal === 'number' ? _renderSignal : 0;

  React.useEffect(() => {
    return () => {
      if (tooltipHideTimeoutRef.current) {
        clearTimeout(tooltipHideTimeoutRef.current);
        tooltipHideTimeoutRef.current = null;
      }
    };
  }, []);

  const showWordTranslation = React.useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(trimmed, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
      return;
    }

    setWordTranslationTooltip(trimmed);
    if (tooltipHideTimeoutRef.current) clearTimeout(tooltipHideTimeoutRef.current);
    tooltipHideTimeoutRef.current = setTimeout(() => {
      tooltipHideTimeoutRef.current = null;
      setWordTranslationTooltip(null);
    }, 2500);
  }, []);

  const isSeekEnabled = Boolean(audioWordSync?.isSeekEnabled);

  const handleSeekWordPress = React.useCallback(
    ({ wordPosition }: { word: VerseWord; wordPosition: number }) => {
      audioWordSync?.seekToWord({ verseKey, wordPosition });
    },
    [audioWordSync, verseKey]
  );

  const handleTranslationWordPress = React.useCallback(
    ({ word }: { word: VerseWord; wordPosition: number }) => {
      if (!word.translationText) return;
      showWordTranslation(word.translationText);
    },
    [showWordTranslation]
  );

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

        {Array.isArray(words) && words.length ? (
          <WordByWordVerse
            verseKey={verseKey}
            words={words}
            arabicFontSize={arabicFontSize}
            arabicFontFamily={effectiveArabicFontFamily}
            showTranslations={Boolean(showByWords)}
            pressBehavior={isSeekEnabled ? 'seek' : showByWords ? 'none' : 'translation'}
            onWordPress={isSeekEnabled ? handleSeekWordPress : handleTranslationWordPress}
            registerWordHighlight={audioWordSync?.registerWordHighlight}
          />
        ) : (
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
        )}

        {!showByWords && wordTranslationTooltip ? (
          <Text className="text-xs text-muted dark:text-muted-dark">{wordTranslationTooltip}</Text>
        ) : null}

        {cleanedTranslationItems.length ? (
          <View className="gap-6">
            {cleanedTranslationItems.map((translation, idx) => {
              const resourceName =
                'resourceName' in translation && typeof translation.resourceName === 'string'
                  ? translation.resourceName
                  : undefined;

              return (
                <View key={`${renderSignal}-${idx}-${translation.text.slice(0, 24)}`} className="gap-2">
                  {shouldShowTranslationAttribution && resourceName ? (
                    <Text className="text-xs font-normal uppercase tracking-wider text-muted dark:text-muted-dark">
                      {resourceName}
                    </Text>
                  ) : null}
                  <Text
                    className="text-foreground dark:text-foreground-dark"
                    style={{
                      fontSize: translationFontSize,
                      lineHeight: translationLineHeight,
                      writingDirection: 'auto',
                    }}
                  >
                    {translation.text}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
    </View>
  );

  const containerClassName = [
    'border-b border-border/40 py-4 dark:border-border-dark/30',
    isAudioActive ? 'bg-accent/5 rounded-xl' : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        className={containerClassName}
        style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
      >
        {content}
      </Pressable>
    );
  }

  return <View className={containerClassName}>{content}</View>;
}

export const VerseCard = React.memo(VerseCardComponent);
VerseCard.displayName = 'VerseCard';
