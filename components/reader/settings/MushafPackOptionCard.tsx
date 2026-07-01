import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { loadFontFamilyAsync } from '@/src/core/infrastructure/fonts/arabicFonts';

type ActionTone = 'default' | 'accent' | 'danger';

type MushafPackOptionAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean | undefined;
  tone?: ActionTone | undefined;
};

const getFontForPack = (packId: string): string => {
  if (packId.includes('indopak')) {
    return 'IndoPak';
  }
  if (packId.includes('madani')) {
    return 'KFGQ V2';
  }
  return 'UthmanicHafs1Ver18';
};

const getPreviewTextForPack = (packId: string): string => {
  if (packId.includes('indopak')) {
    return [
      'بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ',
      'اَلْحَمْدُ لِلّٰهِ رَبِّ الْعٰلَمِيْنَ',
      'الرَّحْمٰنِ الرَّحِيْمِ مٰلِكِ يَوْمِ الدِّيْنِ',
    ].join('\n');
  }
  return [
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
    'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ مَٰلِكِ يَوْمِ ٱلدِّينِ',
  ].join('\n');
};

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
  progressLabel,
  errorMessage,
  isSelected,
  primaryAction,
  secondaryAction,
}: {
  packId?: string;
  title: string;
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

  const isSelectable = primaryAction && !primaryAction.disabled && !isSelected;

  React.useEffect(() => {
    const font = getFontForPack(packId || '');
    if (font === 'UthmanicHafs1Ver18') return;
    void loadFontFamilyAsync(font as any).catch(() => {});
  }, [packId]);

  const handleCardPress = () => {
    if (isSelectable) {
      primaryAction.onPress();
    }
  };

  const fontStyle = getFontForPack(packId || '');
  const previewText = getPreviewTextForPack(packId || '');

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
          
          {secondaryAction ? (
            <Pressable
              onPress={secondaryAction.onPress}
              disabled={secondaryAction.disabled}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Trash2
                size={18}
                color={isSelected ? '#FFFFFF' : '#EF4444'}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Inset preview box: off-white/dark bg matching page background, borderless */}
        <View
          className="rounded-md h-20 justify-center"
          style={{
            backgroundColor: innerBgColor,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            numberOfLines={3}
            style={{
              fontFamily: fontStyle,
              fontSize: packId?.includes('indopak') ? 15 : 16,
              lineHeight: packId?.includes('indopak') ? 23 : 24,
              color: resolvedTheme === 'dark' ? '#FFFFFF' : '#374151',
              textAlign: 'left',
              writingDirection: 'ltr',
            }}
          >
            {previewText}
          </Text>
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
