import React from 'react';
import { useAudioPlayer as useExpoAudioPlayer } from 'expo-audio';

import { useQdcAudioFile } from '@/hooks/audio/useQdcAudioFile';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import type { QdcAudioSegment, QdcAudioVerseTiming } from '@/src/core/infrastructure/audio/qdcAudio';
import { buildQuranWordAudioUrl } from '@/src/core/infrastructure/audio/wordAudio';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

const WORD_AUDIO_LOAD_TIMEOUT_MS = 10_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseChapterIdFromVerseKey(verseKey: string | null): number | null {
  if (!verseKey) return null;
  const [surahRaw] = verseKey.split(':');
  const parsed = Number.parseInt(surahRaw ?? '', 10);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function buildRegistryKey(verseKey: string, wordPosition: number): string {
  return `${verseKey}::${wordPosition}`;
}

function findActiveWord(segments: QdcAudioSegment[], currentMs: number): number | null {
  for (const [word, startMs, endMs] of segments) {
    if (currentMs >= startMs && currentMs < endMs) {
      return word;
    }
  }
  return null;
}

function buildVerseTimingIndex(
  verseTimings: QdcAudioVerseTiming[] | undefined
): Map<string, QdcAudioVerseTiming> | null {
  if (!Array.isArray(verseTimings) || verseTimings.length === 0) return null;
  const map = new Map<string, QdcAudioVerseTiming>();
  for (const timing of verseTimings) {
    if (!timing?.verseKey) continue;
    map.set(timing.verseKey, timing);
  }
  return map;
}

export type RegisterWordHighlight = (params: {
  verseKey: string;
  wordPosition: number;
  setHighlighted: (highlighted: boolean) => void;
}) => () => void;

export type ActiveAudioWord = {
  verseKey: string;
  wordPosition: number;
};

export type VerseAudioWordSync = {
  activeWord: ActiveAudioWord | null;
  isPlaying: boolean;
  isSeekEnabled: boolean;
  playWord: (params: { verseKey: string; wordPosition: number }) => void;
  playVerseFromWord: (params: { verseKey: string; wordPosition: number }) => void;
  registerWordHighlight: RegisterWordHighlight;
  seekToWord: (params: { verseKey: string; wordPosition: number }) => void;
};

export function useVerseAudioWordSync(chapterId?: number | null): VerseAudioWordSync {
  const audio = useAudioPlayer();
  const wordPlayer = useExpoAudioPlayer(null, {
    updateInterval: 250,
    downloadFirst: false,
  });
  const wordAudioSourceRef = React.useRef<string | null>(null);
  const wordAudioRequestRef = React.useRef(0);

  React.useEffect(
    () => () => {
      wordAudioRequestRef.current += 1;
      try {
        wordPlayer.pause();
      } catch {
        // The Expo hook may already have released the native player.
      }
    },
    [wordPlayer]
  );

  const activeChapterId = React.useMemo(
    () => chapterId ?? parseChapterIdFromVerseKey(audio.activeVerseKey),
    [chapterId, audio.activeVerseKey]
  );

  const { audioFile } = useQdcAudioFile(audio.reciter.id, activeChapterId, true);

  const verseTimingIndex = React.useMemo(
    () => buildVerseTimingIndex(audioFile?.verseTimings),
    [audioFile?.verseTimings]
  );

  const activeSegments = React.useMemo((): QdcAudioSegment[] | null => {
    const verseKey = audio.activeVerseKey;
    if (!verseKey || !verseTimingIndex) return null;
    const timing = verseTimingIndex.get(verseKey);
    const segments = timing?.segments;
    return Array.isArray(segments) && segments.length ? segments : null;
  }, [audio.activeVerseKey, verseTimingIndex]);

  const registryRef = React.useRef(new Map<string, (highlighted: boolean) => void>());
  const highlightedKeyRef = React.useRef<string | null>(null);
  const activeWordRef = React.useRef<ActiveAudioWord | null>(null);
  const [activeWord, setActiveWord] = React.useState<ActiveAudioWord | null>(null);

  const pendingSeekRef = React.useRef<{
    verseKey: string;
    wordPosition: number;
  } | null>(null);

  const updateActiveWord = React.useCallback((nextActiveWord: ActiveAudioWord | null) => {
    const previous = activeWordRef.current;
    if (
      previous?.verseKey === nextActiveWord?.verseKey &&
      previous?.wordPosition === nextActiveWord?.wordPosition
    ) {
      return;
    }

    activeWordRef.current = nextActiveWord;
    setActiveWord(nextActiveWord);
  }, []);

  const clearHighlight = React.useCallback(() => {
    const previousKey = highlightedKeyRef.current;
    if (previousKey) {
      registryRef.current.get(previousKey)?.(false);
    }
    highlightedKeyRef.current = null;
    updateActiveWord(null);
  }, [updateActiveWord]);

  const registerWordHighlight = React.useCallback<RegisterWordHighlight>(
    ({ verseKey, wordPosition, setHighlighted }) => {
      const normalizedVerseKey = verseKey.trim();
      const normalizedWordPosition =
        typeof wordPosition === 'number' && Number.isFinite(wordPosition) ? Math.trunc(wordPosition) : 0;
      if (!normalizedVerseKey || normalizedWordPosition <= 0) return () => {};

      const key = buildRegistryKey(normalizedVerseKey, normalizedWordPosition);
      registryRef.current.set(key, setHighlighted);

      return () => {
        registryRef.current.delete(key);
        if (highlightedKeyRef.current === key) {
          highlightedKeyRef.current = null;
        }
      };
    },
    []
  );

  React.useEffect(() => {
    if (!audio.isPlaying) {
      clearHighlight();
      return;
    }

    const verseKey = audio.activeVerseKey;
    if (!verseKey) {
      clearHighlight();
      return;
    }

    if (!activeSegments) {
      clearHighlight();
      return;
    }

    if (!(audio.segmentEndSec > audio.segmentStartSec)) return;

    const currentMs = (audio.segmentStartSec + audio.positionSec) * 1000;
    const activeWord = findActiveWord(activeSegments, currentMs);
    const nextKey = activeWord ? buildRegistryKey(verseKey, activeWord) : null;
    updateActiveWord(activeWord ? { verseKey, wordPosition: activeWord } : null);

    if (nextKey && highlightedKeyRef.current === nextKey) return;
    if (!nextKey && !highlightedKeyRef.current) return;

    const previousKey = highlightedKeyRef.current;
    if (previousKey) {
      registryRef.current.get(previousKey)?.(false);
      highlightedKeyRef.current = null;
    }

    if (!nextKey) return;

    const setHighlighted = registryRef.current.get(nextKey);
    if (!setHighlighted) return;

    setHighlighted(true);
    highlightedKeyRef.current = nextKey;
  }, [
    activeSegments,
    audio.activeVerseKey,
    audio.isPlaying,
    audio.positionSec,
    audio.segmentEndSec,
    audio.segmentStartSec,
    clearHighlight,
    updateActiveWord,
  ]);

  const isSeekEnabled = Boolean(audio.isVisible);

  const startFromWord = React.useCallback(
    ({ verseKey, wordPosition }: { verseKey: string; wordPosition: number }) => {
      const normalizedVerseKey = verseKey.trim();
      const normalizedWordPosition =
        typeof wordPosition === 'number' && Number.isFinite(wordPosition) ? Math.trunc(wordPosition) : 0;

      if (!normalizedVerseKey || normalizedWordPosition <= 0) return;

      const timing = verseTimingIndex?.get(normalizedVerseKey);
      const segment = timing?.segments?.find((s) => s[0] === normalizedWordPosition);
      const relativeSec =
        segment && timing ? Math.max(0, (segment[1] - timing.timestampFrom) / 1000) : null;

      const canSeekImmediately =
        audio.activeVerseKey === normalizedVerseKey &&
        !audio.isLoading &&
        typeof relativeSec === 'number' &&
        Number.isFinite(relativeSec);

      if (canSeekImmediately) {
        audio.seekRelative(relativeSec);
        if (!audio.isPlaying) {
          audio.togglePlay();
        }
        return;
      }

      pendingSeekRef.current = {
        verseKey: normalizedVerseKey,
        wordPosition: normalizedWordPosition,
      };
      audio.playVerse(normalizedVerseKey);
    },
    [
      audio.activeVerseKey,
      audio.isLoading,
      audio.isPlaying,
      audio.playVerse,
      audio.seekRelative,
      audio.togglePlay,
      verseTimingIndex,
    ]
  );

  const seekToWord = React.useCallback(
    (params: { verseKey: string; wordPosition: number }) => {
      if (!isSeekEnabled) return;
      startFromWord(params);
    },
    [isSeekEnabled, startFromWord]
  );

  const playVerseFromWord = React.useCallback(
    (params: { verseKey: string; wordPosition: number }) => startFromWord(params),
    [startFromWord]
  );

  const playWord = React.useCallback(
    (params: { verseKey: string; wordPosition: number }) => {
      const source = buildQuranWordAudioUrl(params);
      if (!source) return;

      const requestId = wordAudioRequestRef.current + 1;
      wordAudioRequestRef.current = requestId;

      // A pronunciation preview must not overlap an active recitation.
      if (audio.isPlaying) {
        audio.togglePlay();
      }

      void (async () => {
        try {
          wordPlayer.pause();
          if (wordAudioSourceRef.current !== source) {
            wordAudioSourceRef.current = source;
            wordPlayer.replace(source);
          }

          const startedAt = Date.now();
          while (!wordPlayer.isLoaded) {
            if (wordAudioRequestRef.current !== requestId) return;
            if (Date.now() - startedAt > WORD_AUDIO_LOAD_TIMEOUT_MS) {
              throw new Error('Timed out loading word pronunciation');
            }
            await delay(50);
          }

          if (wordAudioRequestRef.current !== requestId) return;
          await wordPlayer.seekTo(0);
          if (wordAudioRequestRef.current !== requestId) return;
          wordPlayer.play();
        } catch (error) {
          logger.warn(
            'Failed to play word pronunciation',
            { verseKey: params.verseKey, wordPosition: params.wordPosition },
            error as Error
          );
        }
      })();
    },
    [audio.isPlaying, audio.togglePlay, wordPlayer]
  );

  React.useEffect(() => {
    const pending = pendingSeekRef.current;
    if (!pending) return;
    if (!verseTimingIndex) return;
    if (audio.isLoading) return;
    if (audio.activeVerseKey !== pending.verseKey) return;
    if (!(audio.segmentEndSec > audio.segmentStartSec)) return;

    const timing = verseTimingIndex.get(pending.verseKey);
    const segment = timing?.segments?.find((s) => s[0] === pending.wordPosition);
    if (!segment || !timing) {
      pendingSeekRef.current = null;
      return;
    }

    const relativeSec = Math.max(0, (segment[1] - timing.timestampFrom) / 1000);
    audio.seekRelative(relativeSec);
    if (!audio.isPlaying) {
      audio.togglePlay();
    }
    pendingSeekRef.current = null;
  }, [
    audio.activeVerseKey,
    audio.isLoading,
    audio.isPlaying,
    audio.seekRelative,
    audio.segmentEndSec,
    audio.segmentStartSec,
    audio.togglePlay,
    verseTimingIndex,
  ]);

  return React.useMemo(
    () => ({
      activeWord,
      isPlaying: audio.isPlaying,
      isSeekEnabled,
      playWord,
      playVerseFromWord,
      registerWordHighlight,
      seekToWord,
    }),
    [
      activeWord,
      audio.isPlaying,
      isSeekEnabled,
      playVerseFromWord,
      playWord,
      registerWordHighlight,
      seekToWord,
    ]
  );
}
