import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAudioPlayer as useExpoAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { DEFAULT_RECITER, type Reciter } from '@/hooks/audio/useReciters';
import { useQdcAudioFile } from '@/hooks/audio/useQdcAudioFile';
import { getItem, parseJson, setItem } from '@/lib/storage/appStorage';
import {
  clearPlayerLockScreenControls,
  setPlayerActiveForLockScreen,
  updatePlayerLockScreenMetadata,
} from '@/src/core/infrastructure/audio/audioMode';
import { AudioFileStore } from '@/src/core/infrastructure/audio/AudioFileStore';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

const AUDIO_SETTINGS_KEY = 'quranAppAudioSettings';
const SETTINGS_PERSIST_DEBOUNCE_MS = 300;
const STATUS_UPDATE_INTERVAL_MS = 250;
const END_EPSILON_SEC = 0.05;
const MAX_PLAYER_LOAD_WAIT_MS = 10_000;

type PersistedAudioSettings = {
  reciterId?: number | undefined;
  reciterMeta?: Reciter | undefined;
  volume?: number | undefined;
  playbackRate?: number | undefined;
};

export type RepeatOptions = {
  mode: 'off' | 'single' | 'range' | 'surah';
  start?: number | undefined;
  end?: number | undefined;
  surahId?: number | undefined;
  verseNumber?: number | undefined;
  startSurahId?: number | undefined;
  startVerseNumber?: number | undefined;
  endSurahId?: number | undefined;
  endVerseNumber?: number | undefined;
  rangeSize?: number | undefined;
  playCount?: number | undefined;
  repeatEach?: number | undefined;
  delay?: number | undefined;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeReciter(value: unknown): Reciter {
  if (!value || typeof value !== 'object') return DEFAULT_RECITER;
  const candidate = value as Partial<Reciter>;
  const id = typeof candidate.id === 'number' && Number.isFinite(candidate.id) ? Math.trunc(candidate.id) : 0;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const locale = typeof candidate.locale === 'string' ? candidate.locale.trim() : undefined;

  if (id <= 0 || !name) return DEFAULT_RECITER;
  return { id, name, ...(locale ? { locale } : {}) };
}

function normalizeVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return clampNumber(value, 0, 1);
}

function normalizePlaybackRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return clampNumber(value, 0.5, 2);
}

function normalizeOptionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizeOptionalNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : undefined;
}

function normalizeRepeatOptions(value: RepeatOptions): RepeatOptions {
  const mode: RepeatOptions['mode'] =
    value.mode === 'single' || value.mode === 'range' || value.mode === 'surah' || value.mode === 'off'
      ? value.mode
      : 'off';

  const start = normalizeOptionalPositiveInt(value.start) ?? 1;
  const end = normalizeOptionalPositiveInt(value.end) ?? start;
  const playCount = normalizeOptionalPositiveInt(value.playCount) ?? 1;
  const repeatEach = normalizeOptionalPositiveInt(value.repeatEach) ?? 1;
  const delay = normalizeOptionalNonNegativeInt(value.delay) ?? 0;

  return {
    mode,
    start,
    end,
    playCount,
    repeatEach,
    delay,
    surahId: normalizeOptionalPositiveInt(value.surahId),
    verseNumber: normalizeOptionalPositiveInt(value.verseNumber),
    startSurahId: normalizeOptionalPositiveInt(value.startSurahId),
    startVerseNumber: normalizeOptionalPositiveInt(value.startVerseNumber),
    endSurahId: normalizeOptionalPositiveInt(value.endSurahId),
    endVerseNumber: normalizeOptionalPositiveInt(value.endVerseNumber),
    rangeSize: normalizeOptionalPositiveInt(value.rangeSize),
  };
}

