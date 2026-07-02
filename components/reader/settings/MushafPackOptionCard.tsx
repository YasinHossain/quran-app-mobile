import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { ResourceDownloadAction } from '@/components/reader/settings/resource-panel/ResourceDownloadAction';
import type {
  DownloadProgress,
  DownloadStatus,
} from '@/src/core/domain/entities/DownloadIndexItem';
import {
  DEFAULT_ARABIC_FONT_FAMILY,
  loadFontFamilyAsync,
  type AppFontFamily,
} from '@/src/core/infrastructure/fonts/arabicFonts';

type ActionTone = 'default' | 'accent' | 'danger';

type MushafPackOptionAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean | undefined;
  tone?: ActionTone | undefined;
};

type PreviewLineSegment = {
  text: string;
  isMarker?: boolean;
};

const getFontForPack = (packId: string): AppFontFamily => {
  if (packId.includes('indopak')) {
    return 'IndoPak';
  }
  if (packId.includes('madani')) {
    return 'KFGQ V2';
  }
  return 'UthmanicHafs1Ver18';
};

const line = (...segments: Array<string | PreviewLineSegment>): PreviewLineSegment[] =>
  segments.map((segment) => (typeof segment === 'string' ? { text: segment } : segment));

const marker = (text: string): PreviewLineSegment => ({ text, isMarker: true });

const getPreviewLinesForPack = (packId: string): PreviewLineSegment[][] => {
  if (packId.includes('indopak')) {
    return [
      line('الٓمّٓ ', marker('﴿۱﴾'), ' اَللّٰهُ لَاۤ اِلٰهَ اِلَّا هُوَ الۡحَىُّ الۡقَيُّوۡمُ ', marker('﴿۲﴾')),
      line('نَزَّلَ عَلَيۡكَ الۡكِتٰبَ بِالۡحَقِّ مُصَدِّقًا لِّمَا بَيۡنَ يَدَيۡهِ'),
      line('وَاَنۡزَلَ التَّوۡرٰٮةَ وَالۡاِنۡجِيۡلَ ', marker('﴿۳﴾'), ' مِنۡ قَبۡلُ هُدًى لِّلنَّاسِ'),
    ];
  }
  return [
    line('الٓمٓ ', marker('١'), ' ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ', marker('٢')),
    line('نَزَّلَ عَلَيْكَ ٱلْكِتَـٰبَ بِٱلْحَقِّ مُصَدِّقًا لِّمَا بَيْنَ يَدَيْهِ'),
    line('وَأَنزَلَ ٱلتَّوْرَىٰةَ وَٱلْإِنجِيلَ ', marker('٣'), ' مِن قَبْلُ هُدًى لِّلنَّاسِ'),
  ];
};

const getPreviewTypographyForPack = (packId: string): { fontSize: number; lineHeight: number } => {
  if (packId.includes('indopak')) {
    return { fontSize: 18, lineHeight: 23 };
  }
  if (packId.includes('madani')) {
    return { fontSize: 19, lineHeight: 22 };
  }
  return { fontSize: 19, lineHeight: 22 };
};

type ExactPreviewPackId = 'qcf-madani-v1' | 'qcf-madani-v2' | 'qcf-tajweed-v4';

function isExactPreviewPack(packId?: string): packId is ExactPreviewPackId {
  return packId === 'qcf-madani-v1' || packId === 'qcf-madani-v2' || packId === 'qcf-tajweed-v4';
}

const EXACT_PREVIEW_LINES = {
  'qcf-madani-v1': ['ﭑﭒﭓﭔﭕﭖﭗﭘﭙﭚﭛﭜﭝ', 'ﭞﭟﭠﭡﭢﭣﭤﭥﭦﭧ', 'ﭨﭩﭪﭫﭬﭭﭮﭯﭰﭱﭲ'],
  'qcf-madani-v2': ['ﱁﱂﱃﱄﱅﱆﱇﱈﱉﱊﱋﱌﱍ', 'ﱎﱏﱐﱑﱒﱓﱔﱕﱖﱗ', 'ﱘﱙﱚﱛﱜﱝﱞﱟﱠﱡﱢ'],
  'qcf-tajweed-v4': ['ﱁﱂﱃﱄﱅﱆﱇﱈﱉﱊﱋﱌﱍ', 'ﱎﱏﱐﱑﱒﱓﱔﱕﱖﱗ', 'ﱘﱙﱚﱛﱜﱝﱞﱟﱠﱡﱢ'],
} as const;

function colorizeTajweedLine(lineText: string): string {
  const colors = ['#1D9A6C', '#D14343', '#2F6FDB', '#8A5B16'];
  return Array.from(lineText)
    .map((glyph, index) => `<span style="color:${colors[index % colors.length]}">${glyph}</span>`)
    .join('');
}

