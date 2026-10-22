export const MAX_CONCURRENT_DOWNLOADS = 5;

type PendingDownload<T> = {
  readonly task: () => Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
  readonly signal?: AbortSignal | undefined;
  abortListener?: (() => void) | undefined;
};

function downloadCanceledError(): Error {
  return new Error('Download canceled');
}

/**
 * Process-wide guard for native file downloads. Expo's native downloader can
 * fail at the bridge boundary when too many calls start together, so every
 * downloadable resource type shares this limiter.
 */
export class DownloadConcurrencyLimiter {
  private activeCount = 0;
  private readonly pending: PendingDownload<unknown>[] = [];

  constructor(readonly maxConcurrent = MAX_CONCURRENT_DOWNLOADS) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be a positive integer');
    }
  }

  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(downloadCanceledError());

    return new Promise<T>((resolve, reject) => {
      const pending: PendingDownload<T> = { task, resolve, reject, signal };

      if (signal) {
        pending.abortListener = () => {
          const index = this.pending.indexOf(pending as PendingDownload<unknown>);
          if (index < 0) return;
          this.pending.splice(index, 1);
          reject(downloadCanceledError());
        };
        signal.addEventListener('abort', pending.abortListener, { once: true });
      }

      this.pending.push(pending as PendingDownload<unknown>);
      this.drain();
    });
  }

  get activeDownloads(): number {
    return this.activeCount;
  }

  get queuedDownloads(): number {
    return this.pending.length;
  }

  private drain(): void {
    while (this.activeCount < this.maxConcurrent && this.pending.length > 0) {
      const pending = this.pending.shift();
      if (!pending) return;

      if (pending.abortListener) {
        pending.signal?.removeEventListener('abort', pending.abortListener);
      }
      if (pending.signal?.aborted) {
        pending.reject(downloadCanceledError());
        continue;
      }

      this.activeCount += 1;
      void pending
        .task()
        .then(pending.resolve, pending.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.drain();
        });
    }
  }
}

export const downloadConcurrencyLimiter = new DownloadConcurrencyLimiter();

export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  const workerCount = Math.min(Math.max(1, Math.trunc(concurrency)), items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index] as T, index);
    }
  });

  await Promise.all(workers);
}
