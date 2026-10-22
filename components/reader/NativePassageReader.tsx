import React from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';

import { ReaderLoadingState } from '@/components/reader/ReaderLoadingState';
import {
  NativeSurahReader,
  type NativeSurahReaderActionPressEvent,
  type NativeSurahReaderActiveWord,
  type NativeSurahReaderLoadErrorEvent,
  type NativeSurahReaderScrollEvent,
  type NativeSurahReaderState,
  type NativeSurahReaderSurahIntro,
  type NativeSurahReaderVisibleVerseChangeEvent,
  type NativeSurahReaderWordPressEvent,
} from '@/components/surah/native/NativeSurahReader';
import {
  buildNativeLightSurahReaderSettings,
  buildNativeLightSurahReaderTheme,
} from '@/components/surah/native/NativeSurahReader.theme';
import { getSurahHeaderPresentation } from '@/components/surah/surahHeaderPresentation';
import {
  normalizeWordStudyPressEvent,
  type WordStudyPressEvent,
} from '@/components/word-study/WordStudyPressEvent';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import {
  countPassageVerses,
  formatPassageSpan,
  getPassageSurahIds,
  passageContainsVerseKey,
  type ReaderPassage,
} from '@/lib/reader/readerPassage';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

// Native SQLite reads normally finish within the navigation transition; only slow storage
// should show a skeleton. Matches the Surah reader.
const LOADING_PLACEHOLDER_DELAY_MS = 250;
const LAST_READ_DELAY_MS = 700;

export type PassageVerseActionParams = {
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
  translationTexts: string[];
  translationItems?: Array<{ resourceId?: number; resourceName?: string; text: string }>;
};

type NativePassageReaderProps = {
  passage: ReaderPassage;
  /** Verse to open at; ignored when outside the passage. Read once per mount. */
  targetVerseKey?: string | null;
  /** Layout (dp) insets: the overlay header and the audio player bar. */
  topInset: number;
  bottomInset: number;
  activeWord?: NativeSurahReaderActiveWord | null;
  onOpenVerseActions: (params: PassageVerseActionParams) => void;
  onOpenWordStudy: (event: WordStudyPressEvent) => void;
  onScrollOffset: (offsetY: number) => void;
  onVisibleVerseChange?: (verseKey: string) => void;
  onInitialPositioned?: () => void;
};

type ReaderStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string };

/**
 * Android translation reader for a Juz or Page: the same Kotlin reader as a Surah, loading a verse
 * range from the offline database with a passage banner and an intro wherever a Surah begins.
 */
