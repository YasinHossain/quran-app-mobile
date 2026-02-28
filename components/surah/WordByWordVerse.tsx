import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { VerseWord } from '@/types';

import type { RegisterWordHighlight } from './useVerseAudioWordSync';

type WordPressBehavior = 'none' | 'translation' | 'seek';

const normalizeWordPosition = (word: VerseWord, fallback: number): number => {
  const raw = word.position;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const normalized = Math.trunc(raw);
    if (normalized > 0) return normalized;
  }
  return fallback;
};

function WordToken({
  verseKey,
  word,
  fallbackPosition,
  arabicFontSize,
  arabicFontFamily,
  showTranslations,
  pressBehavior,
  onWordPress,
  registerWordHighlight,
}: {
  verseKey: string | null;
  word: VerseWord;
  fallbackPosition: number;
  arabicFontSize: number;
  arabicFontFamily: string;
  showTranslations: boolean;
  pressBehavior: WordPressBehavior;
  onWordPress?: ((params: { word: VerseWord; wordPosition: number }) => void) | undefined;
  registerWordHighlight?: RegisterWordHighlight | undefined;
}): React.JSX.Element {
  const [isHighlighted, setHighlighted] = React.useState(false);
  const wordPosition = React.useMemo(
    () => normalizeWordPosition(word, fallbackPosition),
    [fallbackPosition, word]
  );

  React.useEffect(() => {
    if (!verseKey) return;
    if (!registerWordHighlight) return;
    return registerWordHighlight({ verseKey, wordPosition, setHighlighted });
  }, [registerWordHighlight, verseKey, wordPosition]);

  // Match the web's loose Arabic line-height so wrapped lines don't collide (especially with harakat).
  const arabicLineHeight = Math.max(arabicFontSize + 14, Math.round(arabicFontSize * 2.2));
  const translationFontSize = Math.max(10, Math.round(arabicFontSize * 0.5));
  const translationLineHeight = Math.max(
    translationFontSize + 4,
    Math.round(translationFontSize * 1.6)
  );

  const translationText = word.translationText?.trim();
  const isPressable = (() => {
    if (!onWordPress) return false;
    if (pressBehavior === 'seek') return true;
    if (pressBehavior === 'translation') return Boolean(translationText);
    return false;
  })();

  const wordHorizontalMargin = showTranslations ? 6 : 5;
  const wordVerticalMargin = showTranslations ? 10 : 3;
  const wrapperStyle = {
    marginHorizontal: wordHorizontalMargin,
    marginVertical: wordVerticalMargin,
    paddingHorizontal: 2,
    alignItems: 'center' as const,
  };

  const content = (
    <>
      <Text
        className={
          isHighlighted
            ? 'text-accent dark:text-accent-dark'
            : 'text-foreground dark:text-foreground-dark'
        }
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
    return <View style={wrapperStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => onWordPress?.({ word, wordPosition })}
      accessibilityRole="button"
      accessibilityLabel={pressBehavior === 'seek' ? 'Seek audio to word' : 'Show word translation'}
      style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }, wrapperStyle]}
    >
      {content}
    </Pressable>
  );
}

export function WordByWordVerse({
  verseKey,
  words,
  arabicFontSize,
  arabicFontFamily,
  showTranslations,
  pressBehavior = 'none',
  onWordPress,
  registerWordHighlight,
}: {
  verseKey?: string;
  words: VerseWord[];
  arabicFontSize: number;
  arabicFontFamily: string;
  showTranslations: boolean;
  pressBehavior?: WordPressBehavior | undefined;
  onWordPress?: ((params: { word: VerseWord; wordPosition: number }) => void) | undefined;
  registerWordHighlight?: RegisterWordHighlight | undefined;
}): React.JSX.Element {
  const filteredWords = React.useMemo(
    () =>
      (words ?? [])
        .filter((word) => word.charTypeName !== 'end')
        .filter((word) => Boolean(word.uthmani?.trim())),
    [words]
  );

  const resolvedVerseKey = typeof verseKey === 'string' ? verseKey.trim() : '';

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
      {filteredWords.map((word, index) => (
        <WordToken
          key={word.id}
          verseKey={resolvedVerseKey || null}
          word={word}
          fallbackPosition={index + 1}
          arabicFontSize={arabicFontSize}
          arabicFontFamily={arabicFontFamily}
          showTranslations={showTranslations}
          pressBehavior={pressBehavior}
          onWordPress={onWordPress}
          registerWordHighlight={registerWordHighlight}
        />
      ))}
    </View>
  );
}
