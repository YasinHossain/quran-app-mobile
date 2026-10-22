import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import type { ReaderTranslationRecovery } from '@/lib/surah/readerTranslationRecovery';

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

/** Inclusive Mushaf-order range for Juz and Page readers. */
export type NativeSurahReaderVerseRange = {
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
};

/** Quiet label above a Juz or Page passage, e.g. "Juz 5" / "An-Nisa 24 – 147". */
export type NativeSurahReaderScopeBanner = {
  title: string;
  subtitle?: string;
};

export type NativeSurahReaderSettings = {
  arabicFontFace?: string;
  arabicFontSize?: number;
  contentLanguage?: string;
  displayMode?: 'plain' | 'wordByWord' | 'tajweed';
  showByWords?: boolean;
  tajweed?: boolean;
  translationIds?: number[];
  translationNames?: Array<{ id: number; name: string }>;
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
  /** First verse whose top edge is below the header; `verseKey` may sit mostly under it. */
  topFullyVisibleVerseKey?: string;
};

export type NativeSurahReaderInitialPositionedEvent = {
  verseNumber: number;
  verseKey: string;
  verseApiId?: number;
};

export type NativeSurahReaderScrollEvent = {
  contentOffsetY: number;
};

export type NativeSurahReaderLoadErrorEvent = {
  code: string;
  message: string;
};

export type NativeSurahReaderActionPressEvent = {
  verseNumber: number;
  verseKey: string;
  verseApiId?: number;
  arabicText?: string;
  translationTexts?: string[];
  translationItems?: NativeSurahReaderTranslationItem[];
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
  translationRecovery?: ReaderTranslationRecovery;
  onTranslationAvailability?: (event: NativeSyntheticEvent<{
    surahId: number;
    selectionKey: string;
    missingTranslationIds: number[];
  }>) => void;
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
  onLoadError?: (event: NativeSyntheticEvent<NativeSurahReaderLoadErrorEvent>) => void;
};

export type NativeSurahReaderHandle = {
  /** A verse number in a Surah reader, or a verse key ("2:255") in any reader. */
  scrollToVerse: (verse: number | string, animated?: boolean) => void;
};

export type NativeSurahReaderState = {
  surahId: number;
  targetVerse: number;
  expectedVerseCount?: number;
  surahIntro?: NativeSurahReaderSurahIntro;
  /** Juz/Page readers load this range instead of the whole `surahId`. */
  verseRange?: NativeSurahReaderVerseRange;
  /** Takes precedence over `targetVerse`; required to address verses in a multi-Surah range. */
  targetVerseKey?: string;
  /** Intro for each Surah in a range; shown only where that Surah's first verse appears. */
  surahIntros?: NativeSurahReaderSurahIntro[];
  scopeBanner?: NativeSurahReaderScopeBanner;
  // Immutable snapshot: replace the array when any verse, translation, word or glyph changes.
  // NativeSurahReader attaches its content revision at the native boundary.
  // Omitted on Android's offline-native path. Retained for legacy/test hosts.
  verses?: NativeSurahReaderVerse[];
  settings: NativeSurahReaderSettings;
  activeVerseKey?: string | null;
  activeWord?: NativeSurahReaderActiveWord | null;
  topInsetPx: number;
  bottomInsetPx: number;
  theme: NativeSurahReaderTheme;
};
