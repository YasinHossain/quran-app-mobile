import React from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import RenderHtml from 'react-native-render-html';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function htmlToPlainText(input: string): string {
  const withBreaks = input
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])\s*>/gi, '\n\n')
    .replace(/<(p|div|h[1-6])[^>]*>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/(ul|ol)\s*>/gi, '\n')
    .replace(/<(ul|ol)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(withBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function TafsirHtml({
  html,
  fontSize,
  contentKey,
}: {
  html: string;
  fontSize: number;
  contentKey?: string;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const baseStyle = React.useMemo(
    () => ({
      color: palette.text,
      fontSize,
      lineHeight: Math.max(fontSize + 10, Math.round(fontSize * 1.75)),
    }),
    [fontSize, palette.text]
  );

  const tagsStyles = React.useMemo(
    () => ({
      h1: {
        color: palette.text,
        fontSize: Math.round(fontSize * 1.25),
        lineHeight: Math.round(fontSize * 1.8),
        marginTop: 8,
        marginBottom: 10,
        fontWeight: '700' as const,
      },
      h2: {
        color: palette.text,
        fontSize: Math.round(fontSize * 1.15),
        lineHeight: Math.round(fontSize * 1.7),
        marginTop: 8,
        marginBottom: 8,
        fontWeight: '700' as const,
      },
      h3: {
        color: palette.text,
        fontSize: Math.round(fontSize * 1.05),
        lineHeight: Math.round(fontSize * 1.65),
        marginTop: 8,
        marginBottom: 6,
        fontWeight: '700' as const,
      },
      p: {
        marginTop: 6,
        marginBottom: 6,
        color: palette.text,
      },
      a: {
        color: palette.tint,
      },
      li: {
        marginBottom: 4,
      },
    }),
    [fontSize, palette.text, palette.tint]
  );

  const contentWidth = Math.max(0, width - 32);
  const plainText = React.useMemo(() => {
    const text = htmlToPlainText(html);
    return text.length ? text : 'No tafsir content available for this verse.';
  }, [html]);

  const paragraphs = React.useMemo(() => {
    return plainText
      .split(/\n{2,}/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, [plainText]);

  return (
    <View collapsable={false}>
      {Platform.OS === 'web' ? (
        <RenderHtml
          key={contentKey}
          contentWidth={contentWidth}
          source={{ html }}
          baseStyle={baseStyle}
          tagsStyles={tagsStyles}
        />
      ) : (
        <View>
          {(paragraphs.length ? paragraphs : [plainText]).map((paragraph, index) => (
            <Text
              key={`${contentKey ?? 'tafsir'}-${index}`}
              style={[
                baseStyle,
                {
                  writingDirection: 'auto',
                  textAlign: 'left',
                  marginBottom: index === paragraphs.length - 1 ? 0 : 14,
                },
              ]}
            >
              {paragraph}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
