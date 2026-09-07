import React from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { ResourceDownloadAction } from '@/components/reader/settings/resource-panel/ResourceDownloadAction';
import type {
  DownloadProgress,
  DownloadStatus,
} from '@/src/core/domain/entities/DownloadIndexItem';
import { findMushafOption } from '@/data/mushaf/options';

type ActionTone = 'default' | 'accent' | 'danger';

type MushafPackOptionAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean | undefined;
  tone?: ActionTone | undefined;
};

// Bundled authentic 3-line previews for all mushaf options.
// Keeps the panel independent of runtime WebViews, network requests, and dynamic font loading.
const MUSHAF_PREVIEWS = {
  'qcf-madani-v1': require('@/assets/images/mushaf-previews/qcf-madani-v1.png'),
  'qcf-madani-v2': require('@/assets/images/mushaf-previews/qcf-madani-v2.png'),
  'qpc-uthmani-hafs': require('@/assets/images/mushaf-previews/qpc-uthmani-hafs.png'),
  'unicode-indopak-15': require('@/assets/images/mushaf-previews/unicode-indopak-15.png'),
  'unicode-indopak-16': require('@/assets/images/mushaf-previews/unicode-indopak-16.png'),
  'qcf-tajweed-v4-light': require('@/assets/images/mushaf-previews/qcf-tajweed-v4-light.png'),
  'qcf-tajweed-v4-dark': require('@/assets/images/mushaf-previews/qcf-tajweed-v4-dark.png'),
} as const;

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
  const trailingAction = secondaryAction ?? primaryAction;
  const hasTrailingAction = Boolean(trailingAction);
  const option = findMushafOption(packId);
  const isIndopak = option?.script === 'indopak';
  const isTajweed = packId === 'qcf-tajweed-v4';
  const scriptLabel = isIndopak
    ? 'IndoPak'
    : option?.script === 'tajweed'
      ? 'Uthmani · Tajweed colors'
      : 'Uthmani';

  const handleCardPress = () => {
    if (isSelectable) {
      primaryAction.onPress();
    }
  };

  const previewImageSource = isTajweed
    ? (isDark ? MUSHAF_PREVIEWS['qcf-tajweed-v4-dark'] : MUSHAF_PREVIEWS['qcf-tajweed-v4-light'])
    : (packId && packId in MUSHAF_PREVIEWS
        ? MUSHAF_PREVIEWS[packId as keyof typeof MUSHAF_PREVIEWS]
        : MUSHAF_PREVIEWS['qpc-uthmani-hafs']);

  const previewTintColor = isDark ? '#FFFFFF' : '#374151';
  const bgColor = isSelected ? palette.accent : palette.surface;
  const borderColor = isSelected ? palette.accent : palette.border;

  return (
    <Pressable
      onPress={isSelectable ? handleCardPress : undefined}
      disabled={!isSelectable}
      accessible={false}
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
            paddingTop: 12,
            paddingRight: 8,
            paddingBottom: 8,
            paddingLeft: 8,
          },
        ]}
      >
        <View className="flex-row items-center justify-between gap-3 mb-2" style={{ paddingHorizontal: 4 }}>
          <Text
            accessibilityRole={isSelectable ? 'button' : 'text'}
            accessibilityLabel={`${title}${option ? `, ${scriptLabel}, ${option.lines} lines` : ''}`}
            accessibilityState={{ selected: Boolean(isSelected) }}
            onPress={isSelectable ? handleCardPress : undefined}
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
              accessibilityState={{ disabled: Boolean(trailingAction?.disabled) }}
              hitSlop={8}
              style={({ pressed }) => {
                const isActiveProgress =
                  downloadStatus === 'queued' ||
                  downloadStatus === 'downloading' ||
                  downloadStatus === 'deleting';
                return {
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
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

        {/* Inset preview box: clean background matching page background, borderless */}
        <View
          className="rounded-md justify-center items-center"
          style={{
            backgroundColor: palette.background,
            overflow: 'hidden',
            paddingHorizontal: 8,
            paddingVertical: 4,
            minHeight: 88,
          }}
        >
          <Image
            source={previewImageSource}
            resizeMode="contain"
            fadeDuration={0}
            accessible={false}
            style={[
              { width: '100%', height: 80 },
              isTajweed ? undefined : { tintColor: previewTintColor },
            ]}
          />
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
