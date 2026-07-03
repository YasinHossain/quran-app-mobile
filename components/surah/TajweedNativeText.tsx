import * as Font from 'expo-font';
import * as FileSystem from 'expo-file-system/legacy';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

type TajweedGlyphRun = {
  fontFamily: string;
  fontFileUri: string;
  glyphs: string[];
};

type TajweedSegment = {
  className?: string | undefined;
  text: string;
};

const TAG_PATTERN = /<(tajweed|span)\s+[^>]*class=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/\1>/gi;
const DARK_PALETTE_COLOR_INDICES = [0, 1];
const darkPaletteFontCache = new Map<
  string,
  Promise<Pick<TajweedGlyphRun, 'fontFamily' | 'fontFileUri'> | null>
>();

const LIGHT_TAJWEED_COLORS: Record<string, string> = {
  ham_wasl: '#8A8F98',
  silent: '#8A8F98',
  slnt: '#8A8F98',
  laam_shamsiyah: '#D05A00',
  madda_normal: '#2563EB',
  madda_permissible: '#4F46E5',
  madda_necessary: '#1D4ED8',
  madda_obligatory: '#1E40AF',
  qalaqah: '#DC2626',
  qalqalah: '#DC2626',
  ghunnah: '#B45309',
  ikhfa: '#9333EA',
  ikhafa: '#9333EA',
  ikhfa_shafawi: '#C026D3',
  iqlab: '#0891B2',
  idgham_ghunnah: '#16A34A',
  idgham_wo_ghunnah: '#15803D',
  idgham_shafawi: '#16A34A',
  idgham_mutajanisayn: '#0F766E',
  idgham_mutaqaribayn: '#0D9488',
  end: '#64748B',
};

const DARK_TAJWEED_COLORS: Record<string, string> = {
  ham_wasl: '#AEB6C2',
  silent: '#AEB6C2',
  slnt: '#AEB6C2',
  laam_shamsiyah: '#FB923C',
  madda_normal: '#60A5FA',
  madda_permissible: '#818CF8',
  madda_necessary: '#93C5FD',
  madda_obligatory: '#BFDBFE',
  qalaqah: '#F87171',
  qalqalah: '#F87171',
  ghunnah: '#FBBF24',
  ikhfa: '#C084FC',
  ikhafa: '#C084FC',
  ikhfa_shafawi: '#E879F9',
  iqlab: '#22D3EE',
  idgham_ghunnah: '#4ADE80',
  idgham_wo_ghunnah: '#86EFAC',
  idgham_shafawi: '#4ADE80',
  idgham_mutajanisayn: '#5EEAD4',
  idgham_mutaqaribayn: '#2DD4BF',
  end: '#CBD5E1',
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function parseTajweedSegments(markup: string): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  TAG_PATTERN.lastIndex = 0;

  while ((match = TAG_PATTERN.exec(markup)) !== null) {
    if (match.index > cursor) {
      segments.push({
        text: decodeHtmlEntities(stripTags(markup.slice(cursor, match.index))),
      });
    }

    const className = (match[2] ?? match[3] ?? match[4] ?? '').trim().split(/\s+/)[0];
    const text = decodeHtmlEntities(stripTags(match[5] ?? ''));
    if (text) {
      segments.push({ className: className || undefined, text });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < markup.length) {
    segments.push({
      text: decodeHtmlEntities(stripTags(markup.slice(cursor))),
    });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function getRunsSignature(glyphRuns: TajweedGlyphRun[]): string {
  return glyphRuns
    .map((run) => [run.fontFamily, run.fontFileUri, run.glyphs.join('')].join(':'))
    .join('\u0000');
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    data[offset] * 0x1000000 +
    ((data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3])
  );
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    data[index] = binary.charCodeAt(index);
  }
  return data;
}

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

function parseHexColor(color: string): { red: number; green: number; blue: number; alpha: number } | null {
  const normalized = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(normalized)) return null;

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
    alpha: normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255,
  };
}

