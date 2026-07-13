import type Colors from '@/constants/Colors';

import type {
  NativeSurahReaderSettings,
  NativeSurahReaderTheme,
} from './NativeSurahReader.types';

type ReaderPalette = (typeof Colors)['light'];

export function buildNativeLightSurahReaderSettings(params: {
  arabicFontFace?: string;
  arabicFontSize: number;
  showByWords: boolean;
  tajweed: boolean;
  showTranslationAttribution: boolean;
  translationFontSize: number;
}): NativeSurahReaderSettings {
  const displayMode: NativeSurahReaderSettings['displayMode'] = params.showByWords
    ? 'wordByWord'
    : params.tajweed
      ? 'tajweed'
      : 'plain';

  return {
    arabicFontFace: params.arabicFontFace,
    arabicFontSize: params.arabicFontSize,
    displayMode,
    showByWords: params.showByWords,
    tajweed: params.tajweed,
    showTranslationAttribution: params.showTranslationAttribution,
    translationFontSize: params.translationFontSize,
  };
}

export function buildNativeLightSurahReaderTheme(palette: ReaderPalette): NativeSurahReaderTheme {
  return {
    activeBackgroundColor: `${palette.tint}0D`,
    backgroundColor: palette.background,
    borderColor: `${palette.border}66`,
    mutedColor: palette.muted,
    tintColor: palette.tint,
    textColor: palette.text,
  };
}