function parseChapterIdFromVerseKey(verseKey: string | null): number | null {
  if (!verseKey) return null;
  const [surahRaw] = verseKey.split(':');
  const parsed = Number.parseInt(surahRaw ?? '', 10);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseVerseKeyNumbers(verseKey: string): { surahId: number; verseNumber: number } | null {
  const normalized = verseKey.trim();
  const parts = normalized.split(':');
  if (parts.length !== 2) return null;
  const [surahRaw, verseRaw] = parts;
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verseNumber)) return null;
  const normalizedSurah = Math.trunc(surahId);
  const normalizedVerse = Math.trunc(verseNumber);
  if (normalizedSurah <= 0 || normalizedVerse <= 0) return null;
  return { surahId: normalizedSurah, verseNumber: normalizedVerse };
}

function compareVerseKeys(a: string, b: string): number {
  const aParsed = parseVerseKeyNumbers(a);
  const bParsed = parseVerseKeyNumbers(b);
  if (!aParsed || !bParsed) return 0;
  if (aParsed.surahId !== bParsed.surahId) return aParsed.surahId - bParsed.surahId;
  return aParsed.verseNumber - bParsed.verseNumber;
}

function buildVerseKey(surahId: number, verseNumber: number): string {
  return `${surahId}:${verseNumber}`;
}

type QueueDescriptor =
  | { kind: 'chapter'; chapterId: number }
  | {
      kind: 'range';
      startSurahId: number;
      startVerseNumber: number;
      endSurahId: number;
      endVerseNumber: number;
    };

function getQueueDescriptorKey(descriptor: QueueDescriptor): string {
  if (descriptor.kind === 'chapter') return `chapter:${descriptor.chapterId}`;
  return `range:${descriptor.startSurahId}:${descriptor.startVerseNumber}-${descriptor.endSurahId}:${descriptor.endVerseNumber}`;
}

type RepeatRange = {
  startSurahId: number;
  startVerseNumber: number;
  endSurahId: number;
  endVerseNumber: number;
  startKey: string;
  endKey: string;
};

function deriveRepeatRange(opts: RepeatOptions): RepeatRange | null {
  const startSurahId = opts.startSurahId ?? opts.surahId;
  const endSurahId = opts.endSurahId ?? startSurahId;
  const startVerseNumber = opts.startVerseNumber ?? opts.start ?? opts.verseNumber;
  const endVerseNumber =
    opts.endVerseNumber ?? opts.end ?? opts.startVerseNumber ?? opts.start ?? opts.verseNumber;

  if (!startSurahId || !endSurahId || !startVerseNumber || !endVerseNumber) return null;
  if (startSurahId > endSurahId) return null;
  if (startSurahId === endSurahId && startVerseNumber > endVerseNumber) return null;

  return {
    startSurahId,
    startVerseNumber,
    endSurahId,
    endVerseNumber,
    startKey: buildVerseKey(startSurahId, startVerseNumber),
    endKey: buildVerseKey(endSurahId, endVerseNumber),
  };
}

interface AudioPlayerContextType {
  isVisible: boolean;
  isLoading: boolean;
  error: string | null;
  isPlaying: boolean;
  activeVerseKey: string | null;
  reciter: Reciter;
  playbackRate: number;
  volume: number;
  repeatOptions: RepeatOptions;
  queueVerseKeys: string[];
  queueIndex: number;
  segmentStartSec: number;
  segmentEndSec: number;
  positionSec: number;
  durationSec: number;
  playVerse: (verseKey: string) => void;
  nextVerse: () => boolean;
  prevVerse: () => boolean;
  togglePlay: () => void;
  seekRelative: (sec: number) => void;
  closePlayer: () => void;
  setReciter: (reciter: Reciter) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setRepeatOptions: (opts: RepeatOptions) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const player = useExpoAudioPlayer(null, { updateInterval: STATUS_UPDATE_INTERVAL_MS });
  const status = useAudioPlayerStatus(player);

