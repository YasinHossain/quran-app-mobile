import * as Font from 'expo-font';
import * as FileSystem from 'expo-file-system/legacy';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export type TajweedGlyphRun = {
  fontFamily: string;
  fontFileUri: string;
  glyphs: string[];
};

const DARK_PALETTE_COLOR_INDICES = [0, 1];
const DEBUG_DISABLE_TAJWEED_DARK_PALETTE = false;
const darkPaletteFontCache = new Map<
  string,
  Promise<Pick<TajweedGlyphRun, 'fontFamily' | 'fontFileUri'> | null>
>();
const fontLoadCache = new Map<string, Promise<void>>();

function getRunsSignature(glyphRuns: TajweedGlyphRun[]): string {
  return glyphRuns
    .map((run) => [run.fontFamily, run.fontFileUri, run.glyphs.join('')].join(':'))
    .join('\u0000');
}

function normalizeGlyphRuns(glyphRuns: TajweedGlyphRun[]): TajweedGlyphRun[] {
  return glyphRuns
    .map((run) => ({
      ...run,
      glyphs: run.glyphs.filter((glyph) => glyph.trim().length > 0),
    }))
    .filter((run) => run.fontFamily.trim() && run.fontFileUri.trim() && run.glyphs.length > 0);
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

function getDarkPaletteFontFamily(fontFamily: string, color: string): string {
  return `${fontFamily}-dark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
}

function resolveReadyGlyphRuns(
  glyphRuns: TajweedGlyphRun[],
  resolvedTheme: 'light' | 'dark',
  textColor: string
): TajweedGlyphRun[] {
  if (glyphRuns.length === 0) return [];

  if (resolvedTheme !== 'dark' || DEBUG_DISABLE_TAJWEED_DARK_PALETTE) {
    return glyphRuns.every((run) => Font.isLoaded(run.fontFamily)) ? glyphRuns : [];
  }

  const darkRuns = glyphRuns.map((run) => {
    const darkFontFileUri = getDarkPaletteFontUri(run.fontFileUri, textColor);
    const darkFontFamily = getDarkPaletteFontFamily(run.fontFamily, textColor);
    if (!darkFontFileUri || !Font.isLoaded(darkFontFamily)) return null;

    return {
      ...run,
      fontFamily: darkFontFamily,
      fontFileUri: darkFontFileUri,
    };
  });

  return darkRuns.every((run): run is TajweedGlyphRun => run !== null) ? darkRuns : [];
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

    const darkFontFamily = getDarkPaletteFontFamily(fontFamily, color);
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

async function loadTajweedFontAsync(fontFamily: string, fontFileUri: string): Promise<void> {
  if (Font.isLoaded(fontFamily)) return;

  const cacheKey = `${fontFamily}:${fontFileUri}`;
  const cached = fontLoadCache.get(cacheKey);
  if (cached) {
    await cached;
    return;
  }

  const promise = Font.loadAsync({
    [fontFamily]: { uri: fontFileUri },
  }).finally(() => {
    fontLoadCache.delete(cacheKey);
  });

  fontLoadCache.set(cacheKey, promise);
  await promise;
}

export async function preloadTajweedGlyphRunFontsAsync(
  glyphRuns: TajweedGlyphRun[],
  options?: { resolvedTheme?: 'light' | 'dark'; textColor?: string }
): Promise<void> {
  const validGlyphRuns = normalizeGlyphRuns(glyphRuns);
  if (validGlyphRuns.length === 0) return;

  const uniqueRuns = new Map<string, Pick<TajweedGlyphRun, 'fontFamily' | 'fontFileUri'>>();
  for (const run of validGlyphRuns) {
    uniqueRuns.set(`${run.fontFamily}:${run.fontFileUri}`, run);
  }

  await Promise.all(
    Array.from(uniqueRuns.values()).map((run) =>
      loadTajweedFontAsync(run.fontFamily, run.fontFileUri)
    )
  );

  if (!DEBUG_DISABLE_TAJWEED_DARK_PALETTE && options?.resolvedTheme === 'dark' && options.textColor) {
    await Promise.all(
      validGlyphRuns.map(async (run) => {
        const darkFont = await buildDarkPaletteFont(run.fontFamily, run.fontFileUri, options.textColor!);
        if (darkFont) {
          await loadTajweedFontAsync(darkFont.fontFamily, darkFont.fontFileUri);
        }
      })
    );
  }
}

export function areTajweedGlyphRunFontsLoaded(
  glyphRuns: TajweedGlyphRun[],
  options?: { resolvedTheme?: 'light' | 'dark'; textColor?: string }
): boolean {
  const validGlyphRuns = normalizeGlyphRuns(glyphRuns);
  if (validGlyphRuns.length === 0) return false;

  return validGlyphRuns.every((run) => {
    if (!DEBUG_DISABLE_TAJWEED_DARK_PALETTE && options?.resolvedTheme === 'dark' && options.textColor) {
      const darkFontFileUri = getDarkPaletteFontUri(run.fontFileUri, options.textColor);
      if (darkFontFileUri) {
        return Font.isLoaded(getDarkPaletteFontFamily(run.fontFamily, options.textColor));
      }
    }

    return Font.isLoaded(run.fontFamily);
  });
}

export function TajweedNativeText({
  fallbackFontFamily,
  fallbackText,
  fontSize,
  glyphRuns,
  lineHeight,
}: {
  fallbackFontFamily?: string;
  fallbackText?: string;
  fontSize: number;
  glyphRuns: TajweedGlyphRun[];
  lineHeight: number;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const validGlyphRuns = React.useMemo(() => normalizeGlyphRuns(glyphRuns), [glyphRuns]);
  const runsSignature = React.useMemo(() => getRunsSignature(validGlyphRuns), [validGlyphRuns]);
  const [renderGlyphRuns, setRenderGlyphRuns] = React.useState<TajweedGlyphRun[]>(() =>
    resolveReadyGlyphRuns(validGlyphRuns, resolvedTheme, palette.text)
  );
  const renderRunsSignature = React.useMemo(
    () => getRunsSignature(renderGlyphRuns),
    [renderGlyphRuns]
  );
  const [, setFontLoadRevision] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    if (resolvedTheme !== 'dark' || DEBUG_DISABLE_TAJWEED_DARK_PALETTE) {
      setRenderGlyphRuns(
        validGlyphRuns.every((run) => Font.isLoaded(run.fontFamily)) ? validGlyphRuns : []
      );
      return;
    }

    const readyGlyphRuns = resolveReadyGlyphRuns(validGlyphRuns, resolvedTheme, palette.text);
    if (readyGlyphRuns.length > 0) {
      setRenderGlyphRuns(readyGlyphRuns);
      return;
    }

    setRenderGlyphRuns([]);

    void Promise.all(
      validGlyphRuns.map(async (run) => {
        const darkFont = await buildDarkPaletteFont(run.fontFamily, run.fontFileUri, palette.text);
        return darkFont ? { ...run, ...darkFont } : null;
      })
    )
      .then((nextRuns) => {
        if (!cancelled) {
          setRenderGlyphRuns(
            nextRuns.every((run): run is TajweedGlyphRun => run !== null) ? nextRuns : []
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRenderGlyphRuns([]);
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

    void Promise.all(unloadedRuns.map((run) => loadTajweedFontAsync(run.fontFamily, run.fontFileUri)))
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

  const areFontsReady =
    renderGlyphRuns.length > 0 && renderGlyphRuns.every((run) => Font.isLoaded(run.fontFamily));

  if (!areFontsReady) {
    const resolvedFallbackText = fallbackText?.trim();

    return (
      <Text
        selectable={Boolean(resolvedFallbackText)}
        allowFontScaling={false}
        style={[
          styles.text,
          {
            color: resolvedFallbackText ? palette.text : 'transparent',
            fontSize,
            ...(fallbackFontFamily ? { fontFamily: fallbackFontFamily } : {}),
            lineHeight,
            minHeight: lineHeight,
          },
        ]}
      >
        {resolvedFallbackText || ' '}
      </Text>
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
          key={`${run.fontFamily}:${runIndex}:${run.glyphs.join('')}`}
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