function patchCpalPaletteColor(base64Font: string, color: string): string | null {
  const targetColor = parseHexColor(color);
  if (!targetColor) return null;

  const data = decodeBase64(base64Font);
  if (data.length < 12) return null;

  const numTables = readUint16(data, 4);
  let cpalOffset = -1;
  let cpalLength = 0;

  for (let tableIndex = 0; tableIndex < numTables; tableIndex += 1) {
    const recordOffset = 12 + tableIndex * 16;
    if (recordOffset + 16 > data.length) break;

    const tag = String.fromCharCode(
      data[recordOffset],
      data[recordOffset + 1],
      data[recordOffset + 2],
      data[recordOffset + 3]
    );
    if (tag === 'CPAL') {
      cpalOffset = readUint32(data, recordOffset + 8);
      cpalLength = readUint32(data, recordOffset + 12);
      break;
    }
  }

  if (cpalOffset < 0 || cpalOffset + 12 > data.length || cpalOffset + cpalLength > data.length) {
    return null;
  }

  const numPaletteEntries = readUint16(data, cpalOffset + 2);
  const numPalettes = readUint16(data, cpalOffset + 4);
  const numColorRecords = readUint16(data, cpalOffset + 6);
  const colorRecordsArrayOffset = readUint32(data, cpalOffset + 8);
  const colorRecordIndexOffset = cpalOffset + 12;
  const colorRecordsOffset = cpalOffset + colorRecordsArrayOffset;

  if (
    numPaletteEntries < 2 ||
    numPalettes < 1 ||
    colorRecordIndexOffset + numPalettes * 2 > data.length ||
    colorRecordsOffset + numColorRecords * 4 > data.length
  ) {
    return null;
  }

  for (let paletteIndex = 0; paletteIndex < numPalettes; paletteIndex += 1) {
    const firstColorRecordIndex = readUint16(data, colorRecordIndexOffset + paletteIndex * 2);
    for (const colorIndex of DARK_PALETTE_COLOR_INDICES) {
      const colorRecordIndex = firstColorRecordIndex + colorIndex;
      if (colorRecordIndex >= numColorRecords) continue;

      const colorOffset = colorRecordsOffset + colorRecordIndex * 4;
      data[colorOffset] = targetColor.blue;
      data[colorOffset + 1] = targetColor.green;
      data[colorOffset + 2] = targetColor.red;
      data[colorOffset + 3] = targetColor.alpha;
    }
  }

  return encodeBase64(data);
}

