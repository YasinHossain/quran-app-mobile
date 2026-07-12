import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type NativeSurahReaderTranslationItem = {
  resourceId?: number;
  resourceName?: string;
  text: string;
};

export type NativeSurahReaderVerse = {
  verseKey: string;
  verseNumber: number;
  verseApiId?: number;
  arabicText: string;
  translationItems: NativeSurahReaderTranslationItem[];
};

export type NativeSurahReaderSettings = {
  arabicFontSize?: number;
  translationFontSize?: number;
  showTranslationAttribution?: boolean;
  [key: string]: unknown;
};

export type NativeSurahReaderTheme = {
  activeBackgroundColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  mutedColor?: string;
  textColor?: string;
  tintColor?: string;
  [key: string]: unknown;
};

export type NativeSurahReaderVisibleVerseChangeEvent = {
  verseNumber: number;
  verseKey: string;
  verseApiId?: number;
};

export type NativeSurahReaderScrollEvent = {
  contentOffsetY: number;
};

export type NativeSurahReaderActionPressEvent = {
  verseNumber: number;
  verseKey: string;
  verseApiId?: number;
  arabicText?: string;
  translationTexts?: string[];
};

export type NativeSurahReaderProps = ViewProps & {
  surahId?: number;
  targetVerse?: number;
  verses?: NativeSurahReaderVerse[];
  settings?: NativeSurahReaderSettings;
  activeVerseKey?: string | null;
  topInsetPx?: number;
  bottomInsetPx?: number;
  theme?: NativeSurahReaderTheme;
  onReady?: () => void;
  onVisibleVerseChange?: (
    event: NativeSyntheticEvent<NativeSurahReaderVisibleVerseChangeEvent>
  ) => void;
  onVerseActionPress?: (event: NativeSyntheticEvent<NativeSurahReaderActionPressEvent>) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeSurahReaderScrollEvent>) => void;
};

export type NativeSurahReaderHandle = {
  scrollToVerse: (verseNumber: number, animated?: boolean) => void;
};
