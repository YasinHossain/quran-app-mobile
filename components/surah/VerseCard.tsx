import React from 'react';
import { MoreHorizontal } from 'lucide-react-native';
import type { LayoutChangeEvent } from 'react-native';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { useAppTheme } from '@/providers/ThemeContext';
import type { VerseWord } from '@/types';

import { WordByWordVerse } from './WordByWordVerse';
import type { VerseAudioWordSync } from './useVerseAudioWordSync';
import { TajweedNativeText } from './TajweedNativeText';

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
  tajweed,
  tajweedGlyphRuns,
  isAudioActive,
  audioWordSync,
  renderSignal: _renderSignal,
  bodyMinHeight,
  bodyPlaceholder,
  onBodyLayout,
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
  tajweed?: boolean;
  tajweedGlyphRuns?: Array<{
    fontFamily: string;
    fontFileUri: string;
    glyphs: string[];
  }>;
  isAudioActive?: boolean;
  audioWordSync?: VerseAudioWordSync;
  renderSignal?: number;
  bodyMinHeight?: number;
  bodyPlaceholder?: React.ReactNode;
  onBodyLayout?: (event: LayoutChangeEvent) => void;
  onOpenActions?: () => void;
  onPress?: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { t, localizeDigits } = useUiTranslation();
  const screenDimensions = useWindowDimensions();
  const screenWidth = screenDimensions.width;
  const [wordTranslationTooltip, setWordTranslationTooltip] = React.useState<string | null>(null);
  const [tooltipData, setTooltipData] = React.useState<{
    text: string;
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null>(null);
  const [tooltipSize, setTooltipSize] = React.useState({ width: 0, height: 0 });
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

  const dismissTooltip = React.useCallback(() => {
    if (tooltipHideTimeoutRef.current) {
      clearTimeout(tooltipHideTimeoutRef.current);
      tooltipHideTimeoutRef.current = null;
    }
    setTooltipData(null);
    setWordTranslationTooltip(null);
    setTooltipSize({ width: 0, height: 0 });
  }, []);

  const showWordTranslation = React.useCallback(
    (
      text: string,
      measurement?: { pageX: number; pageY: number; width: number; height: number }
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (tooltipHideTimeoutRef.current) {
        clearTimeout(tooltipHideTimeoutRef.current);
        tooltipHideTimeoutRef.current = null;
      }

      setTooltipSize({ width: 0, height: 0 });

      if (measurement) {
        setTooltipData({
          text: trimmed,
          pageX: measurement.pageX,
          pageY: measurement.pageY,
          width: measurement.width,
          height: measurement.height,
        });

        tooltipHideTimeoutRef.current = setTimeout(() => {
          tooltipHideTimeoutRef.current = null;
          setTooltipData(null);
        }, 3000);
      } else {
        if (Platform.OS === 'android') {
          ToastAndroid.showWithGravity(trimmed, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
        } else {
          setWordTranslationTooltip(trimmed);
          tooltipHideTimeoutRef.current = setTimeout(() => {
            tooltipHideTimeoutRef.current = null;
            setWordTranslationTooltip(null);
          }, 3000);
        }
      }
    },
    []
  );

  const isSeekEnabled = Boolean(audioWordSync?.isSeekEnabled);
  const shouldUseTajweedMode = Boolean(tajweed && !showByWords);
  const shouldRenderTajweedText =
    shouldUseTajweedMode && Boolean(tajweedGlyphRuns?.length);
  const isWaitingForTajweedText = shouldUseTajweedMode && !shouldRenderTajweedText;

  const handleSeekWordPress = React.useCallback(
    ({
      word,
      wordPosition,
      measurement,
    }: {
      word: VerseWord;
      wordPosition: number;
      measurement?: {
        x: number;
        y: number;
        width: number;
        height: number;
        pageX: number;
        pageY: number;
      };
    }) => {
      if (word.translationText) {
        showWordTranslation(word.translationText, measurement);
      }
      audioWordSync?.seekToWord({ verseKey, wordPosition });
    },
    [audioWordSync, showWordTranslation, verseKey]
  );

  const handleTranslationWordPress = React.useCallback(
    ({
      word,
      measurement,
    }: {
      word: VerseWord;
      wordPosition: number;
      measurement?: {
        x: number;
        y: number;
        width: number;
        height: number;
        pageX: number;
        pageY: number;
      };
    }) => {
      if (!word.translationText) return;
      showWordTranslation(word.translationText, measurement);
    },
    [showWordTranslation]
  );

  const defaultBodyContent = (
    <View className="gap-4">
      {shouldRenderTajweedText ? (
        <TajweedNativeText
          fallbackFontFamily={effectiveArabicFontFamily}
          fallbackText={sanitizedArabicText}
          glyphRuns={tajweedGlyphRuns ?? []}
          hideFallbackText
          fontSize={arabicFontSize}
          lineHeight={arabicLineHeight}
        />
      ) : isWaitingForTajweedText ? (
        <Text
          key={`${verseKey}-tajweed-placeholder-${renderSignal}`}
          selectable={false}
          className="text-right"
          style={{
            color: 'transparent',
            fontSize: arabicFontSize,
            lineHeight: arabicLineHeight,
            fontFamily: effectiveArabicFontFamily,
            minHeight: arabicLineHeight,
            writingDirection: 'rtl',
            textAlign: 'right',
          }}
        >
          {sanitizedArabicText || ' '}
        </Text>
      ) : Array.isArray(words) && words.length && !shouldUseTajweedMode ? (
        <WordByWordVerse
          verseKey={verseKey}
          words={words}
          arabicFontSize={arabicFontSize}
          arabicFontFamily={effectiveArabicFontFamily}
          showTranslations={Boolean(showByWords)}
          pressBehavior={isSeekEnabled ? 'seek' : 'translation'}
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

  // Keep this wrapper content-sized. Adding flex-1 here can collapse the verse body
  // inside tafsir's nested pager/ScrollView, leaving only the header/action row visible.
  const content = (
    <View className="gap-4">
        <View
          className={[
            'flex-row items-center',
            onOpenActions ? 'justify-between' : 'justify-start',
          ].join(' ')}
        >
          <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
            {localizeDigits(verseKey)}
          </Text>
          {onOpenActions ? (
            <Pressable
              onPress={onOpenActions}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('open_verse_actions_menu', { fallback: 'Open verse actions' })}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <MoreHorizontal color={palette.muted} size={18} strokeWidth={2.25} />
            </Pressable>
          ) : null}
        </View>

        <View
          onLayout={onBodyLayout}
          style={typeof bodyMinHeight === 'number' && bodyMinHeight > 0 ? { minHeight: bodyMinHeight } : undefined}
        >
          {bodyPlaceholder ?? defaultBodyContent}
        </View>
    </View>
  );

  const containerClassName = [
    'border-b border-border/40 py-4 dark:border-border-dark/30',
  ]
    .filter(Boolean)
    .join(' ');

  const renderTooltipModal = () => {
    if (!tooltipData) return null;

    const { text, pageX, pageY, width, height } = tooltipData;
    const centerX = pageX + width / 2;

    const hasMeasured = tooltipSize.width > 0 && tooltipSize.height > 0;
    const gap = 16;
    const fitsAbove = pageY - tooltipSize.height - (gap + 4) > 50;
    const finalTop = fitsAbove ? pageY - tooltipSize.height - gap : pageY + height + gap;
    const isAbove = fitsAbove;

    const tooltipWidth = tooltipSize.width || 180;
    const leftCoordinate = Math.max(
      12,
      Math.min(screenWidth - tooltipWidth - 12, centerX - tooltipWidth / 2)
    );

    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="none"
        onRequestClose={dismissTooltip}
      >
        <TouchableWithoutFeedback onPress={dismissTooltip}>
          <View style={StyleSheet.absoluteFill}>
            <View
              onLayout={(e) => {
                const { width: w, height: h } = e.nativeEvent.layout;
                setTooltipSize({ width: w, height: h });
              }}
              style={{
                position: 'absolute',
                left: leftCoordinate,
                top: finalTop,
                backgroundColor: palette.tint,
                borderRadius: 6,
                paddingVertical: 8,
                paddingHorizontal: 12,
                maxWidth: Math.min(256, screenWidth - 24),
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 4,
                opacity: hasMeasured ? 1 : 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '500', textAlign: 'center' }}>
                {text}
              </Text>
              <View
                style={{
                  width: 0,
                  height: 0,
                  borderLeftWidth: 6,
                  borderRightWidth: 6,
                  borderStyle: 'solid',
                  backgroundColor: 'transparent',
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  position: 'absolute',
                  left: centerX - leftCoordinate - 6,
                  ...(isAbove
                    ? {
                        borderTopWidth: 6,
                        borderTopColor: palette.tint,
                        bottom: -6,
                      }
                    : {
                        borderBottomWidth: 6,
                        borderBottomColor: palette.tint,
                        top: -6,
                      }),
                }}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  const mainView = onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={containerClassName}
      style={({ pressed }) => ({
        opacity: pressed ? 0.95 : 1,
        backgroundColor: isAudioActive ? `${palette.tint}0D` : 'transparent',
      })}
    >
      {content}
    </Pressable>
  ) : (
    <View
      className={containerClassName}
      style={{ backgroundColor: isAudioActive ? `${palette.tint}0D` : 'transparent' }}
    >
      {content}
    </View>
  );

  return (
    <>
      {mainView}
      {renderTooltipModal()}
    </>
  );
}

export const VerseCard = React.memo(VerseCardComponent);
VerseCard.displayName = 'VerseCard';