function buildExactPreviewHtml(packId: ExactPreviewPackId, color: string): string {
  const isV1 = packId === 'qcf-madani-v1';
  const isTajweed = packId === 'qcf-tajweed-v4';
  const fontVersion = isV1 ? 'v1' : 'v2';
  const fontUrl = `https://verses.quran.foundation/fonts/quran/hafs/${fontVersion}/woff2/p50.woff2`;
  const lines = EXACT_PREVIEW_LINES[packId];
  const fontSize = isV1 ? 18 : 16;
  const lineHeight = isV1 ? 23 : 22;
  const lineGap = 1;
  const horizontalPadding = isV1 ? 12 : 22;

  return `<!doctype html>
<html dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      @font-face {
        font-family: "QCFPreview";
        src: url("${fontUrl}") format("woff2");
        font-display: block;
      }
      html,
      body {
        background: transparent;
        height: 100%;
        margin: 0;
        overflow: hidden;
        padding: 0;
        width: 100%;
      }
      body {
        align-items: center;
        color: ${color};
        display: flex;
        justify-content: center;
      }
      .preview {
        box-sizing: border-box;
        direction: rtl;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 84px;
        padding: 0 ${horizontalPadding}px;
        text-align: center;
        width: 100%;
      }
      .line {
        color: ${color};
        direction: rtl;
        font-family: "QCFPreview", serif;
        font-size: ${fontSize}px;
        height: ${lineHeight}px;
        line-height: ${lineHeight}px;
        overflow: hidden;
        text-align: center;
        white-space: nowrap;
      }
      .line + .line {
        margin-top: ${lineGap}px;
      }
    </style>
  </head>
  <body>
    <main class="preview" aria-label="King Fahad preview">
      ${lines.map((previewLine) => `<div class="line">${isTajweed ? colorizeTajweedLine(previewLine) : previewLine}</div>`).join('')}
    </main>
  </body>
</html>`;
}

function ExactMushafPreview({
  color,
  packId,
}: {
  color: string;
  packId?: string;
}): React.JSX.Element {
  const exactPackId = isExactPreviewPack(packId) ? packId : 'qcf-madani-v1';
  const html = React.useMemo(
    () => buildExactPreviewHtml(exactPackId, color),
    [color, exactPackId]
  );

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      scrollEnabled={false}
      nestedScrollEnabled={false}
      javaScriptEnabled={false}
      domStorageEnabled={false}
      setSupportMultipleWindows={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bounces={false}
      automaticallyAdjustContentInsets={false}
      style={{ backgroundColor: 'transparent', height: 84, width: '100%' }}
    />
  );
}
const cardShadow = {
  ...Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    android: {
      elevation: 1,
    },
  }),
};