  const [isVisible, setIsVisible] = useState(false);
  const [activeVerseKey, setActiveVerseKey] = useState<string | null>(null);
  const [segmentStartSec, setSegmentStartSec] = useState(0);
  const [segmentEndSec, setSegmentEndSec] = useState(0);
  const [queueVerseKeys, setQueueVerseKeys] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [queueKey, setQueueKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [reciter, setReciterState] = useState<Reciter>(DEFAULT_RECITER);
  const [volume, setVolumeState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [repeatOptions, setRepeatOptionsState] = useState<RepeatOptions>({
    mode: 'off',
    start: 1,
    end: 1,
    playCount: 1,
    repeatEach: 1,
    delay: 0,
  });
  const [verseRepeatsLeft, setVerseRepeatsLeft] = useState(repeatOptions.repeatEach ?? 1);
  const [playRepeatsLeft, setPlayRepeatsLeft] = useState(repeatOptions.playCount ?? 1);

  const isPlaying = Boolean(status.playing);
  const activeChapterId = useMemo(() => parseChapterIdFromVerseKey(activeVerseKey), [activeVerseKey]);
  const { audioFile, isLoading: isAudioFileLoading, error: audioFileError } = useQdcAudioFile(
    reciter.id,
    activeChapterId,
    true
  );

  const audioSourceRef = useRef<string | null>(null);
  const sessionIdRef = useRef(0);
  const wasAtEndRef = useRef(false);
  const lockScreenActiveRef = useRef(false);
  const repeatOptionsRef = useRef(repeatOptions);
  const queueCacheRef = useRef(new Map<number, string[]>());
  const rangeQueueCacheRef = useRef(new Map<string, string[]>());

  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedSettingsRef = useRef(false);
  const latestSettingsRef = useRef({ reciter, volume, playbackRate });

  useEffect(() => {
    let cancelled = false;

    async function loadSettings(): Promise<void> {
      const saved = parseJson<PersistedAudioSettings>(await getItem(AUDIO_SETTINGS_KEY));
      if (cancelled) return;

      const loadedReciter = normalizeReciter(saved?.reciterMeta);
      const loadedVolume = normalizeVolume(saved?.volume);
      const loadedRate = normalizePlaybackRate(saved?.playbackRate);

      setReciterState(loadedReciter);
      setVolumeState(loadedVolume);
      setPlaybackRateState(loadedRate);

      latestSettingsRef.current = {
        reciter: loadedReciter,
        volume: loadedVolume,
        playbackRate: loadedRate,
      };
      hasHydratedSettingsRef.current = true;
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    latestSettingsRef.current = { reciter, volume, playbackRate };
    if (!hasHydratedSettingsRef.current) return;

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      const payload: PersistedAudioSettings = {
        reciterId: reciter.id,
        reciterMeta: reciter,
        volume,
        playbackRate,
      };
      void setItem(AUDIO_SETTINGS_KEY, JSON.stringify(payload));
      persistTimeoutRef.current = null;
    }, SETTINGS_PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [reciter, volume, playbackRate]);

  useEffect(() => {
    return () => {
      if (!persistTimeoutRef.current) return;
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;

      const latest = latestSettingsRef.current;
      const payload: PersistedAudioSettings = {
        reciterId: latest.reciter.id,
        reciterMeta: latest.reciter,
        volume: latest.volume,
        playbackRate: latest.playbackRate,
      };
      void setItem(AUDIO_SETTINGS_KEY, JSON.stringify(payload));
    };
  }, []);

  useEffect(() => {
    try {
      player.volume = volume;
    } catch (e) {
      logger.warn('Failed to set audio volume', undefined, e as Error);
    }
  }, [player, volume]);

  useEffect(() => {
    try {
      player.setPlaybackRate(playbackRate);
    } catch (e) {
      logger.warn('Failed to set audio playback rate', undefined, e as Error);
    }
  }, [player, playbackRate]);

  useEffect(() => {
    setVerseRepeatsLeft(repeatOptions.repeatEach ?? 1);
    setPlayRepeatsLeft(repeatOptions.playCount ?? 1);
  }, [
    repeatOptions.mode,
    repeatOptions.playCount,
    repeatOptions.repeatEach,
    repeatOptions.surahId,
    repeatOptions.start,
    repeatOptions.end,
    repeatOptions.verseNumber,
    repeatOptions.startSurahId,
    repeatOptions.startVerseNumber,
    repeatOptions.endSurahId,
    repeatOptions.endVerseNumber,
  ]);

  useEffect(() => {
    if (!activeVerseKey) return;
    setVerseRepeatsLeft(repeatOptions.repeatEach ?? 1);
    if (repeatOptions.mode === 'single') {
      setPlayRepeatsLeft(repeatOptions.playCount ?? 1);
    }
  }, [activeVerseKey, repeatOptions.mode, repeatOptions.playCount, repeatOptions.repeatEach]);

  useEffect(() => {
    repeatOptionsRef.current = repeatOptions;
  }, [repeatOptions]);

  useEffect(() => {
    if (!isVisible || !activeVerseKey) {
      if (lockScreenActiveRef.current) {
        clearPlayerLockScreenControls(player);
        lockScreenActiveRef.current = false;
      }
      return;
    }

    const title = `Surah ${activeVerseKey}`;
    const artist = reciter.name;

    if (!lockScreenActiveRef.current) {
      lockScreenActiveRef.current = setPlayerActiveForLockScreen(player, { title, artist });
    }

    if (lockScreenActiveRef.current) {
      updatePlayerLockScreenMetadata(player, { title, artist });
    }
  }, [activeVerseKey, isVisible, player, reciter.name]);

  useEffect(() => {
    return () => {
      if (!lockScreenActiveRef.current) return;
      clearPlayerLockScreenControls(player);
      lockScreenActiveRef.current = false;
    };
  }, [player]);

  const ensureQueueAsync = React.useCallback(
    async ({
      descriptor,
      verseKey,
      sessionId,
    }: {
      descriptor: QueueDescriptor;
      verseKey: string;
      sessionId: number;
    }) => {
      const descriptorKey = getQueueDescriptorKey(descriptor);

      const getChapterVerseKeysCached = async (chapterId: number): Promise<string[]> => {
        const cached = queueCacheRef.current.get(chapterId);
        if (cached) return cached;
        const verseKeys = await container.getChapterVerseKeysRepository().getChapterVerseKeys(chapterId);
        queueCacheRef.current.set(chapterId, verseKeys);
        return verseKeys;
      };

      try {
        let verseKeys: string[] = [];

        if (descriptor.kind === 'chapter') {
          verseKeys = await getChapterVerseKeysCached(descriptor.chapterId);
        } else {
          const cachedRange = rangeQueueCacheRef.current.get(descriptorKey);
          if (cachedRange) {
            verseKeys = cachedRange;
          } else {
            const built: string[] = [];
            for (let surahId = descriptor.startSurahId; surahId <= descriptor.endSurahId; surahId += 1) {
              const chapterKeys = await getChapterVerseKeysCached(surahId);
              if (chapterKeys.length === 0) continue;

              const startIndex =
                surahId === descriptor.startSurahId ? descriptor.startVerseNumber - 1 : 0;
              const endIndex =
                surahId === descriptor.endSurahId
                  ? descriptor.endVerseNumber - 1
                  : chapterKeys.length - 1;

              const safeStart = Math.max(0, Math.min(chapterKeys.length, startIndex));
              const safeEnd = Math.max(0, Math.min(chapterKeys.length - 1, endIndex));
              if (safeStart >= chapterKeys.length) continue;
              if (safeEnd < safeStart) continue;

              built.push(...chapterKeys.slice(safeStart, safeEnd + 1));
            }
            verseKeys = built;
            rangeQueueCacheRef.current.set(descriptorKey, verseKeys);
          }
        }

        if (sessionIdRef.current !== sessionId) return;

        setQueueKey(descriptorKey);
        setQueueVerseKeys(verseKeys);
        setQueueIndex(verseKeys.indexOf(verseKey));
      } catch (e) {
        logger.warn('Failed to build verse queue', { descriptorKey }, e as Error);
        if (sessionIdRef.current !== sessionId) return;
        setQueueKey(descriptorKey);
        setQueueVerseKeys([]);
        setQueueIndex(-1);
      }
    },
    []
  );

  const playVerse = React.useCallback(
    (verseKey: string) => {
      const normalized = verseKey.trim();
      if (!normalized) return;

      const parsed = parseVerseKeyNumbers(normalized);
      if (!parsed) {
        setError('Invalid verse key');
        return;
      }
      const chapterId = parsed.surahId;

      const sessionId = sessionIdRef.current + 1;
      sessionIdRef.current = sessionId;
      setIsVisible(true);
      setError(null);
      setIsLoading(true);
      setActiveVerseKey(normalized);
      setSegmentStartSec(0);
      setSegmentEndSec(0);
      wasAtEndRef.current = false;

      const currentRepeatOptions = repeatOptionsRef.current;
      const descriptor: QueueDescriptor = (() => {
        if (currentRepeatOptions.mode === 'range') {
          const range = deriveRepeatRange(currentRepeatOptions);
          if (range) {
            const inRange =
              compareVerseKeys(normalized, range.startKey) >= 0 &&
              compareVerseKeys(normalized, range.endKey) <= 0;
            if (inRange) {
              return {
                kind: 'range',
                startSurahId: range.startSurahId,
                startVerseNumber: range.startVerseNumber,
                endSurahId: range.endSurahId,
                endVerseNumber: range.endVerseNumber,
              };
            }
          }
        }
        return { kind: 'chapter', chapterId };
      })();

      const desiredQueueKey = getQueueDescriptorKey(descriptor);
      if (queueKey === desiredQueueKey && queueVerseKeys.length > 0) {
        setQueueIndex(queueVerseKeys.indexOf(normalized));
        return;
      }

      setQueueKey(desiredQueueKey);
      setQueueVerseKeys([]);
      setQueueIndex(-1);
      void ensureQueueAsync({ descriptor, verseKey: normalized, sessionId });
    },
    [ensureQueueAsync, queueKey, queueVerseKeys]
  );

  const closePlayer = React.useCallback(() => {
    sessionIdRef.current += 1;
    setIsVisible(false);
    setIsLoading(false);
    setError(null);
    setActiveVerseKey(null);
    setQueueVerseKeys([]);
    setQueueIndex(-1);
    setQueueKey(null);
    setSegmentStartSec(0);
    setSegmentEndSec(0);
    audioSourceRef.current = null;
    wasAtEndRef.current = false;

    try {
      player.pause();
    } catch (e) {
      logger.warn('Failed to pause audio', undefined, e as Error);
    }

    try {
      player.replace(null);
    } catch (e) {
      logger.warn('Failed to unload audio source', undefined, e as Error);
    }

    clearPlayerLockScreenControls(player);
    lockScreenActiveRef.current = false;
  }, [player]);

  const nextVerse = React.useCallback((): boolean => {
    if (!activeVerseKey) return false;
    if (queueIndex < 0 || queueIndex >= queueVerseKeys.length - 1) {
      try {
        player.pause();
      } catch {
        // ignore
      }
      return false;
    }

    const nextKey = queueVerseKeys[queueIndex + 1];
    if (!nextKey) return false;
    playVerse(nextKey);
    return true;
  }, [activeVerseKey, playVerse, player, queueIndex, queueVerseKeys]);

  const prevVerse = React.useCallback((): boolean => {
    if (!activeVerseKey) return false;
    if (queueIndex <= 0 || queueIndex >= queueVerseKeys.length) {
      try {
        player.pause();
      } catch {
        // ignore
      }
      return false;
    }

    const prevKey = queueVerseKeys[queueIndex - 1];
    if (!prevKey) return false;
    playVerse(prevKey);
    return true;
  }, [activeVerseKey, playVerse, player, queueIndex, queueVerseKeys]);

  const togglePlay = React.useCallback(() => {
    if (!isVisible || !activeVerseKey) return;

    if (isPlaying) {
      try {
        player.pause();
      } catch (e) {
        logger.warn('Failed to pause audio', undefined, e as Error);
      }
      return;
    }

    if (segmentEndSec > segmentStartSec && status.currentTime >= segmentEndSec - 0.05) {
      playVerse(activeVerseKey);
      return;
    }

    try {
      player.play();
    } catch (e) {
      logger.warn('Failed to play audio', undefined, e as Error);
    }
  }, [
    activeVerseKey,
    isPlaying,
    isVisible,
    player,
    playVerse,
    segmentEndSec,
    segmentStartSec,
    status.currentTime,
  ]);

  const seekRelative = React.useCallback(
    (sec: number) => {
      if (!isVisible) return;
      if (!segmentEndSec || segmentEndSec <= segmentStartSec) return;

      const duration = Math.max(0, segmentEndSec - segmentStartSec);
      const target = segmentStartSec + clampNumber(sec, 0, duration);

      void player.seekTo(target).catch((e) => {
        logger.warn('Failed to seek audio', { target }, e as Error);
      });
    },
    [isVisible, player, segmentEndSec, segmentStartSec]
  );

  const setReciter = React.useCallback(
    (next: Reciter) => {
      const normalized = normalizeReciter(next);
      setReciterState(normalized);
      if (activeVerseKey) {
        playVerse(activeVerseKey);
      }
    },
    [activeVerseKey, playVerse]
  );

  const setVolume = React.useCallback((next: number) => {
    setVolumeState(normalizeVolume(next));
  }, []);

  const setPlaybackRate = React.useCallback((next: number) => {
    setPlaybackRateState(normalizePlaybackRate(next));
  }, []);

  const setRepeatOptions = React.useCallback((next: RepeatOptions) => {
    const normalized = normalizeRepeatOptions(next);
    repeatOptionsRef.current = normalized;
    setRepeatOptionsState(normalized);
  }, []);

  useEffect(() => {
    if (!activeVerseKey || !isVisible) return;
    if (audioFileError) {
      setError(audioFileError.message || 'Unable to load audio');
      setIsLoading(false);
    }
  }, [activeVerseKey, audioFileError, isVisible]);

  useEffect(() => {
    if (!activeVerseKey || !isVisible) return;
    if (!audioFile) return;

    const sessionId = sessionIdRef.current;
    const verseKey = activeVerseKey;
    const remoteSource = audioFile.audioUrl;

    const timing = audioFile.verseTimings.find((t) => t.verseKey === verseKey);
    if (!timing) {
      setError('Unable to load audio timing for this verse');
      setIsLoading(false);
      return;
    }

    const startSec = timing.timestampFrom / 1000;
    const endSec = timing.timestampTo / 1000;
    if (!(endSec > startSec)) {
      setError('Invalid audio segment timing');
      setIsLoading(false);
      return;
    }

    setSegmentStartSec(startSec);
    setSegmentEndSec(endSec);

    let cancelled = false;

    async function startPlayback(): Promise<void> {
      const startAt = Date.now();

      let resolvedSource = remoteSource;
      const surahId = activeChapterId ?? parseChapterIdFromVerseKey(verseKey);

      if (surahId) {
        try {
          const store = new AudioFileStore({ reciterId: reciter.id, surahId });
          if (await store.isDownloaded()) {
            resolvedSource = store.getLocalUri();
          }
        } catch (e) {
          logger.warn('Failed to resolve local audio source', { reciterId: reciter.id, surahId }, e as Error);
        }
      }

      if (cancelled) return;
      if (sessionIdRef.current !== sessionId) return;

      if (audioSourceRef.current !== resolvedSource) {
        audioSourceRef.current = resolvedSource;
        try {
          player.replace(resolvedSource);
        } catch (e) {
          logger.error('Failed to replace audio source', { src: resolvedSource }, e as Error);
          setError('Unable to load audio source');
          setIsLoading(false);
          return;
        }
      }

      while (!player.isLoaded) {
        if (cancelled) return;
        if (sessionIdRef.current !== sessionId) return;
        if (Date.now() - startAt > MAX_PLAYER_LOAD_WAIT_MS) {
          setError('Timed out loading audio');
          setIsLoading(false);
          return;
        }
        await delay(100);
      }

      if (cancelled) return;
      if (sessionIdRef.current !== sessionId) return;

      try {
        await player.seekTo(startSec);
      } catch (e) {
        logger.warn('Failed to seek to segment start', { startSec }, e as Error);
      }

      if (cancelled) return;
      if (sessionIdRef.current !== sessionId) return;

      try {
        player.play();
      } catch (e) {
        logger.error('Failed to play audio', { verseKey }, e as Error);
        setError('Unable to play audio');
      } finally {
        setIsLoading(false);
      }
    }

    void startPlayback();
    return () => {
      cancelled = true;
    };
  }, [activeChapterId, activeVerseKey, audioFile, isVisible, player, reciter.id]);

  const durationSec = useMemo(
    () => Math.max(0, segmentEndSec - segmentStartSec),
    [segmentEndSec, segmentStartSec]
  );
  const positionSec = useMemo(() => {
    if (!durationSec) return 0;
    const relative = status.currentTime - segmentStartSec;
    return clampNumber(relative, 0, durationSec);
  }, [durationSec, segmentStartSec, status.currentTime]);

  const restartCurrentVerseWithDelay = React.useCallback(
    (delayMs: number) => {
      const sessionId = sessionIdRef.current;
      const run = async (): Promise<void> => {
        if (sessionIdRef.current !== sessionId) return;
        try {
          await player.seekTo(segmentStartSec);
        } catch (e) {
          logger.warn('Failed to restart verse', { segmentStartSec }, e as Error);
        }
        if (sessionIdRef.current !== sessionId) return;
        try {
          player.play();
        } catch (e) {
          logger.warn('Failed to resume audio', undefined, e as Error);
        }
      };

      if (delayMs > 0) {
        try {
          player.pause();
        } catch {
          // ignore pause errors
        }
        setTimeout(() => {
          void run();
        }, delayMs);
        return;
      }

      void run();
    },
    [player, segmentStartSec]
  );

  const restartAtVerseKeyWithDelay = React.useCallback(
    (verseKey: string, delayMs: number) => {
      const normalized = verseKey.trim();
      if (!normalized) return;
      const sessionId = sessionIdRef.current;

      if (delayMs > 0) {
        try {
          player.pause();
        } catch {
          // ignore pause errors
        }
        setTimeout(() => {
          if (sessionIdRef.current !== sessionId) return;
          playVerse(normalized);
        }, delayMs);
        return;
      }

      playVerse(normalized);
    },
    [playVerse, player]
  );

  const handlePlaybackCompletion = React.useCallback(() => {
    const repeatEach = repeatOptions.repeatEach ?? 1;
    const delayMs = (repeatOptions.delay ?? 0) * 1000;

    const pausePlayback = (): void => {
      try {
        player.pause();
      } catch {
        // ignore pause errors
      }
    };

    if (repeatOptions.mode === 'single') {
      if (verseRepeatsLeft > 1) {
        setVerseRepeatsLeft(verseRepeatsLeft - 1);
        restartCurrentVerseWithDelay(delayMs);
        return;
      }
      if (playRepeatsLeft > 1) {
        setPlayRepeatsLeft(playRepeatsLeft - 1);
        setVerseRepeatsLeft(repeatEach);
        restartCurrentVerseWithDelay(delayMs);
        return;
      }
      // fall through to default behavior
    }

    if (repeatOptions.mode === 'range') {
      const rangeStartKey = deriveRepeatRange(repeatOptions)?.startKey ?? queueVerseKeys[0] ?? null;

      if (verseRepeatsLeft > 1) {
        setVerseRepeatsLeft(verseRepeatsLeft - 1);
        restartCurrentVerseWithDelay(delayMs);
        return;
      }

      setVerseRepeatsLeft(repeatEach);
      const hasAdvanced = nextVerse();
      if (hasAdvanced) return;

      if (playRepeatsLeft > 1 && rangeStartKey) {
        setPlayRepeatsLeft(playRepeatsLeft - 1);
        setVerseRepeatsLeft(repeatEach);
        restartAtVerseKeyWithDelay(rangeStartKey, delayMs);
        return;
      }
      // fall through to default behavior
    }

    if (repeatOptions.mode === 'surah') {
      const surahStartKey = queueVerseKeys[0] ?? (activeChapterId ? buildVerseKey(activeChapterId, 1) : null);

      if (verseRepeatsLeft > 1) {
        setVerseRepeatsLeft(verseRepeatsLeft - 1);
        restartCurrentVerseWithDelay(delayMs);
        return;
      }

      setVerseRepeatsLeft(repeatEach);
      const hasAdvanced = nextVerse();
      if (hasAdvanced) return;

      if (playRepeatsLeft > 1 && surahStartKey) {
        setPlayRepeatsLeft(playRepeatsLeft - 1);
        setVerseRepeatsLeft(repeatEach);
        restartAtVerseKeyWithDelay(surahStartKey, delayMs);
        return;
      }

      pausePlayback();
      return;
    }

    const hasAdvanced = nextVerse();
    if (!hasAdvanced) pausePlayback();
  }, [
    activeChapterId,
    nextVerse,
    playRepeatsLeft,
    player,
    queueVerseKeys,
    repeatOptions,
    restartAtVerseKeyWithDelay,
    restartCurrentVerseWithDelay,
    verseRepeatsLeft,
  ]);

  useEffect(() => {
    if (!isVisible || !activeVerseKey) {
      wasAtEndRef.current = false;
      return;
    }

    if (!isPlaying || durationSec <= 0) {
      wasAtEndRef.current = false;
      return;
    }

    const nearEnd = positionSec > 0 && positionSec >= durationSec - END_EPSILON_SEC;
    if (nearEnd && !wasAtEndRef.current) {
      wasAtEndRef.current = true;
      handlePlaybackCompletion();
      return;
    }

    if (!nearEnd) {
      wasAtEndRef.current = false;
    }
  }, [activeVerseKey, durationSec, handlePlaybackCompletion, isPlaying, isVisible, positionSec]);

  const contextValue = useMemo<AudioPlayerContextType>(
    () => ({
      isVisible,
      isLoading: Boolean(isLoading || (isVisible && isAudioFileLoading && !audioFile)),
      error,
      isPlaying,
      activeVerseKey,
      reciter,
      playbackRate,
      volume,
      repeatOptions,
      queueVerseKeys,
      queueIndex,
      segmentStartSec,
      segmentEndSec,
      positionSec,
      durationSec,
      playVerse,
      nextVerse,
      prevVerse,
      togglePlay,
      seekRelative,
      closePlayer,
      setReciter,
      setVolume,
      setPlaybackRate,
      setRepeatOptions,
    }),
    [
      activeVerseKey,
      audioFile,
      closePlayer,
      durationSec,
      error,
      isAudioFileLoading,
      isLoading,
      isPlaying,
      isVisible,
      nextVerse,
      playVerse,
      playbackRate,
      positionSec,
      prevVerse,
      queueIndex,
      queueVerseKeys,
      reciter,
      repeatOptions,
      seekRelative,
      segmentEndSec,
      segmentStartSec,
      setPlaybackRate,
      setRepeatOptions,
      setReciter,
      setVolume,
      togglePlay,
      volume,
    ]
  );

  return <AudioPlayerContext.Provider value={contextValue}>{children}</AudioPlayerContext.Provider>;
}

export function useAudioPlayer(): AudioPlayerContextType {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