export function NativePassageReader({
  passage,
  targetVerseKey,
  topInset,
  bottomInset,
  activeWord,
  onOpenVerseActions,
  onOpenWordStudy,
  onScrollOffset,
  onVisibleVerseChange,
  onInitialPositioned,
}: NativePassageReaderProps): React.JSX.Element {
  const { settings, effectiveShowByWords } = useSettings();
  const { t } = useUiTranslation();
  const { chapters } = useChapters();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const audio = useAudioPlayer();
  const { setLastRead } = useBookmarks();

  const translationIds = React.useMemo(() => {
    // An explicit empty array means "no translations selected" (Arabic-only mode).
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);
  const showTranslationAttribution = translationIds.length > 1;
  const { translationsById } = useTranslationResources({
    enabled: showTranslationAttribution,
    language: settings.contentLanguage,
  });

  const [initialTargetVerseKey] = React.useState(() =>
    targetVerseKey && passageContainsVerseKey(passage, targetVerseKey) ? targetVerseKey : undefined
  );
  const [loadGeneration, retry] = React.useReducer((value: number) => value + 1, 0);
  const [status, setStatus] = React.useState<ReaderStatus>({ state: 'loading' });
  const [showLoadingPlaceholder, setShowLoadingPlaceholder] = React.useState(false);

  // Keep the Kotlin token layout mounted before audio opens, as the Surah reader does.
  const audioWordLayoutEnabled = Boolean(!effectiveShowByWords && !settings.tajweed);
  const readerSettings = React.useMemo(
    () =>
      buildNativeLightSurahReaderSettings({
        arabicFontFace: settings.arabicFontFace,
        arabicFontSize: settings.arabicFontSize,
        audioWordSyncEnabled: audioWordLayoutEnabled,
        contentLanguage: settings.contentLanguage,
        showByWords: effectiveShowByWords,
        tajweed: Boolean(settings.tajweed),
        showTranslationAttribution,
        translationIds,
        translationNames: translationIds.map((id) => ({
          id,
          name: translationsById.get(id)?.name ?? `Translation ${id}`,
        })),
        translationFontSize: settings.translationFontSize,
        wordLang: settings.wordLang,
      }),
    [
      audioWordLayoutEnabled,
      effectiveShowByWords,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.contentLanguage,
      settings.tajweed,
      settings.translationFontSize,
      settings.wordLang,
      showTranslationAttribution,
      translationIds,
      translationsById,
    ]
  );
  const readerTheme = React.useMemo(() => buildNativeLightSurahReaderTheme(palette), [palette]);

  const surahIntros = React.useMemo<NativeSurahReaderSurahIntro[]>(
    () =>
      getPassageSurahIds(passage).flatMap((surahId) => {
        const chapter = chapters.find((item) => item.id === surahId);
        if (!chapter) return [];
        const presentation = getSurahHeaderPresentation(chapter, t);
        return [
          {
            chapterId: chapter.id,
            infoLabel: presentation.infoLabel,
            isMakkah: presentation.isMakkah,
            showBismillah: presentation.showBismillah,
            surahName: presentation.surahName,
          },
        ];
      }),
    [chapters, passage, t]
  );
  const scopeBanner = React.useMemo(() => {
    const surahName = (surahId: number) =>
      surahIntros.find((intro) => intro.chapterId === surahId)?.surahName ?? `Surah ${surahId}`;
    return {
      title:
        passage.kind === 'juz'
          ? t('juz_number', { number: passage.number })
          : t('page_number_label', { number: passage.number }),
      subtitle: formatPassageSpan(passage, surahName),
    };
  }, [passage, surahIntros, t]);
  const expectedVerseCount = React.useMemo(
    () => countPassageVerses(passage, chapters),
    [chapters, passage]
  );

  const readerState = React.useMemo<NativeSurahReaderState>(
    () => ({
      surahId: passage.startSurah,
      targetVerse: 1,
      verseRange: {
        startSurah: passage.startSurah,
        startAyah: passage.startAyah,
        endSurah: passage.endSurah,
        endAyah: passage.endAyah,
      },
      targetVerseKey: initialTargetVerseKey,
      expectedVerseCount,
      surahIntros,
      scopeBanner,
      settings: readerSettings,
      activeVerseKey: audio.activeVerseKey,
      // Matches the Surah reader's inset conventions so both screens line up identically.
      topInsetPx: PixelRatio.getPixelSizeForLayoutSize(topInset + 16),
      bottomInsetPx: 24 + bottomInset,
      theme: readerTheme,
    }),
    [
      audio.activeVerseKey,
      bottomInset,
      expectedVerseCount,
      initialTargetVerseKey,
      passage,
      readerSettings,
      readerTheme,
      scopeBanner,
      surahIntros,
      topInset,
    ]
  );

  const dataKey = [
    passage.kind,
    passage.number,
    translationIds.join(','),
    settings.wordLang ?? 'en',
    effectiveShowByWords ? 'words' : 'plain',
    loadGeneration,
  ].join('|');
  React.useEffect(() => {
    setStatus({ state: 'loading' });
  }, [dataKey]);
  React.useEffect(() => {
    if (status.state !== 'loading') {
      setShowLoadingPlaceholder(false);
      return;
    }
    const timeout = setTimeout(() => setShowLoadingPlaceholder(true), LOADING_PLACEHOLDER_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [dataKey, status.state]);

  // Screen callbacks change identity on most renders; the memoized native view should not.
  const callbacksRef = React.useRef({
    onOpenVerseActions,
    onOpenWordStudy,
    onScrollOffset,
    onVisibleVerseChange,
    onInitialPositioned,
    setLastRead,
  });
  callbacksRef.current = {
    onOpenVerseActions,
    onOpenWordStudy,
    onScrollOffset,
    onVisibleVerseChange,
    onInitialPositioned,
    setLastRead,
  };

  const lastReadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (lastReadTimeoutRef.current) clearTimeout(lastReadTimeoutRef.current);
    },
    []
  );

  const handleReady = React.useCallback(() => setStatus({ state: 'ready' }), []);
  const handleLoadError = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderLoadErrorEvent>) =>
      setStatus({ state: 'error', message: event.nativeEvent.message }),
    []
  );
  const handleInitialPositioned = React.useCallback(() => {
    callbacksRef.current.onInitialPositioned?.();
  }, []);
  const handleVisibleVerseChange = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderVisibleVerseChangeEvent>) => {
      const { verseKey, verseNumber, verseApiId } = event.nativeEvent;
      callbacksRef.current.onVisibleVerseChange?.(verseKey);
      const surahId = Number(verseKey.split(':')[0]);
      if (!Number.isInteger(surahId) || surahId <= 0 || verseNumber <= 0) return;
      if (lastReadTimeoutRef.current) clearTimeout(lastReadTimeoutRef.current);
      lastReadTimeoutRef.current = setTimeout(() => {
        lastReadTimeoutRef.current = null;
        callbacksRef.current.setLastRead(String(surahId), verseNumber, verseKey, verseApiId);
      }, LAST_READ_DELAY_MS);
    },
    []
  );
  const handleVerseActionPress = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderActionPressEvent>) => {
      const { verseKey, verseApiId, arabicText, translationTexts, translationItems } =
        event.nativeEvent;
      callbacksRef.current.onOpenVerseActions({
        verseKey,
        verseApiId,
        arabicText: arabicText ?? '',
        translationTexts: translationTexts ?? [],
        translationItems,
      });
    },
    []
  );
  const handleWordPress = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderWordPressEvent>) => {
      const normalized = normalizeWordStudyPressEvent(event.nativeEvent);
      if (normalized) callbacksRef.current.onOpenWordStudy(normalized);
    },
    []
  );
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeSurahReaderScrollEvent>) => {
      callbacksRef.current.onScrollOffset(event.nativeEvent.contentOffsetY / PixelRatio.get());
    },
    []
  );

  return (
    <View style={styles.layer}>
      <NativeSurahReader
        key={loadGeneration}
        style={styles.layer}
        readerState={readerState}
        activeVerseKey={audio.activeVerseKey}
        activeWord={activeWord}
        wordPressEnabled
        onReady={handleReady}
        onLoadError={handleLoadError}
        onInitialPositioned={handleInitialPositioned}
        onVisibleVerseChange={handleVisibleVerseChange}
        onVerseActionPress={handleVerseActionPress}
        onWordPress={handleWordPress}
        onScroll={handleScroll}
      />
      {status.state === 'loading' && showLoadingPlaceholder ? (
        <View
          style={[styles.layer, { backgroundColor: palette.background, paddingTop: topInset }]}
        >
          <ReaderLoadingState />
        </View>
      ) : status.state === 'error' ? (
        <View
          className="px-4"
          style={[styles.layer, { backgroundColor: palette.background, paddingTop: topInset + 16 }]}
        >
          <View className="mt-2 gap-3">
            <Text className="text-sm text-error dark:text-error-dark">{status.message}</Text>
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              accessibilityLabel="Retry loading verses"
              className="min-h-11 self-start justify-center rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
            >
              <Text className="text-sm font-semibold text-accent dark:text-accent-dark">Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
  },
});
