import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { VerseWord } from '@/types';

export function WordByWordVerse({
  words,
  arabicFontSize,
  arabicFontFamily,
  showTranslations,
  onWordPress,
}: {
  words: VerseWord[];
  arabicFontSize: number;
  arabicFontFamily: string;
  showTranslations: boolean;
  onWordPress?: ((word: VerseWord) => void) | undefined;
}): React.JSX.Element {
  // Match the web's loose Arabic line-height so wrapped lines don't collide (especially with harakat).
  const arabicLineHeight = Math.max(arabicFontSize + 14, Math.round(arabicFontSize * 2.2));
  const translationFontSize = Math.max(10, Math.round(arabicFontSize * 0.5));
  const translationLineHeight = Math.max(
    translationFontSize + 4,
    Math.round(translationFontSize * 1.6)
  );

  const filteredWords = React.useMemo(
    () =>
      (words ?? [])
        .filter((word) => word.charTypeName !== 'end')
        .filter((word) => Boolean(word.uthmani?.trim())),
    [words]
  );

  const wordHorizontalMargin = showTranslations ? 6 : 5;
  const wordVerticalMargin = showTranslations ? 10 : 3;

  return (
    <View
      style={{
        width: '100%',
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        // With `row-reverse`, `flex-start` anchors the line to the right (RTL),
        // while `flex-end` anchors to the left (which looks wrong for Arabic).
        justifyContent: 'flex-start',
      }}
    >
      {filteredWords.map((word) => {
        const translationText = word.translationText?.trim();
        const isPressable = Boolean(onWordPress && translationText);
        const wrapperStyle = {
          marginHorizontal: wordHorizontalMargin,
          marginVertical: wordVerticalMargin,
          paddingHorizontal: 2,
          alignItems: 'center' as const,
        };

        const content = (
          <>
            <Text
              className="text-foreground dark:text-foreground-dark"
              style={{
                fontSize: arabicFontSize,
                lineHeight: arabicLineHeight,
                fontFamily: arabicFontFamily,
                writingDirection: 'rtl',
                textAlign: 'center',
                paddingHorizontal: 1,
              }}
            >
              {word.uthmani}
            </Text>

            {showTranslations && translationText ? (
              <Text
                className="text-muted dark:text-muted-dark"
                style={{
                  marginTop: 2,
                  fontSize: translationFontSize,
                  lineHeight: translationLineHeight,
                  textAlign: 'center',
                  writingDirection: 'auto',
                }}
              >
                {translationText}
              </Text>
            ) : null}
          </>
        );

        if (!isPressable) {
          return (
            <View key={word.id} style={wrapperStyle}>
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={word.id}
            onPress={() => onWordPress?.(word)}
            accessibilityRole="button"
            accessibilityLabel="Show word translation"
            style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }, wrapperStyle]}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}
