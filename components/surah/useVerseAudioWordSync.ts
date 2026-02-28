import React from 'react';

import { useQdcAudioFile } from '@/hooks/audio/useQdcAudioFile';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import type { QdcAudioSegment, QdcAudioVerseTiming } from '@/src/core/infrastructure/audio/qdcAudio';

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

export type VerseAudioWordSync = {
  isSeekEnabled: boolean;
  registerWordHighlight: RegisterWordHighlight;
  seekToWord: (params: { verseKey: string; wordPosition: number }) => void;
};

export function useVerseAudioWordSync(): VerseAudioWordSync {
  const audio = useAudioPlayer();

  const activeChapterId = React.useMemo(
    () => parseChapterIdFromVerseKey(audio.activeVerseKey),
    [audio.activeVerseKey]
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

  const pendingSeekRef = React.useRef<{ verseKey: string; wordPosition: number } | null>(null);

  const clearHighlight = React.useCallback(() => {
    const previousKey = highlightedKeyRef.current;
    if (previousKey) {
      registryRef.current.get(previousKey)?.(false);
    }
    highlightedKeyRef.current = null;
  }, []);

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
  ]);

  const isSeekEnabled = Boolean(audio.isVisible);

  const seekToWord = React.useCallback(
    ({ verseKey, wordPosition }: { verseKey: string; wordPosition: number }) => {
      const normalizedVerseKey = verseKey.trim();
      const normalizedWordPosition =
        typeof wordPosition === 'number' && Number.isFinite(wordPosition) ? Math.trunc(wordPosition) : 0;

      if (!normalizedVerseKey || normalizedWordPosition <= 0) return;
      if (!isSeekEnabled) return;

      const timing = verseTimingIndex?.get(normalizedVerseKey);
      const segment = timing?.segments?.find((s) => s[0] === normalizedWordPosition);
      const relativeSec =
        segment && timing ? Math.max(0, (segment[1] - timing.timestampFrom) / 1000) : null;

      const canSeekImmediately =
        audio.activeVerseKey === normalizedVerseKey &&
        audio.isPlaying &&
        !audio.isLoading &&
        typeof relativeSec === 'number' &&
        Number.isFinite(relativeSec);

      if (canSeekImmediately) {
        audio.seekRelative(relativeSec);
        return;
      }

      pendingSeekRef.current = { verseKey: normalizedVerseKey, wordPosition: normalizedWordPosition };
      audio.playVerse(normalizedVerseKey);
    },
    [
      audio.activeVerseKey,
      audio.isLoading,
      audio.isPlaying,
      audio.playVerse,
      audio.seekRelative,
      isSeekEnabled,
      verseTimingIndex,
    ]
  );

  React.useEffect(() => {
    const pending = pendingSeekRef.current;
    if (!pending) return;
    if (!isSeekEnabled) return;
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
    pendingSeekRef.current = null;
  }, [
    audio.activeVerseKey,
    audio.isLoading,
    audio.seekRelative,
    audio.segmentEndSec,
    audio.segmentStartSec,
    isSeekEnabled,
    verseTimingIndex,
  ]);

  return React.useMemo(
    () => ({ isSeekEnabled, registerWordHighlight, seekToWord }),
    [isSeekEnabled, registerWordHighlight, seekToWord]
  );
}
