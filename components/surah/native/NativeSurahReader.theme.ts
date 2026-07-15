import type Colors from '@/constants/Colors';

import type {
  NativeSurahReaderSettings,
  NativeSurahReaderTheme,
} from './NativeSurahReader.types';

type ReaderPalette = (typeof Colors)['light'];

export function buildNativeLightSurahReaderSettings(params: {
  arabicFontFace?: string;
  arabicFontSize: number;
  audioWordSyncEnabled?: boolean;
  contentLanguage?: string;
  showByWords: boolean;
  tajweed: boolean;
  showTranslationAttribution: boolean;
  translationIds: number[];
  translationFontSize: number;
  wordLang?: string;
}): NativeSurahReaderSettings {
  const displayMode: NativeSurahReaderSettings['displayMode'] =
    params.showByWords || params.audioWordSyncEnabled
      ? 'wordByWord'
      : params.tajweed
        ? 'tajweed'
        : 'plain';

  return {
    arabicFontFace: params.arabicFontFace,
    arabicFontSize: params.arabicFontSize,
    audioWordSyncEnabled: Boolean(params.audioWordSyncEnabled),
    contentLanguage: params.contentLanguage?.trim().toLowerCase(),
    displayMode,
    showByWords: params.showByWords,
    tajweed: params.tajweed,
    showTranslationAttribution: params.showTranslationAttribution,
    translationIds: params.translationIds,
    translationFontSize: params.translationFontSize,
    wordLang: params.wordLang?.trim().toLowerCase(),
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
