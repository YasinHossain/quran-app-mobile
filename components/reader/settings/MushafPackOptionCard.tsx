import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
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

function isExactKingFahadPack(packId?: string): boolean {
  return packId === 'qcf-madani-v1' || packId === 'qcf-madani-v2';
}

function ExactKingFahadPreview({
  color,
  fontFamily,
  packId,
}: {
  color: string;
  fontFamily: AppFontFamily;
  packId?: string;
}): React.JSX.Element {
  const isV2 = packId === 'qcf-madani-v2';
  const markerSize = isV2 ? 17 : 19;
  const markerBorderWidth = isV2 ? 1.4 : 1.8;
  const textSize = isV2 ? 14 : 13;
  const rowGap = isV2 ? 4 : 3;
  const rows = isV2
    ? [
        ['الٓمٓ', '١', 'ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ', '٢'],
        ['ٱلْحَىُّ ٱلْقَيُّومُ نَزَّلَ عَلَيْكَ ٱلْكِتَـٰبَ'],
        ['بِٱلْحَقِّ مُصَدِّقًا لِّمَا بَيْنَ يَدَيْهِ'],
        ['وَأَنزَلَ ٱلتَّوْرَىٰةَ وَٱلْإِنجِيلَ', '٣'],
      ]
    : [
        ['الٓمٓ', '١', 'ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ', '٢'],
        ['ٱلْحَىُّ ٱلْقَيُّومُ نَزَّلَ عَلَيْكَ'],
        ['ٱلْكِتَـٰبَ بِٱلْحَقِّ مُصَدِّقًا'],
        ['لِّمَا بَيْنَ يَدَيْهِ وَأَنزَلَ ٱلتَّوْرَىٰةَ'],
        ['وَٱلْإِنجِيلَ', '٣', 'مِن قَبْلُ هُدًى لِّلنَّاسِ'],
      ];

  return (
    <View style={{ gap: rowGap }}>
      {rows.map((row, rowIndex) => (
        <View
          key={`exact-preview-row-${rowIndex}`}
          style={{
            alignItems: 'center',
            flexDirection: 'row-reverse',
            justifyContent: 'center',
            gap: isV2 ? 5 : 4,
            minHeight: isV2 ? 16 : 14,
          }}
        >
          {row.map((part, partIndex) => {
            const isMarker = /^[١٢٣]$/.test(part);

            if (isMarker) {
              return (
                <View
                  key={`exact-preview-row-${rowIndex}-marker-${partIndex}`}
                  style={{
                    alignItems: 'center',
                    borderColor: color,
                    borderRadius: markerSize / 2,
                    borderWidth: markerBorderWidth,
                    height: markerSize,
                    justifyContent: 'center',
                    opacity: 0.9,
                    width: markerSize,
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      color,
                      fontFamily: DEFAULT_ARABIC_FONT_FAMILY,
                      fontSize: Math.max(9, markerSize - 9),
                      includeFontPadding: false,
                      lineHeight: markerSize - 3,
                      textAlign: 'center',
                    }}
                  >
                    {part}
                  </Text>
                </View>
              );
            }

            return (
              <Text
                key={`exact-preview-row-${rowIndex}-text-${partIndex}`}
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={{
                  color,
                  fontFamily,
                  fontSize: textSize,
                  includeFontPadding: false,
                  lineHeight: isV2 ? 18 : 16,
                  maxWidth: isV2 ? 360 : 320,
                  textAlign: 'center',
                  writingDirection: 'rtl',
                }}
              >
                {part}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
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
            paddingVertical: 10,
          }}
        >
          {isExactKingFahadPack(packId) ? (
            <ExactKingFahadPreview color={previewTextColor} fontFamily={fontStyle} packId={packId} />
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
