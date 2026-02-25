import { Download, Mic, X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SurahVerseSelectorRow } from '@/components/search/SurahVerseSelectorRow';
import Colors from '@/constants/Colors';
import { DEFAULT_RECITER, type Reciter, useReciters } from '@/hooks/audio/useReciters';
import { useChapters } from '@/hooks/useChapters';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { getQdcAudioFile } from '@/src/core/infrastructure/audio/qdcAudio';
import { container } from '@/src/core/infrastructure/di/container';
import type { Chapter } from '@/types';

type DownloadRange = {
  startSurahId?: number;
  startVerseNumber?: number;
  endSurahId?: number;
  endVerseNumber?: number;
};

type DownloadScope = 'verse' | 'surah' | 'range';

type NormalizedRange = {
  startSurahId: number;
  startVerseNumber: number;
  endSurahId: number;
  endVerseNumber: number;
};

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

function toPositiveInt(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function buildInitialRange(activeVerseKey: string | null): DownloadRange {
  const surahId = parseChapterIdFromVerseKey(activeVerseKey) ?? undefined;
  const verseNumber = parseVerseNumberFromVerseKey(activeVerseKey) ?? undefined;

  if (!surahId || !verseNumber) {
    return {
      startSurahId: surahId,
      startVerseNumber: verseNumber,
      endSurahId: surahId,
      endVerseNumber: verseNumber,
    };
  }

  return {
    startSurahId: surahId,
    startVerseNumber: verseNumber,
    endSurahId: surahId,
    endVerseNumber: verseNumber,
  };
}

function buildInitialScope(activeVerseKey: string | null): DownloadScope {
  const surahId = parseChapterIdFromVerseKey(activeVerseKey);
  const verseNumber = parseVerseNumberFromVerseKey(activeVerseKey);

  if (surahId && verseNumber) return 'verse';
  if (surahId) return 'surah';
  return 'range';
}

function buildSurahIdRange(startSurahId: number, endSurahId: number): number[] {
  const ids: number[] = [];
  for (let surahId = startSurahId; surahId <= endSurahId; surahId += 1) {
    ids.push(surahId);
  }
  return ids;
}

function validateRange(
  range: DownloadRange,
  chapterLookup: Record<number, Chapter>
): { normalized: NormalizedRange | null; message: string | null } {
  const startSurahId = toPositiveInt(range.startSurahId);
  const endSurahId = toPositiveInt(range.endSurahId ?? range.startSurahId);
  const startVerseNumber = toPositiveInt(range.startVerseNumber);
  const endVerseNumber = toPositiveInt(range.endVerseNumber ?? range.startVerseNumber);

  if (!startSurahId || !endSurahId || !startVerseNumber || !endVerseNumber) {
    return { normalized: null, message: 'Select a start and end surah and verse to download.' };
  }

  if (startSurahId > endSurahId) {
    return { normalized: null, message: 'Start surah must come before end surah.' };
  }

  if (startSurahId === endSurahId && startVerseNumber > endVerseNumber) {
    return { normalized: null, message: 'Start verse must be before end verse.' };
  }

  const startChapter = chapterLookup[startSurahId];
  const endChapter = chapterLookup[endSurahId];
  if (
    (startChapter && startVerseNumber > startChapter.verses_count) ||
    (endChapter && endVerseNumber > endChapter.verses_count)
  ) {
    return { normalized: null, message: 'Selected verse is outside the surah verse count.' };
  }

  return {
    normalized: {
      startSurahId,
      startVerseNumber,
      endSurahId,
      endVerseNumber,
    },
    message: null,
  };
}

export function AudioDownloadModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const audio = useAudioPlayer();
  const { reciters, isLoading: recitersLoading, error: recitersError, refresh: refreshReciters } =
    useReciters();
  const { chapters, isLoading: chaptersLoading, errorMessage: chaptersError, refresh: refreshChapters } =
    useChapters();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();

  const activeVerseKey = audio.activeVerseKey;
  const [localReciter, setLocalReciter] = React.useState<Reciter>(audio.reciter);
  const [downloadScope, setDownloadScope] = React.useState<DownloadScope>(
    buildInitialScope(activeVerseKey)
  );
  const [localRange, setLocalRange] = React.useState<DownloadRange>(buildInitialRange(audio.activeVerseKey));
  const [rangeWarning, setRangeWarning] = React.useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = React.useState(false);
  const [queueProgress, setQueueProgress] = React.useState<{ completed: number; total: number } | null>(
    null
  );

  const chapterLookup = React.useMemo(
    () =>
      chapters.reduce<Record<number, Chapter>>((acc, chapter) => {
        acc[chapter.id] = chapter;
        return acc;
      }, {}),
    [chapters]
  );

  const startChapter =
    typeof localRange.startSurahId === 'number' ? chapterLookup[localRange.startSurahId] : undefined;
  const endChapter =
    typeof localRange.endSurahId === 'number' ? chapterLookup[localRange.endSurahId] : undefined;

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

  const prevIsOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setLocalReciter(audio.reciter);
      setLocalRange(buildInitialRange(audio.activeVerseKey));
      setDownloadScope(buildInitialScope(audio.activeVerseKey));
      setRangeWarning(null);
      setDownloadBusy(false);
      setQueueProgress(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [audio.activeVerseKey, audio.reciter, isOpen]);

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

  React.useEffect(() => {
    if (!startChapter?.verses_count || !localRange.startVerseNumber) return;
    if (localRange.startVerseNumber > startChapter.verses_count) {
      setLocalRange((prev) => ({ ...prev, startVerseNumber: startChapter.verses_count }));
    }
  }, [localRange.startVerseNumber, startChapter?.verses_count]);

  React.useEffect(() => {
    if (!endChapter?.verses_count || !localRange.endVerseNumber) return;
    if (localRange.endVerseNumber > endChapter.verses_count) {
      setLocalRange((prev) => ({ ...prev, endVerseNumber: endChapter.verses_count }));
    }
  }, [endChapter?.verses_count, localRange.endVerseNumber]);

  React.useEffect(() => {
    if (!localRange.startSurahId || localRange.endSurahId) return;
    setLocalRange((prev) => ({ ...prev, endSurahId: prev.startSurahId }));
  }, [localRange.endSurahId, localRange.startSurahId]);

  const selectedSurahIds = React.useMemo(() => {
    if (downloadScope === 'range') {
      const startSurahId = toPositiveInt(localRange.startSurahId);
      const endSurahId = toPositiveInt(localRange.endSurahId ?? localRange.startSurahId);
      if (!startSurahId || !endSurahId || startSurahId > endSurahId) return [] as number[];
      return buildSurahIdRange(startSurahId, endSurahId);
    }

    const surahId = toPositiveInt(localRange.startSurahId);
    return surahId ? [surahId] : [];
  }, [downloadScope, localRange.endSurahId, localRange.startSurahId]);

  const { itemsByKey, refresh: refreshDownloadIndex } = useDownloadIndexItems({
    enabled: visible,
    pollIntervalMs: 800,
  });

  const statusSummary = React.useMemo(() => {
    if (selectedSurahIds.length === 0) return null;

    let installed = 0;
    let downloading = 0;
    let queued = 0;
    let failed = 0;

    for (const surahId of selectedSurahIds) {
      const key = getDownloadKey({
        kind: 'audio',
        reciterId: localReciter.id,
        scope: 'surah',
        surahId,
      });
      const item = itemsByKey.get(key);
      if (!item) continue;

      if (item.status === 'installed') installed += 1;
      if (item.status === 'downloading') downloading += 1;
      if (item.status === 'queued') queued += 1;
      if (item.status === 'failed') failed += 1;
    }

    return { installed, downloading, queued, failed, total: selectedSurahIds.length };
  }, [itemsByKey, localReciter.id, selectedSurahIds]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current || downloadBusy) return;
    onClose();
  }, [downloadBusy, onClose]);

  const handleDownloadSelected = React.useCallback(async (): Promise<void> => {
    if (downloadBusy) return;

    let surahIds: number[] = [];

    if (downloadScope === 'range') {
      const validated = validateRange(localRange, chapterLookup);
      if (!validated.normalized) {
        setRangeWarning(validated.message);
        return;
      }
      surahIds = buildSurahIdRange(validated.normalized.startSurahId, validated.normalized.endSurahId);
      if (surahIds.length === 0) {
        setRangeWarning('Select a valid surah range to download.');
        return;
      }
    } else if (downloadScope === 'surah') {
      const surahId = toPositiveInt(localRange.startSurahId);
      if (!surahId) {
        setRangeWarning('Select a surah to download.');
        return;
      }
      surahIds = [surahId];
    } else {
      const surahId = toPositiveInt(localRange.startSurahId);
      const verseNumber = toPositiveInt(localRange.startVerseNumber);
      if (!surahId || !verseNumber) {
        setRangeWarning('Select a verse to download.');
        return;
      }
      const chapter = chapterLookup[surahId];
      if (chapter && verseNumber > chapter.verses_count) {
        setRangeWarning('Selected verse is outside the surah verse count.');
        return;
      }
      surahIds = [surahId];
    }

    setRangeWarning(null);
    setDownloadBusy(true);
    setQueueProgress({ completed: 0, total: surahIds.length });

    const failures: Array<{ surahId: number; message: string }> = [];

    try {
      for (let index = 0; index < surahIds.length; index += 1) {
        const surahId = surahIds[index];

        try {
          const audioFile = await getQdcAudioFile({
            reciterId: localReciter.id,
            chapterId: surahId,
            segments: true,
          });

          const audioUrl = audioFile.audioUrl?.trim() ?? '';
          if (!audioUrl) {
            throw new Error('No audio source returned for this surah.');
          }

          await container.getAudioDownloadManager().downloadSurahAudio({
            reciterId: localReciter.id,
            surahId,
            audioUrl,
          });
        } catch (error) {
          failures.push({
            surahId,
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          setQueueProgress({ completed: index + 1, total: surahIds.length });
        }
      }
    } finally {
      setDownloadBusy(false);
      refreshDownloadIndex();
    }

    if (failures.length > 0) {
      const first = failures[0];
      Alert.alert(
        'Some downloads failed',
        `${failures.length} of ${surahIds.length} surahs failed.\nFirst: Surah ${first.surahId} (${first.message})`
      );
      return;
    }

    if (surahIds.length === 1) {
      const successMessage =
        downloadScope === 'verse'
          ? `Verse audio is available via Surah ${surahIds[0]} offline file.`
          : `Surah ${surahIds[0]} audio is ready for offline playback.`;
      Alert.alert('Download complete', successMessage);
      return;
    }

    Alert.alert('Downloads complete', `${surahIds.length} surahs are ready for offline playback.`);
  }, [chapterLookup, downloadBusy, downloadScope, localRange, localReciter.id, refreshDownloadIndex]);

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.85));
  const minDialogHeight = Math.min(maxDialogHeight, Math.max(460, Math.round(windowHeight * 0.74)));

  const queueLabel = React.useMemo(() => {
    if (!downloadBusy) {
      if (downloadScope === 'verse') return 'Download selected verse';
      if (downloadScope === 'surah') return 'Download selected surah';
      return 'Download selected range';
    }
    if (queueProgress) return `Downloading ${queueProgress.completed}/${queueProgress.total}`;
    return 'Preparing download...';
  }, [downloadBusy, downloadScope, queueProgress]);

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={() => {
        if (downloadBusy) return;
        onClose();
      }}
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
                        <Download color={palette.tint} size={18} strokeWidth={2.25} />
                      </View>
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-base font-semibold text-foreground dark:text-foreground-dark"
                      >
                        Download audio
                      </Text>
                    </View>

                    <Pressable
                      onPress={onClose}
                      disabled={downloadBusy}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                      className={downloadBusy ? 'p-2 rounded-full opacity-40' : 'p-2 rounded-full'}
                    >
                      <X size={18} strokeWidth={2.25} color={palette.muted} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.content}>
                  <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View className="gap-4">
                      <DownloadScopeToggle
                        value={downloadScope}
                        onChange={(next) => {
                          setDownloadScope(next);
                          setRangeWarning(null);
                        }}
                      />

                      <View className="rounded-2xl border border-border/30 dark:border-border-dark/20 p-4 gap-5">
                        {rangeWarning ? (
                          <Text className="text-xs text-error dark:text-error-dark">{rangeWarning}</Text>
                        ) : null}

                        {downloadScope === 'verse' ? (
                          <SurahVerseSelectorRow
                            surahLabel="Surah"
                            verseLabel="Verse"
                            chapters={chapters}
                            selectedSurah={localRange.startSurahId}
                            selectedVerse={localRange.startVerseNumber}
                            isLoading={chaptersLoading}
                            onSelectSurah={(surahId) => {
                              setLocalRange((prev) => ({
                                ...prev,
                                startSurahId: surahId,
                                startVerseNumber: undefined,
                                ...(prev.endSurahId ? {} : { endSurahId: surahId }),
                              }));
                              setRangeWarning(null);
                            }}
                            onSelectVerse={(verseNumber) => {
                              setLocalRange((prev) => ({ ...prev, startVerseNumber: verseNumber }));
                              setRangeWarning(null);
                            }}
                          />
                        ) : null}

                        {downloadScope === 'surah' ? (
                          <SurahVerseSelectorRow
                            surahLabel="Surah"
                            chapters={chapters}
                            selectedSurah={localRange.startSurahId}
                            selectedVerse={undefined}
                            isLoading={chaptersLoading}
                            hideVerse
                            onSelectSurah={(surahId) => {
                              setLocalRange((prev) => ({
                                ...prev,
                                startSurahId: surahId,
                                ...(prev.endSurahId ? {} : { endSurahId: surahId }),
                              }));
                              setRangeWarning(null);
                            }}
                          />
                        ) : null}

                        {downloadScope === 'range' ? (
                          <View className="gap-5">
                            <SurahVerseSelectorRow
                              surahLabel="From Surah"
                              verseLabel="Verse"
                              chapters={chapters}
                              selectedSurah={localRange.startSurahId}
                              selectedVerse={localRange.startVerseNumber}
                              isLoading={chaptersLoading}
                              onSelectSurah={(surahId) => {
                                setLocalRange((prev) => ({
                                  ...prev,
                                  startSurahId: surahId,
                                  startVerseNumber: undefined,
                                  ...(prev.endSurahId ? {} : { endSurahId: surahId }),
                                }));
                                setRangeWarning(null);
                              }}
                              onSelectVerse={(verseNumber) => {
                                setLocalRange((prev) => {
                                  const startSurahId = prev.startSurahId;
                                  const endSurahId = prev.endSurahId ?? startSurahId;
                                  const shouldSyncEndVerse =
                                    !prev.endVerseNumber && startSurahId && endSurahId === startSurahId;
                                  return {
                                    ...prev,
                                    startVerseNumber: verseNumber,
                                    ...(shouldSyncEndVerse ? { endVerseNumber: verseNumber } : {}),
                                  };
                                });
                                setRangeWarning(null);
                              }}
                            />

                            <SurahVerseSelectorRow
                              surahLabel="To Surah"
                              verseLabel="Verse"
                              chapters={chapters}
                              selectedSurah={localRange.endSurahId ?? localRange.startSurahId}
                              selectedVerse={localRange.endVerseNumber}
                              isLoading={chaptersLoading}
                              onSelectSurah={(surahId) => {
                                setLocalRange((prev) => ({
                                  ...prev,
                                  endSurahId: surahId,
                                  endVerseNumber: undefined,
                                }));
                                setRangeWarning(null);
                              }}
                              onSelectVerse={(verseNumber) => {
                                setLocalRange((prev) => ({ ...prev, endVerseNumber: verseNumber }));
                                setRangeWarning(null);
                              }}
                            />
                          </View>
                        ) : null}

                        {chaptersError && chapters.length === 0 ? (
                          <View className="gap-2">
                            <Text className="text-xs text-error dark:text-error-dark">{chaptersError}</Text>
                            <Pressable
                              onPress={refreshChapters}
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
                      </View>

                      <View className="rounded-2xl border border-border/30 dark:border-border-dark/20 p-4 gap-3">
                        <View className="flex-row items-center justify-between gap-3">
                          <View className="flex-row items-center gap-2">
                            <Mic size={16} strokeWidth={2.25} color={palette.muted} />
                            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                              Reciter
                            </Text>
                          </View>
                          {statusSummary ? (
                            <Text className="text-xs text-muted dark:text-muted-dark">
                              Installed {statusSummary.installed}/{statusSummary.total}
                            </Text>
                          ) : null}
                        </View>

                        {statusSummary && (statusSummary.downloading > 0 || statusSummary.queued > 0) ? (
                          <Text className="text-xs text-muted dark:text-muted-dark">
                            {statusSummary.queued > 0 ? `${statusSummary.queued} queued` : ''}
                            {statusSummary.queued > 0 && statusSummary.downloading > 0 ? ' · ' : ''}
                            {statusSummary.downloading > 0
                              ? `${statusSummary.downloading} downloading`
                              : ''}
                          </Text>
                        ) : null}

                        {statusSummary && statusSummary.failed > 0 ? (
                          <Text className="text-xs text-error dark:text-error-dark">
                            {statusSummary.failed} failed download(s) in this selection.
                          </Text>
                        ) : null}

                        {(recitersLoading || recitersError) && (
                          <View className="flex-row items-center gap-2">
                            {recitersLoading ? (
                              <ActivityIndicator size="small" color={palette.muted} />
                            ) : null}
                            <Text className="text-xs text-muted dark:text-muted-dark">
                              {recitersLoading ? 'Loading reciters…' : 'Unable to load reciters.'}
                            </Text>
                            {recitersError ? (
                              <Pressable
                                onPress={refreshReciters}
                                accessibilityRole="button"
                                accessibilityLabel="Retry reciters"
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

                        <View className="gap-3">
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
                  </ScrollView>
                </View>

                <View className="px-4 py-3 border-t border-border/30 dark:border-border-dark/20">
                  <Pressable
                    onPress={() => void handleDownloadSelected()}
                    disabled={downloadBusy}
                    accessibilityRole="button"
                    accessibilityLabel={queueLabel}
                    className={[
                      'w-full px-5 py-3 rounded-xl bg-accent items-center justify-center',
                      downloadBusy ? 'opacity-80' : '',
                    ].join(' ')}
                    style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                  >
                    <View className="flex-row items-center gap-2">
                      {downloadBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                      <Text className="text-sm font-semibold text-on-accent">{queueLabel}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DownloadScopeToggle({
  value,
  onChange,
}: {
  value: DownloadScope;
  onChange: (scope: DownloadScope) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center rounded-full bg-interactive dark:bg-interactive-dark p-1">
      <DownloadScopeToggleButton
        label="Verse"
        isActive={value === 'verse'}
        onPress={() => onChange('verse')}
      />
      <DownloadScopeToggleButton
        label="Surah"
        isActive={value === 'surah'}
        onPress={() => onChange('surah')}
      />
      <DownloadScopeToggleButton
        label="Range"
        isActive={value === 'range'}
        onPress={() => onChange('range')}
      />
    </View>
  );
}

function DownloadScopeToggleButton({
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
        'h-10 flex-1 items-center justify-center rounded-full px-2',
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
