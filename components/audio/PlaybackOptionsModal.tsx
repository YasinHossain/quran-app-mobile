import { Mic, Minus, Plus, Repeat, SlidersHorizontal, X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SurahVerseSelectorRow } from '@/components/search/SurahVerseSelectorRow';
import Colors from '@/constants/Colors';
import { DEFAULT_RECITER, type Reciter, useReciters } from '@/hooks/audio/useReciters';
import { useChapters } from '@/hooks/useChapters';
import { useAudioPlayer, type RepeatOptions } from '@/providers/AudioPlayerContext';
import { useAppTheme } from '@/providers/ThemeContext';
import type { Chapter } from '@/types';

type PlaybackOptionsTab = 'reciter' | 'repeat';

function parseChapterIdFromVerseKey(verseKey: string | null): number | null {
  if (!verseKey) return null;
  const [surahRaw] = verseKey.split(':');
  const parsed = Number.parseInt(surahRaw ?? '', 10);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function parseVerseNumberFromVerseKey(verseKey: string | null): number | null {
  if (!verseKey) return null;
  const parts = verseKey.split(':');
  if (parts.length !== 2) return null;
  const verseRaw = parts[1];
  const parsed = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function buildInitialRepeatOptions({
  repeatOptions,
  activeVerseKey,
}: {
  repeatOptions: RepeatOptions;
  activeVerseKey: string | null;
}): RepeatOptions {
  const activeSurahId = parseChapterIdFromVerseKey(activeVerseKey) ?? undefined;
  const activeVerseNumber = parseVerseNumberFromVerseKey(activeVerseKey) ?? undefined;

  const effectiveMode: RepeatOptions['mode'] =
    repeatOptions.mode === 'off' ? 'single' : repeatOptions.mode;

  const repeatEach = repeatOptions.repeatEach ?? 1;
  const delay = repeatOptions.delay ?? 0;
  const playCount = repeatOptions.playCount ?? 1;

  if (effectiveMode === 'single') {
    const surahId = repeatOptions.surahId ?? activeSurahId;
    const verseNumber = repeatOptions.verseNumber ?? activeVerseNumber ?? repeatOptions.start ?? 1;
    return {
      ...repeatOptions,
      mode: 'single',
      surahId,
      verseNumber,
      start: verseNumber,
      end: verseNumber,
      playCount: 1,
      repeatEach,
      delay,
    };
  }

  if (effectiveMode === 'surah') {
    const surahId = repeatOptions.surahId ?? activeSurahId;
    return {
      ...repeatOptions,
      mode: 'surah',
      surahId,
      verseNumber: undefined,
      start: 1,
      end: 1,
      playCount,
      repeatEach,
      delay,
    };
  }

  if (effectiveMode === 'range') {
    const startSurahId = repeatOptions.startSurahId ?? repeatOptions.surahId ?? activeSurahId;
    const endSurahId = repeatOptions.endSurahId ?? startSurahId;
    const startVerseNumber = repeatOptions.startVerseNumber ?? repeatOptions.start ?? activeVerseNumber ?? 1;
    const endVerseNumber = repeatOptions.endVerseNumber ?? repeatOptions.end ?? startVerseNumber;

    return {
      ...repeatOptions,
      mode: 'range',
      surahId: startSurahId,
      startSurahId,
      endSurahId,
      startVerseNumber,
      endVerseNumber,
      start: startVerseNumber,
      end: endVerseNumber,
      playCount,
      repeatEach,
      delay,
    };
  }

  return {
    ...repeatOptions,
    mode: effectiveMode,
    playCount,
    repeatEach,
    delay,
  };
}

export function PlaybackOptionsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const audio = useAudioPlayer();
  const { reciters, isLoading: recitersLoading, error: recitersError, refresh } = useReciters();
  const { height: windowHeight } = useWindowDimensions();

  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const [activeTab, setActiveTab] = React.useState<PlaybackOptionsTab>('reciter');
  const [localReciter, setLocalReciter] = React.useState<Reciter>(audio.reciter);
  const [localRepeat, setLocalRepeat] = React.useState<RepeatOptions>(audio.repeatOptions);
  const [rangeWarning, setRangeWarning] = React.useState<string | null>(null);

  const prevIsOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setActiveTab('reciter');
      setLocalReciter(audio.reciter);
      setLocalRepeat(
        buildInitialRepeatOptions({
          repeatOptions: audio.repeatOptions,
          activeVerseKey: audio.activeVerseKey,
        })
      );
      setRangeWarning(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [audio.activeVerseKey, audio.reciter, audio.repeatOptions, isOpen]);

  const reciterOptions = React.useMemo(() => {
    const byId = new Map<number, Reciter>();
    byId.set(DEFAULT_RECITER.id, DEFAULT_RECITER);
    if (audio.reciter?.id) byId.set(audio.reciter.id, audio.reciter);
    for (const reciter of reciters) {
      if (reciter.id) byId.set(reciter.id, reciter);
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [audio.reciter, reciters]);

  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const dialogScale = React.useRef(new Animated.Value(0.96)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.85));
  const minDialogHeight = Math.min(maxDialogHeight, Math.max(420, Math.round(windowHeight * 0.7)));

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    overlayOpacity.stopAnimation();
    dialogScale.stopAnimation();

    if (isOpen) {
      dismissEnabledRef.current = false;
      setVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(dialogScale, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();

      const enableDismissTimeout = setTimeout(() => {
        if (animationTokenRef.current !== token) return;
        dismissEnabledRef.current = true;
      }, 240);

      return () => clearTimeout(enableDismissTimeout);
    }

    dismissEnabledRef.current = false;
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(dialogScale, { toValue: 0.96, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [dialogScale, isOpen, overlayOpacity]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [onClose]);

  const commit = React.useCallback(() => {
    const fallbackSurahId = parseChapterIdFromVerseKey(audio.activeVerseKey);
    const fallbackVerseNumber = parseVerseNumberFromVerseKey(audio.activeVerseKey);

    const repeatEach = Math.max(1, Math.floor(localRepeat.repeatEach ?? 1));
    const playCount = Math.max(1, Math.floor(localRepeat.playCount ?? 1));
    const delay = Math.max(0, Math.floor(localRepeat.delay ?? 0));

    const mode: RepeatOptions['mode'] = localRepeat.mode === 'off' ? 'single' : localRepeat.mode;

    if (mode === 'single') {
      const surahId = localRepeat.surahId ?? fallbackSurahId;
      const verseNumber = localRepeat.verseNumber ?? fallbackVerseNumber;
      if (!surahId || !verseNumber) {
        setActiveTab('repeat');
        setRangeWarning('Select a surah and verse to repeat.');
        return;
      }
      const normalizedVerse = Math.max(1, Math.floor(verseNumber));
      const nextRepeat: RepeatOptions = {
        ...localRepeat,
        mode: 'single',
        surahId,
        verseNumber: normalizedVerse,
        start: normalizedVerse,
        end: normalizedVerse,
        playCount: 1,
        repeatEach,
        delay,
      };

      audio.setReciter(localReciter);
      audio.setRepeatOptions(nextRepeat);
      audio.playVerse(`${surahId}:${normalizedVerse}`);
      setRangeWarning(null);
      onClose();
      return;
    }

    if (mode === 'surah') {
      const surahId = localRepeat.surahId ?? fallbackSurahId;
      if (!surahId) {
        setActiveTab('repeat');
        setRangeWarning('Select a surah to repeat.');
        return;
      }
      const nextRepeat: RepeatOptions = {
        ...localRepeat,
        mode: 'surah',
        surahId,
        verseNumber: undefined,
        start: 1,
        end: 1,
        playCount,
        repeatEach,
        delay,
      };

      audio.setReciter(localReciter);
      audio.setRepeatOptions(nextRepeat);
      audio.playVerse(`${surahId}:1`);
      setRangeWarning(null);
      onClose();
      return;
    }

    if (mode === 'range') {
      const startSurahId = localRepeat.startSurahId ?? localRepeat.surahId ?? fallbackSurahId;
      const endSurahId = localRepeat.endSurahId ?? startSurahId;
      const startVerseNumber = localRepeat.startVerseNumber ?? localRepeat.start ?? fallbackVerseNumber;
      const endVerseNumber = localRepeat.endVerseNumber ?? localRepeat.end ?? startVerseNumber;

      if (
        !startSurahId ||
        !endSurahId ||
        !startVerseNumber ||
        !endVerseNumber ||
        startSurahId > endSurahId ||
        (startSurahId === endSurahId && startVerseNumber > endVerseNumber)
      ) {
        setActiveTab('repeat');
        setRangeWarning('Select a start and end surah and verse to repeat.');
        return;
      }

      const normalizedStartVerse = Math.max(1, Math.floor(startVerseNumber));
      const normalizedEndVerse = Math.max(1, Math.floor(endVerseNumber));

      const nextRepeat: RepeatOptions = {
        ...localRepeat,
        mode: 'range',
        surahId: startSurahId,
        startSurahId,
        endSurahId,
        startVerseNumber: normalizedStartVerse,
        endVerseNumber: normalizedEndVerse,
        start: normalizedStartVerse,
        end: normalizedEndVerse,
        playCount,
        repeatEach,
        delay,
      };

      audio.setReciter(localReciter);
      audio.setRepeatOptions(nextRepeat);
      audio.playVerse(`${startSurahId}:${normalizedStartVerse}`);
      setRangeWarning(null);
      onClose();
      return;
    }

    audio.setReciter(localReciter);
    audio.setRepeatOptions(localRepeat);
    setRangeWarning(null);
    onClose();
  }, [audio, localReciter, localRepeat, onClose]);

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrapper}
        >
          <Animated.View
            style={[
              styles.dialog,
              { maxHeight: maxDialogHeight, minHeight: minDialogHeight },
              { transform: [{ scale: dialogScale }] },
            ]}
            className="bg-surface dark:bg-surface-dark border border-border/30 dark:border-border-dark/20"
          >
            <SafeAreaView edges={['top', 'bottom']} style={styles.dialogSafeArea}>
              <View className={isDark ? 'dark' : ''} style={styles.inner}>
                <View className="px-4 pt-4 pb-3 border-b border-border/30 dark:border-border-dark/20">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-row items-center gap-3 flex-1 min-w-0">
                      <View className="h-10 w-10 rounded-xl items-center justify-center bg-accent/10">
                        <SlidersHorizontal color={palette.tint} size={18} strokeWidth={2.25} />
                      </View>
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-base font-semibold text-foreground dark:text-foreground-dark"
                      >
                        Playback options
                      </Text>
                    </View>

                    <Pressable
                      onPress={onClose}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                      className="p-2 rounded-full"
                    >
                      <X size={18} strokeWidth={2.25} color={palette.muted} />
                    </Pressable>
                  </View>

                  <View className="mt-4 flex-row justify-center gap-2">
                    <TabButton
                      label="Reciter"
                      isActive={activeTab === 'reciter'}
                      onPress={() => setActiveTab('reciter')}
                      icon={
                        <Mic
                          size={16}
                          strokeWidth={2.25}
                          color={activeTab === 'reciter' ? '#FFFFFF' : palette.muted}
                        />
                      }
                    />
                    <TabButton
                      label="Verse Repeat"
                      isActive={activeTab === 'repeat'}
                      onPress={() => setActiveTab('repeat')}
                      icon={
                        <Repeat
                          size={16}
                          strokeWidth={2.25}
                          color={activeTab === 'repeat' ? '#FFFFFF' : palette.muted}
                        />
                      }
                    />
                  </View>
                </View>

                <View style={styles.content}>
                  <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {activeTab === 'reciter' ? (
                      <View className="gap-4">
                      <View className="gap-2">
                        {(recitersLoading || recitersError) && (
                          <View className="flex-row items-center gap-2 px-1">
                            {recitersLoading ? (
                              <ActivityIndicator size="small" color={palette.muted} />
                            ) : null}
                            <Text className="text-xs text-muted dark:text-muted-dark">
                              {recitersLoading
                                ? 'Loading reciters…'
                                : 'Unable to load reciters.'}
                            </Text>
                            {recitersError ? (
                              <Pressable
                                onPress={refresh}
                                accessibilityRole="button"
                                accessibilityLabel="Retry"
                                className="ml-auto px-3 py-1.5 rounded-lg bg-interactive dark:bg-interactive-dark"
                                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                              >
                                <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                                  Retry
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        )}

                        <View className="gap-3 px-1">
                          {reciterOptions.map((reciter) => {
                            const isSelected = localReciter.id === reciter.id;
                            return (
                              <Pressable
                                key={reciter.id}
                                onPress={() => setLocalReciter(reciter)}
                                accessibilityRole="button"
                                accessibilityLabel={reciter.name}
                                className={[
                                  'w-full rounded-lg border px-3 py-2',
                                  isSelected
                                    ? 'border-accent bg-accent/10'
                                    : 'border-border/30 dark:border-border-dark/20',
                                ].join(' ')}
                                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                              >
                                <View className="flex-row items-center justify-between gap-3">
                                  <View className="flex-1 min-w-0">
                                    <Text
                                      numberOfLines={1}
                                      className="text-sm font-medium text-foreground dark:text-foreground-dark"
                                    >
                                      {reciter.name}
                                    </Text>
                                    {reciter.locale ? (
                                      <Text
                                        numberOfLines={1}
                                        className="mt-1 text-xs text-muted dark:text-muted-dark"
                                      >
                                        {reciter.locale}
                                      </Text>
                                    ) : null}
                                  </View>

                                  <View
                                    className={[
                                      'h-5 w-5 rounded-full border-2 items-center justify-center',
                                      isSelected
                                        ? 'border-accent'
                                        : 'border-border/60 dark:border-border-dark/40',
                                    ].join(' ')}
                                  >
                                    {isSelected ? (
                                      <View className="h-2.5 w-2.5 rounded-full bg-accent" />
                                    ) : null}
                                  </View>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <RepeatOptionsPanel
                      localRepeat={localRepeat}
                      setLocalRepeat={setLocalRepeat}
                      rangeWarning={rangeWarning}
                      setRangeWarning={setRangeWarning}
                    />
                  )}
                  </ScrollView>
                </View>

                <View className="px-4 py-3 border-t border-border/30 dark:border-border-dark/20">
                  <View className="flex-row items-center justify-end">
                    <Pressable
                      onPress={commit}
                      accessibilityRole="button"
                      accessibilityLabel="Apply"
                      className="px-5 py-3 rounded-xl bg-accent"
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Text className="text-sm font-semibold text-on-accent">Apply</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function getUiRepeatMode(mode: RepeatOptions['mode']): 'single' | 'range' | 'surah' {
  if (mode === 'range' || mode === 'surah' || mode === 'single') return mode;
  return 'single';
}

function RepeatOptionsPanel({
  localRepeat,
  setLocalRepeat,
  rangeWarning,
  setRangeWarning,
}: {
  localRepeat: RepeatOptions;
  setLocalRepeat: React.Dispatch<React.SetStateAction<RepeatOptions>>;
  rangeWarning: string | null;
  setRangeWarning: React.Dispatch<React.SetStateAction<string | null>>;
}): React.JSX.Element {
  const mode = getUiRepeatMode(localRepeat.mode);
  const isSingle = mode === 'single';

  const { chapters, isLoading, errorMessage, refresh } = useChapters();
  const chapterLookup = React.useMemo(
    () =>
      chapters.reduce<Record<number, Chapter>>((acc, chapter) => {
        acc[chapter.id] = chapter;
        return acc;
      }, {}),
    [chapters]
  );

  const singleChapter =
    typeof localRepeat.surahId === 'number' ? chapterLookup[localRepeat.surahId] : undefined;

  const startSurahId = localRepeat.startSurahId ?? localRepeat.surahId;
  const endSurahId = localRepeat.endSurahId ?? startSurahId;
  const startVerseNumber = localRepeat.startVerseNumber ?? localRepeat.start;
  const endVerseNumber = localRepeat.endVerseNumber ?? localRepeat.end;

  const startChapter =
    typeof startSurahId === 'number' ? chapterLookup[startSurahId] : undefined;
  const endChapter = typeof endSurahId === 'number' ? chapterLookup[endSurahId] : undefined;

  React.useEffect(() => {
    if (mode !== 'single') return;
    if (!singleChapter?.verses_count || !localRepeat.verseNumber) return;
    if (localRepeat.verseNumber > singleChapter.verses_count) {
      setLocalRepeat((prev) => ({
        ...prev,
        verseNumber: singleChapter.verses_count,
        start: singleChapter.verses_count,
        end: singleChapter.verses_count,
      }));
    }
  }, [localRepeat.verseNumber, mode, setLocalRepeat, singleChapter?.verses_count]);

  React.useEffect(() => {
    if (mode !== 'range') return;
    if (!startChapter?.verses_count || !startVerseNumber) return;
    if (startVerseNumber > startChapter.verses_count) {
      setLocalRepeat((prev) => ({
        ...prev,
        startVerseNumber: startChapter.verses_count,
        start: startChapter.verses_count,
      }));
    }
  }, [mode, setLocalRepeat, startChapter?.verses_count, startVerseNumber]);

  React.useEffect(() => {
    if (mode !== 'range') return;
    if (!endChapter?.verses_count || !endVerseNumber) return;
    if (endVerseNumber > endChapter.verses_count) {
      setLocalRepeat((prev) => ({
        ...prev,
        endVerseNumber: endChapter.verses_count,
        end: endChapter.verses_count,
      }));
    }
  }, [endChapter?.verses_count, endVerseNumber, mode, setLocalRepeat]);

  React.useEffect(() => {
    if (mode !== 'range') return;
    if (!startChapter || localRepeat.startVerseNumber !== undefined) return;
    setLocalRepeat((prev) => ({ ...prev, startVerseNumber: 1, start: 1 }));
  }, [localRepeat.startVerseNumber, mode, setLocalRepeat, startChapter]);

  React.useEffect(() => {
    if (mode !== 'range') return;
    if (!endChapter || localRepeat.endVerseNumber !== undefined) return;
    setLocalRepeat((prev) => {
      const fallbackEnd = prev.startVerseNumber ?? prev.start ?? 1;
      return { ...prev, endVerseNumber: fallbackEnd, end: fallbackEnd };
    });
  }, [endChapter, localRepeat.endVerseNumber, mode, setLocalRepeat]);

  const handleModeChange = React.useCallback(
    (nextMode: RepeatOptions['mode']) => {
      if (nextMode === localRepeat.mode) return;
      setLocalRepeat((prev) => ({
        ...prev,
        mode: nextMode,
        ...(nextMode === 'single' ? { playCount: 1 } : {}),
      }));
      setRangeWarning(null);
    },
    [localRepeat.mode, setLocalRepeat, setRangeWarning]
  );

  const playCount = Math.max(1, Math.floor(localRepeat.playCount ?? 1));
  const repeatEach = Math.max(1, Math.floor(localRepeat.repeatEach ?? 1));
  const delay = Math.max(0, Math.floor(localRepeat.delay ?? 0));

  return (
    <View className="gap-4">
      <RepeatModeToggle value={mode} onChange={(next) => handleModeChange(next)} />

      <View className="rounded-2xl border border-border/30 dark:border-border-dark/20 p-4 gap-4">
        {rangeWarning ? (
          <Text className="text-sm text-accent dark:text-accent-dark">{rangeWarning}</Text>
        ) : null}

        {mode === 'single' ? (
          <SurahVerseSelectorRow
            surahLabel="Surah"
            verseLabel="Verse"
            chapters={chapters}
            selectedSurah={localRepeat.surahId}
            selectedVerse={localRepeat.verseNumber ?? localRepeat.start}
            isLoading={isLoading}
            onSelectSurah={(surahId) => {
              setLocalRepeat((prev) => ({
                ...prev,
                surahId,
                verseNumber: undefined,
                start: undefined,
                end: undefined,
              }));
              setRangeWarning(null);
            }}
            onSelectVerse={(verseNumber) => {
              setLocalRepeat((prev) => ({
                ...prev,
                verseNumber: verseNumber,
                start: verseNumber,
                end: verseNumber,
              }));
              setRangeWarning(null);
            }}
          />
        ) : mode === 'surah' ? (
          <SurahVerseSelectorRow
            surahLabel="Surah"
            chapters={chapters}
            selectedSurah={localRepeat.surahId}
            selectedVerse={undefined}
            isLoading={isLoading}
            hideVerse
            onSelectSurah={(surahId) => {
              setLocalRepeat((prev) => ({
                ...prev,
                surahId,
                verseNumber: undefined,
                start: undefined,
                end: undefined,
              }));
              setRangeWarning(null);
            }}
          />
        ) : (
          <View className="gap-5">
            <SurahVerseSelectorRow
              surahLabel="Start Surah"
              verseLabel="Verse"
              chapters={chapters}
              selectedSurah={startSurahId}
              selectedVerse={startVerseNumber}
              isLoading={isLoading}
              onSelectSurah={(surahId) => {
                setLocalRepeat((prev) => ({
                  ...prev,
                  startSurahId: surahId,
                  startVerseNumber: undefined,
                  start: undefined,
                  ...(prev.endSurahId ? {} : { endSurahId: surahId }),
                }));
                setRangeWarning(null);
              }}
              onSelectVerse={(verseNumber) => {
                setLocalRepeat((prev) => {
                  const startSurah = prev.startSurahId ?? prev.surahId;
                  const endSurah = prev.endSurahId ?? startSurah;
                  const shouldSyncEnd =
                    !prev.endVerseNumber && !prev.end && startSurah && endSurah === startSurah;
                  return {
                    ...prev,
                    startVerseNumber: verseNumber,
                    start: verseNumber,
                    ...(shouldSyncEnd ? { endVerseNumber: verseNumber, end: verseNumber } : {}),
                  };
                });
                setRangeWarning(null);
              }}
            />

            <SurahVerseSelectorRow
              surahLabel="End Surah"
              verseLabel="Verse"
              chapters={chapters}
              selectedSurah={endSurahId}
              selectedVerse={endVerseNumber}
              isLoading={isLoading}
              onSelectSurah={(surahId) => {
                setLocalRepeat((prev) => ({
                  ...prev,
                  endSurahId: surahId,
                  endVerseNumber: undefined,
                  end: undefined,
                }));
                setRangeWarning(null);
              }}
              onSelectVerse={(verseNumber) => {
                setLocalRepeat((prev) => ({ ...prev, endVerseNumber: verseNumber, end: verseNumber }));
                setRangeWarning(null);
              }}
            />
          </View>
        )}

        {errorMessage && chapters.length === 0 ? (
          <View className="gap-2">
            <Text className="text-xs text-error dark:text-error-dark">{errorMessage}</Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Retry loading surahs"
              className="self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-3">
          {!isSingle ? (
            <CounterField
              label="Play count"
              value={playCount}
              min={1}
              onChange={(v) => {
                setLocalRepeat((prev) => ({ ...prev, playCount: v }));
                setRangeWarning(null);
              }}
            />
          ) : null}
          <CounterField
            label="Repeat each"
            value={repeatEach}
            min={1}
            onChange={(v) => {
              setLocalRepeat((prev) => ({ ...prev, repeatEach: v }));
              setRangeWarning(null);
            }}
          />
          <CounterField
            label="Delay seconds"
            value={delay}
            min={0}
            onChange={(v) => {
              setLocalRepeat((prev) => ({ ...prev, delay: v }));
              setRangeWarning(null);
            }}
          />
        </View>
      </View>
    </View>
  );
}

function RepeatModeToggle({
  value,
  onChange,
}: {
  value: 'single' | 'range' | 'surah';
  onChange: (mode: 'single' | 'range' | 'surah') => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={() => undefined}
      className="flex-row items-center rounded-full bg-interactive dark:bg-interactive-dark p-1"
    >
      <RepeatModeToggleButton
        label="Single verse"
        isActive={value === 'single'}
        onPress={() => onChange('single')}
      />
      <RepeatModeToggleButton
        label="Verse range"
        isActive={value === 'range'}
        onPress={() => onChange('range')}
      />
      <RepeatModeToggleButton
        label="Full surah"
        isActive={value === 'surah'}
        onPress={() => onChange('surah')}
      />
    </Pressable>
  );
}

function RepeatModeToggleButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const activeShadow =
    Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'h-11 flex-1 items-center justify-center rounded-full px-2',
        isActive ? 'bg-surface dark:bg-surface-dark' : '',
      ].join(' ')}
      style={({ pressed }) => [isActive ? activeShadow : null, { opacity: pressed ? 0.9 : 1 }]}
    >
      <Text
        numberOfLines={1}
        className={[
          'text-xs font-semibold',
          isActive
            ? 'text-foreground dark:text-foreground-dark'
            : 'text-muted dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CounterField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const safeValue = Number.isFinite(value) ? Math.max(min, Math.floor(value)) : min;

  return (
    <View style={{ flex: 1, minWidth: 150 }} className="gap-2">
      <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
        {label}
      </Text>
      <View className="flex-row items-center rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-2 py-2">
        <Pressable
          onPress={() => onChange(Math.max(min, safeValue - 1))}
          accessibilityRole="button"
          accessibilityLabel={`${label} decrease`}
          className="p-2 rounded-full"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Minus size={16} strokeWidth={2.25} color={palette.muted} />
        </Pressable>
        <TextInput
          value={String(safeValue)}
          onChangeText={(text) => {
            const trimmed = text.trim();
            if (!trimmed) {
              onChange(min);
              return;
            }
            const parsed = Number(trimmed);
            if (!Number.isFinite(parsed)) return;
            onChange(Math.max(min, Math.floor(parsed)));
          }}
          keyboardType="number-pad"
          placeholderTextColor={palette.muted}
          className="flex-1 text-center text-base text-foreground dark:text-foreground-dark"
        />
        <Pressable
          onPress={() => onChange(safeValue + 1)}
          accessibilityRole="button"
          accessibilityLabel={`${label} increase`}
          className="p-2 rounded-full"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Plus size={16} strokeWidth={2.25} color={palette.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function TabButton({
  label,
  isActive,
  onPress,
  icon,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  icon: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'px-3 py-2 rounded-xl',
        isActive ? 'bg-accent' : 'bg-interactive dark:bg-interactive-dark',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className={isActive ? 'text-sm font-semibold text-on-accent' : 'text-sm font-semibold text-foreground dark:text-foreground-dark'}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  keyboardWrapper: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  dialog: {
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  dialogSafeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    width: '100%',
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 24,
  },
});
