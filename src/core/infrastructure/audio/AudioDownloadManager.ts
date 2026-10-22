import type {
  AudioVerseRange,
  DownloadProgress,
  DownloadableContent,
  DownloadIndexItemWithKey,
} from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import type { IDownloadIndexRepository } from '@/src/core/domain/repositories/IDownloadIndexRepository';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { AudioFileStore } from './AudioFileStore';
import type { QdcAudioFile } from './qdcAudio';

type AudioDownloadContent = Extract<DownloadableContent, { kind: 'audio' }>;

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPercentProgress(percent: number): DownloadProgress {
  const normalized = clampNumber(Math.round(percent), 0, 100);
  return { kind: 'percent', percent: normalized };
}

function toAudioContent(params: {
  reciterId: number;
  surahId: number;
  startVerseNumber?: number;
  endVerseNumber?: number;
}): AudioDownloadContent {
  const hasStart = params.startVerseNumber !== undefined;
  const hasEnd = params.endVerseNumber !== undefined;
  if (hasStart !== hasEnd) {
    throw new Error('Audio verse range must include both a start and end verse');
  }

  const startVerseNumber = hasStart ? normalizeId(params.startVerseNumber!) : undefined;
  const endVerseNumber = hasEnd ? normalizeId(params.endVerseNumber!) : undefined;
  if (
    startVerseNumber !== undefined &&
    endVerseNumber !== undefined &&
    (startVerseNumber <= 0 || endVerseNumber < startVerseNumber)
  ) {
    throw new Error('Audio verse range is invalid');
  }

  return {
    kind: 'audio',
    reciterId: params.reciterId,
    scope: 'surah',
    surahId: params.surahId,
    ...(startVerseNumber !== undefined && endVerseNumber !== undefined
      ? { verseRanges: [{ startVerseNumber, endVerseNumber }] }
      : {}),
  };
}

function normalizeVerseRanges(ranges: readonly AudioVerseRange[]): AudioVerseRange[] {
  const sorted = ranges
    .map((range) => ({
      startVerseNumber: normalizeId(range.startVerseNumber),
      endVerseNumber: normalizeId(range.endVerseNumber),
    }))
    .filter(
      (range) =>
        range.startVerseNumber > 0 && range.endVerseNumber >= range.startVerseNumber
    )
    .sort(
      (left, right) =>
        left.startVerseNumber - right.startVerseNumber ||
        left.endVerseNumber - right.endVerseNumber
    );

  const merged: AudioVerseRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startVerseNumber > previous.endVerseNumber + 1) {
      merged.push({ ...range });
      continue;
    }
    previous.endVerseNumber = Math.max(previous.endVerseNumber, range.endVerseNumber);
  }
  return merged;
}

function mergeAudioSelection(
  existing: DownloadIndexItemWithKey | null,
  requested: AudioDownloadContent
): AudioDownloadContent {
  if (!requested.verseRanges) return requested;
  const existingRanges = (() => {
    if (existing?.content.kind !== 'audio') return [];
    if (existing.content.verseRanges) return existing.content.verseRanges;
    if (
      typeof existing.content.startVerseNumber === 'number' &&
      typeof existing.content.endVerseNumber === 'number'
    ) {
      return [
        {
          startVerseNumber: existing.content.startVerseNumber,
          endVerseNumber: existing.content.endVerseNumber,
        },
      ];
    }
    return [];
  })();
  const verseRanges = normalizeVerseRanges([...existingRanges, ...requested.verseRanges]);
  return { ...requested, verseRanges };
}

const AUDIO_DOWNLOAD_CANCELED_ERROR_CODE = 'audio_download_canceled';
const canceledAudioDownloadKeys = new Set<string>();
const activeAudioDownloadAbortControllers = new Map<string, AbortController>();

class AudioDownloadCanceledError extends Error {
  readonly code = AUDIO_DOWNLOAD_CANCELED_ERROR_CODE;

  constructor(readonly key: string) {
    super('Audio download canceled');
    this.name = 'AudioDownloadCanceledError';
  }
}

function isAudioDownloadCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { code?: unknown }).code === AUDIO_DOWNLOAD_CANCELED_ERROR_CODE) return true;
  return error.name === 'AudioDownloadCanceledError';
}

function throwIfAudioDownloadCanceled(key: string, signal?: AbortSignal): void {
  if (!signal?.aborted && !canceledAudioDownloadKeys.has(key)) return;
  throw new AudioDownloadCanceledError(key);
}

export class AudioDownloadManager {
  private readonly inFlightByKey = new Map<string, Promise<void>>();

  constructor(private readonly downloadIndexRepository: IDownloadIndexRepository) {}

  async isDownloaded(params: { reciterId: number; surahId: number }): Promise<boolean> {
    const reciterId = normalizeId(params.reciterId);
    const surahId = normalizeId(params.surahId);
    if (reciterId <= 0 || surahId <= 0) return false;
    return new AudioFileStore({ reciterId, surahId }).isDownloaded();
  }

  getLocalUri(params: { reciterId: number; surahId: number }): string {
    const reciterId = normalizeId(params.reciterId);
    const surahId = normalizeId(params.surahId);
    return new AudioFileStore({ reciterId, surahId }).getLocalUri();
  }

  async downloadSurahAudio(params: {
    reciterId: number;
    surahId: number;
    startVerseNumber?: number;
    endVerseNumber?: number;
    audioUrl: string;
    audioFile?: QdcAudioFile | undefined;
  }): Promise<void> {
    const reciterId = normalizeId(params.reciterId);
    const surahId = normalizeId(params.surahId);
    const audioUrl = params.audioUrl.trim();

    if (reciterId <= 0) throw new Error('reciterId must be a positive integer');
    if (surahId <= 0) throw new Error('surahId must be a positive integer');
    if (!audioUrl) throw new Error('audioUrl is required');

    const requestedContent = toAudioContent({
      reciterId,
      surahId,
      startVerseNumber: params.startVerseNumber,
      endVerseNumber: params.endVerseNumber,
    });
    const key = getDownloadKey(requestedContent);

    const existingPromise = this.inFlightByKey.get(key);
    if (existingPromise) return existingPromise;
    canceledAudioDownloadKeys.delete(key);

    const work = (async (): Promise<void> => {
      const store = new AudioFileStore({ reciterId, surahId });
      const alreadyInstalled = await store.isDownloaded();
      const existing = await this.downloadIndexRepository.get(requestedContent);
      const content = mergeAudioSelection(existing, requestedContent);

      if (existing?.status === 'deleting') return;

      if (alreadyInstalled) {
        if (params.audioFile) {
          await store.saveAudioFileMetadata(params.audioFile);
        }
        if (
          existing?.status === 'installed' &&
          existing.content.kind === 'audio' &&
          JSON.stringify(existing.content.verseRanges) === JSON.stringify(content.verseRanges)
        ) {
          return;
        }
        await this.downloadIndexRepository.upsert(content, {
          status: 'installed',
          progress: null,
          error: null,
        });
        return;
      }

      if (existing?.status === 'queued' || existing?.status === 'downloading') return;

      await this.downloadIndexRepository.upsert(content, {
        status: 'queued',
        progress: toPercentProgress(0),
        error: null,
      });

      await this.downloadIndexRepository.upsert(content, {
        status: 'downloading',
        progress: toPercentProgress(0),
        error: null,
      });

      let latestPercent = 0;
      let lastPersistedPercent = 0;
      let lastEnqueuedPercent = 0;
      let allowProgressEnqueue = true;

      let writeQueue: Promise<void> = Promise.resolve();
      const abortController = new AbortController();
      activeAudioDownloadAbortControllers.set(key, abortController);

      const enqueueProgressPersist = (percent: number): void => {
        if (!allowProgressEnqueue) return;
        const nextPercent = clampNumber(Math.round(percent), 0, 100);
        if (nextPercent === lastEnqueuedPercent) return;
        lastEnqueuedPercent = nextPercent;

        writeQueue = writeQueue
          .then(async () => {
            await this.downloadIndexRepository.upsert(content, {
              status: 'downloading',
              progress: toPercentProgress(nextPercent),
              error: null,
            });
            lastPersistedPercent = nextPercent;
          })
          .catch((error) => {
            logger.warn(
              'Failed to persist audio download progress',
              { reciterId, surahId, percent: nextPercent },
              error as Error
            );
          });
      };

      const intervalId = setInterval(() => {
        enqueueProgressPersist(latestPercent);
      }, 800);

      try {
        throwIfAudioDownloadCanceled(key, abortController.signal);
        await store.download(audioUrl, (progress) => {
          if (progress.percent === null) return;
          latestPercent = clampNumber(progress.percent, 0, 100);
        }, abortController.signal);
        if (params.audioFile) {
          await store.saveAudioFileMetadata(params.audioFile);
        }
        throwIfAudioDownloadCanceled(key, abortController.signal);

        clearInterval(intervalId);
        allowProgressEnqueue = false;
        await writeQueue;
        await this.downloadIndexRepository.upsert(content, {
          status: 'installed',
          progress: null,
          error: null,
        });
      } catch (error) {
        clearInterval(intervalId);
        allowProgressEnqueue = false;
        await writeQueue;

        if (
          isAudioDownloadCanceledError(error) ||
          abortController.signal.aborted ||
          canceledAudioDownloadKeys.has(key)
        ) {
          await this.downloadIndexRepository.remove(content);
          try {
            await store.delete();
          } catch (cleanupError) {
            logger.warn(
              'Failed to clean up audio file after cancellation',
              { reciterId, surahId },
              cleanupError as Error
            );
          }
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        await this.downloadIndexRepository.upsert(content, {
          status: 'failed',
          progress: toPercentProgress(lastPersistedPercent),
          error: message,
        });

        try {
          await store.delete();
        } catch (cleanupError) {
          logger.warn(
            'Failed to clean up audio file after download failure',
            { reciterId, surahId },
            cleanupError as Error
          );
        }

        throw error;
      } finally {
        activeAudioDownloadAbortControllers.delete(key);
        canceledAudioDownloadKeys.delete(key);
      }
    })().finally(() => {
      this.inFlightByKey.delete(key);
    });

    this.inFlightByKey.set(key, work);
    return work;
  }

  async cancelSurahAudioDownload(params: { reciterId: number; surahId: number }): Promise<void> {
    const reciterId = normalizeId(params.reciterId);
    const surahId = normalizeId(params.surahId);

    if (reciterId <= 0 || surahId <= 0) return;

    const content = toAudioContent({ reciterId, surahId });
    const key = getDownloadKey(content);
    canceledAudioDownloadKeys.add(key);
    activeAudioDownloadAbortControllers.get(key)?.abort();
    await this.downloadIndexRepository.remove(content);
  }

  async deleteSurahAudio(params: { reciterId: number; surahId: number }): Promise<void> {
    const reciterId = normalizeId(params.reciterId);
    const surahId = normalizeId(params.surahId);

    if (reciterId <= 0) throw new Error('reciterId must be a positive integer');
    if (surahId <= 0) throw new Error('surahId must be a positive integer');

    const content = toAudioContent({ reciterId, surahId });
    const key = getDownloadKey(content);

    const existingPromise = this.inFlightByKey.get(key);
    if (existingPromise) return existingPromise;

    const work = (async (): Promise<void> => {
      const existing = await this.downloadIndexRepository.get(content);
      if (existing?.status === 'queued' || existing?.status === 'downloading') return;

      const store = new AudioFileStore({ reciterId, surahId });

      await this.downloadIndexRepository.upsert(content, {
        status: 'deleting',
        progress: null,
        error: null,
      });

      try {
        await store.delete();
        await this.downloadIndexRepository.remove(content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to delete audio download', { reciterId, surahId }, error as Error);

        await this.downloadIndexRepository.upsert(content, {
          status: 'failed',
          progress: null,
          error: message,
        });

        throw error;
      }
    })().finally(() => {
      this.inFlightByKey.delete(key);
    });

    this.inFlightByKey.set(key, work);
    return work;
  }
}