export function MushafPackOptionCard({
  packId,
  title,
  downloadProgress,
  downloadStatus,
  progressLabel,
  errorMessage,
  isSelected,
  primaryAction,
  secondaryAction,
}: {
  packId?: string;
  title: string;
  downloadProgress?: DownloadProgress | undefined;
  downloadStatus?: DownloadStatus | undefined;
  description?: string;
  statusLabel?: string;
  progressLabel?: string | null;
  errorMessage?: string | null;
  sourceLabel?: string | null;
  isSelected?: boolean;
  primaryAction?: MushafPackOptionAction | undefined;
  secondaryAction?: MushafPackOptionAction | undefined;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const isDark = resolvedTheme === 'dark';
  const palette = Colors[resolvedTheme];

  const isSelectable = primaryAction && !primaryAction.disabled && !isSelected;
  const isBundledUnicodePack = packId === 'unicode-uthmani-v1';
  const trailingAction = secondaryAction ?? (isBundledUnicodePack ? undefined : primaryAction);
  const hasTrailingAction = Boolean(trailingAction);
  const requestedFontFamily = getFontForPack(packId || '');
  const [loadedPreviewFontFamily, setLoadedPreviewFontFamily] =
    React.useState<AppFontFamily | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    setLoadedPreviewFontFamily(null);

    void loadFontFamilyAsync(requestedFontFamily)
      .then(() => {
        if (isMounted) {
          setLoadedPreviewFontFamily(requestedFontFamily);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadedPreviewFontFamily(DEFAULT_ARABIC_FONT_FAMILY);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [requestedFontFamily]);

  const handleCardPress = () => {
    if (isSelectable) {
      primaryAction.onPress();
    }
  };

  const fontStyle = loadedPreviewFontFamily ?? DEFAULT_ARABIC_FONT_FAMILY;
  const previewLines = getPreviewLinesForPack(packId || '');
  const previewTypography = getPreviewTypographyForPack(packId || '');
  const markerFontFamily = packId?.includes('indopak') ? fontStyle : DEFAULT_ARABIC_FONT_FAMILY;
  const previewTextColor = resolvedTheme === 'dark' ? '#FFFFFF' : '#374151';
  const isExactPreview = isExactPreviewPack(packId);

  // Theme background colors matching card surfaces to avoid blending with page background
  const bgColor = isSelected
    ? (isDark ? '#14B8A6' : '#0D9488') // Emerald green when selected
    : (isDark ? '#1E293B' : '#FFFFFF'); // Card surface bg when not selected (matching bg-surface)

  const borderColor = isSelected
    ? (isDark ? '#14B8A6' : '#0D9488')
    : (isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(229, 231, 235, 0.5)'); // border/50 equivalent

  // Inner box background matches settings sidebar page background (off-white/dark)
  const innerBgColor = isDark ? '#0F172A' : '#F7F9F9';

  return (
    <Pressable
      onPress={isSelectable ? handleCardPress : undefined}
      disabled={!isSelectable}
      style={({ pressed }) => ({
        opacity: isSelectable && pressed ? 0.92 : 1,
      })}
    >
      <View
        className="rounded-xl"
        style={[
          cardShadow,
          {
            backgroundColor: bgColor,
            borderColor: borderColor,
            borderWidth: 1,
            borderStyle: 'solid',
            // Even thinner symmetrical padding on left, right, and bottom (8px)
            paddingTop: 12,
            paddingRight: 8,
            paddingBottom: 8,
            paddingLeft: 8,
          },
        ]}
      >
        <View className="flex-row items-center justify-between gap-3 mb-2" style={{ paddingHorizontal: 4 }}>
          <Text
            className={[
              'text-base font-bold flex-1',
              isSelected
                ? 'text-on-accent dark:text-on-accent-dark'
                : 'text-content-primary dark:text-content-primary-dark',
            ].join(' ')}
          >
            {title}
          </Text>
          
          {hasTrailingAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={trailingAction?.label}
              onPress={trailingAction?.onPress}
              disabled={trailingAction?.disabled}
              hitSlop={8}
              style={({ pressed }) => {
                const isActiveProgress =
                  downloadStatus === 'queued' ||
                  downloadStatus === 'downloading' ||
                  downloadStatus === 'deleting';
                return {
                  opacity: trailingAction?.disabled && !isActiveProgress ? 0.45 : pressed ? 0.7 : 1,
                };
              }}
            >
              <ResourceDownloadAction
                status={downloadStatus}
                progress={downloadProgress}
                isSelected={Boolean(isSelected)}
                isDark={isDark}
                tintColor={palette.tint}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Inset preview box: off-white/dark bg matching page background, borderless */}
        <View
          className="rounded-md h-24 justify-center"
          style={{
            backgroundColor: innerBgColor,
            overflow: 'hidden',
            paddingHorizontal: 14,
            paddingVertical: isExactPreview ? 6 : 10,
          }}
        >
          {isExactPreview ? (
            <ExactMushafPreview color={previewTextColor} packId={packId} />
          ) : previewLines.map((lineSegments, lineIndex) => (
            <Text
              key={`preview-line-${lineIndex}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={{
                fontFamily: fontStyle,
                fontSize: previewTypography.fontSize,
                lineHeight: previewTypography.lineHeight,
                color: previewTextColor,
                includeFontPadding: false,
                textAlign: 'center',
                writingDirection: 'rtl',
                width: '100%',
              }}
            >
              {lineSegments.map((segment, segmentIndex) => (
                <Text
                  key={`preview-line-${lineIndex}-segment-${segmentIndex}`}
                  style={
                    segment.isMarker
                      ? {
                          fontFamily: markerFontFamily,
                          fontSize: previewTypography.fontSize,
                          lineHeight: previewTypography.lineHeight,
                          includeFontPadding: false,
                        }
                      : undefined
                  }
                >
                  {segment.text}
                </Text>
              ))}
            </Text>
          ))}
        </View>

        {progressLabel ? (
          <Text
            className={[
              'mt-2 text-xs text-center font-medium',
              isSelected ? 'text-on-accent/90' : 'text-muted dark:text-muted-dark',
            ].join(' ')}
          >
            {progressLabel}
          </Text>
        ) : null}

        {errorMessage ? (
          <Text
            className={[
              'mt-2 text-xs text-center font-semibold',
              isSelected ? 'text-white' : 'text-error dark:text-error-dark',
            ].join(' ')}
          >
            {errorMessage}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
