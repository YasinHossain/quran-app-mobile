import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type NativeSurahReaderTranslationItem = {
  resourceId?: number;
  resourceName?: string;
  text: string;
};

export type NativeSurahReaderWord = {
  id: number;
  position?: number;
  uthmani: string;
  translationText?: string;
  charTypeName?: string;
  codeV2?: string;
  pageNumber?: number;
};

export type NativeSurahReaderTajweedGlyphRun = {
  fontFamily: string;
  fontFileUri: string;
  glyphs: string[];
};

export type NativeSurahReaderVerse = {
  verseKey: string;
  verseNumber: number;
  verseApiId?: number;
  arabicText: string;
  words?: NativeSurahReaderWord[];
  tajweedGlyphRuns?: NativeSurahReaderTajweedGlyphRun[];
  translationItems: NativeSurahReaderTranslationItem[];
};

export type NativeSurahReaderSurahIntro = {
  chapterId: number;
  infoLabel: string;
  isMakkah: boolean;
  showBismillah: boolean;
  surahName: string;
};

export type NativeSurahReaderSettings = {
  arabicFontFace?: string;
  arabicFontSize?: number;
  displayMode?: 'plain' | 'wordByWord' | 'tajweed';
  showByWords?: boolean;
  tajweed?: boolean;
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
  surahIntro?: NativeSurahReaderSurahIntro;
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