function getDarkPaletteFontUri(fontFileUri: string, color: string): string | null {
  if (!FileSystem.cacheDirectory) return null;
  const key = `${fontFileUri}:${color}`.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${FileSystem.cacheDirectory}tajweed-font-palettes/${key}.ttf`;
}

async function buildDarkPaletteFont(
  fontFamily: string,
  fontFileUri: string,
  color: string
): Promise<Pick<TajweedGlyphRun, 'fontFamily' | 'fontFileUri'> | null> {
  const cacheKey = `${fontFamily}:${fontFileUri}:${color}`;
  const cached = darkPaletteFontCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const darkFontFileUri = getDarkPaletteFontUri(fontFileUri, color);
    if (!darkFontFileUri) return null;

    const darkFontFamily = `${fontFamily}-dark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
    const existing = await FileSystem.getInfoAsync(darkFontFileUri);
    if (!existing.exists) {
      const originalBase64 = await FileSystem.readAsStringAsync(fontFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const patchedBase64 = patchCpalPaletteColor(originalBase64, color);
      if (!patchedBase64) return null;

      await FileSystem.makeDirectoryAsync(`${FileSystem.cacheDirectory}tajweed-font-palettes/`, {
        intermediates: true,
      });
      await FileSystem.writeAsStringAsync(darkFontFileUri, patchedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    return {
      fontFamily: darkFontFamily,
      fontFileUri: darkFontFileUri,
    };
  })();

  darkPaletteFontCache.set(cacheKey, promise);
  return promise;
}

function FallbackTajweedText({
  arabicFontFamily,
  fontSize,
  lineHeight,
  text,
}: {
  arabicFontFamily: string;
  fontSize: number;
  lineHeight: number;
  text: string;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const tajweedColors = resolvedTheme === 'dark' ? DARK_TAJWEED_COLORS : LIGHT_TAJWEED_COLORS;
  const segments = React.useMemo(() => parseTajweedSegments(text), [text]);

  return (
    <Text
      selectable
      allowFontScaling={false}
      style={[
        styles.text,
        {
          color: palette.text,
          fontFamily: arabicFontFamily,
          fontSize,
          lineHeight,
        },
      ]}
    >
      {segments.map((segment, index) => {
        const color = segment.className ? tajweedColors[segment.className] : undefined;
        return (
          <Text
            key={`${index}:${segment.className ?? 'base'}:${segment.text}`}
            allowFontScaling={false}
            style={color ? { color } : undefined}
          >
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

export function TajweedNativeText({
  arabicFontFamily,
  fallbackText,
  fontSize,
  glyphRuns,
  lineHeight,
}: {
  arabicFontFamily: string;
  fallbackText?: string | undefined;
  fontSize: number;
  glyphRuns: TajweedGlyphRun[];
  lineHeight: number;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const validGlyphRuns = React.useMemo(
    () =>
      glyphRuns
        .map((run) => ({
          ...run,
          glyphs: run.glyphs.filter((glyph) => glyph.trim().length > 0),
        }))
        .filter((run) => run.fontFamily.trim() && run.fontFileUri.trim() && run.glyphs.length > 0),
    [glyphRuns]
  );
  const runsSignature = React.useMemo(() => getRunsSignature(validGlyphRuns), [validGlyphRuns]);
  const [renderGlyphRuns, setRenderGlyphRuns] = React.useState(validGlyphRuns);
  const renderRunsSignature = React.useMemo(
    () => getRunsSignature(renderGlyphRuns),
    [renderGlyphRuns]
  );
  const [, setFontLoadRevision] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    if (resolvedTheme !== 'dark') {
      setRenderGlyphRuns(validGlyphRuns);
      return;
    }

    void Promise.all(
      validGlyphRuns.map((run) =>
        buildDarkPaletteFont(run.fontFamily, run.fontFileUri, palette.text).then((darkFont) => ({
          ...run,
          ...(darkFont ?? {}),
        }))
      )
    )
      .then((nextRuns) => {
        if (!cancelled) {
          setRenderGlyphRuns(nextRuns);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRenderGlyphRuns(validGlyphRuns);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [palette.text, resolvedTheme, runsSignature, validGlyphRuns]);

  React.useEffect(() => {
    let cancelled = false;
    setFontLoadRevision((revision) => revision + 1);

    const unloadedRuns = renderGlyphRuns.filter((run) => !Font.isLoaded(run.fontFamily));
    if (unloadedRuns.length === 0) return;

    void Promise.all(
      unloadedRuns.map((run) =>
        Font.loadAsync({
          [run.fontFamily]: { uri: run.fontFileUri },
        })
      )
    )
      .then(() => {
        if (!cancelled) {
          setFontLoadRevision((revision) => revision + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFontLoadRevision((revision) => revision + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [renderRunsSignature, renderGlyphRuns]);

  const fallbackMarkup = fallbackText?.trim() ? fallbackText : undefined;

  if (fallbackMarkup && renderGlyphRuns.length === 0) {
    return (
      <FallbackTajweedText
        text={fallbackMarkup}
        fontSize={fontSize}
        lineHeight={lineHeight}
        arabicFontFamily={arabicFontFamily}
      />
    );
  }

  return (
    <Text
      selectable
      allowFontScaling={false}
      style={[
        styles.text,
        {
          color: palette.text,
          fontSize,
          lineHeight,
        },
      ]}
    >
      {renderGlyphRuns.map((run, runIndex) => (
        <Text
          key={`${run.fontFamily}:${runIndex}`}
          allowFontScaling={false}
          style={{ color: palette.text, fontFamily: run.fontFamily }}
        >
          {run.glyphs.join('')}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    includeFontPadding: false,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
