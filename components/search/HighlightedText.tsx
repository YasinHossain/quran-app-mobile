import React from 'react';
import { Text, type TextStyle } from 'react-native';

function decodeHtmlEntities(input: string): string {
  return (
    input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
        const codePoint = Number.parseInt(hex, 16);
        if (!Number.isFinite(codePoint)) return '';
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      })
      .replace(/&#(\d+);/g, (_, dec: string) => {
        const codePoint = Number.parseInt(dec, 10);
        if (!Number.isFinite(codePoint)) return '';
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      })
  );
}

type Token = { text: string; highlighted: boolean };

function tokenizeEmHtml(input: string): Token[] {
  if (!input) return [];

  // Keep <em> tags, drop everything else.
  const withMarkers = input
    .replace(/<\s*em\s*>/gi, '\u0001')
    .replace(/<\s*\/\s*em\s*>/gi, '\u0002');

  let stripped = withMarkers;
  let prev = '';
  while (stripped !== prev) {
    prev = stripped;
    stripped = stripped.replace(/<[^>]*>/g, '');
  }

  const decoded = decodeHtmlEntities(stripped);

  const tokens: Token[] = [];
  let buffer = '';
  let highlighted = false;

  const flush = (): void => {
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    const last = tokens[tokens.length - 1];
    if (last && last.highlighted === highlighted) {
      last.text += text;
      return;
    }
    tokens.push({ text, highlighted });
  };

  for (const ch of decoded) {
    if (ch === '\u0001') {
      flush();
      highlighted = true;
      continue;
    }
    if (ch === '\u0002') {
      flush();
      highlighted = false;
      continue;
    }
    buffer += ch;
  }
  flush();

  return tokens.filter((t) => t.text.length > 0);
}

export function HighlightedText({
  html,
  textStyle,
  highlightStyle,
  numberOfLines,
}: {
  html: string;
  textStyle?: TextStyle;
  highlightStyle?: TextStyle;
  numberOfLines?: number;
}): React.JSX.Element {
  const tokens = React.useMemo(() => tokenizeEmHtml(html), [html]);

  if (!tokens.length) {
    return (
      <Text numberOfLines={numberOfLines} style={textStyle}>
        {decodeHtmlEntities(html.replace(/<[^>]*>/g, ''))}
      </Text>
    );
  }

  return (
    <Text numberOfLines={numberOfLines} style={textStyle}>
      {tokens.map((token, idx) => (
        <Text key={`${idx}-${token.highlighted ? 'h' : 'n'}`} style={token.highlighted ? highlightStyle : undefined}>
          {token.text}
        </Text>
      ))}
    </Text>
  );
}

