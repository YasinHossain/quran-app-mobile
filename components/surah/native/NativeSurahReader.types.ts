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
  contentLanguage?: string;
  displayMode?: 'plain' | 'wordByWord' | 'tajweed';
  showByWords?: boolean;
  tajweed?: boolean;
  translationIds?: number[];
  translationFontSize?: number;
  showTranslationAttribution?: boolean;
  wordLang?: string;
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

export type NativeSurahReaderActiveWord = {
  verseKey: string;
  wordPosition?: number;
  wordId?: number;
};

export type NativeSurahReaderVisibleVerseChangeEvent = {
  verseNumber: number;
  verseKey: string;
  verseApiId?: number;
};

export type NativeSurahReaderInitialPositionedEvent = {
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

export type NativeSurahReaderWordPressEvent = {
  verseNumber: number;
  verseKey: string;
  verseApiId?: number;
  wordId?: number;
  wordPosition?: number;
  surfaceText?: string;
  source?: 'tajweed' | 'translation';
};

export type NativeSurahReaderProps = ViewProps & {
  readerState?: NativeSurahReaderState;
  activeVerseKey?: string | null;
  activeWord?: NativeSurahReaderActiveWord | null;
  wordPressEnabled?: boolean;
  onReady?: () => void;
  onInitialPositioned?: (
    event: NativeSyntheticEvent<NativeSurahReaderInitialPositionedEvent>
  ) => void;
  onVisibleVerseChange?: (
    event: NativeSyntheticEvent<NativeSurahReaderVisibleVerseChangeEvent>
  ) => void;
  onVerseActionPress?: (event: NativeSyntheticEvent<NativeSurahReaderActionPressEvent>) => void;
  onWordPress?: (event: NativeSyntheticEvent<NativeSurahReaderWordPressEvent>) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeSurahReaderScrollEvent>) => void;
};

export type NativeSurahReaderHandle = {
  scrollToVerse: (verseNumber: number, animated?: boolean) => void;
};

export type NativeSurahReaderState = {
  surahId: number;
  targetVerse: number;
  surahIntro?: NativeSurahReaderSurahIntro;
  verses: NativeSurahReaderVerse[];
  settings: NativeSurahReaderSettings;
  activeVerseKey?: string | null;
  activeWord?: NativeSurahReaderActiveWord | null;
  topInsetPx: number;
  bottomInsetPx: number;
  theme: NativeSurahReaderTheme;
};
