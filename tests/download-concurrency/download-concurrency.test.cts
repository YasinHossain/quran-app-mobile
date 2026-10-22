declare function require(id: string): any;

const assert = require('node:assert/strict') as {
  equal(actual: unknown, expected: unknown, message?: string): void;
  rejects(callback: () => Promise<unknown>, expected?: RegExp): Promise<void>;
};
const test = require('node:test') as (
  name: string,
  callback: () => void | Promise<void>
) => void;

import {
  DownloadConcurrencyLimiter,
  mapWithConcurrency,
} from '../../src/core/infrastructure/downloads/downloadConcurrency';

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

test('shared limiter never runs more than five downloads at once', async () => {
  const limiter = new DownloadConcurrencyLimiter(5);
  let active = 0;
  let maximumActive = 0;

  await Promise.all(
    Array.from({ length: 18 }, (_, index) =>
      limiter.run(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await pause(3 + (index % 3));
        active -= 1;
      })
    )
  );

  assert.equal(maximumActive, 5);
  assert.equal(limiter.activeDownloads, 0);
  assert.equal(limiter.queuedDownloads, 0);
});

test('a canceled queued download never reaches the native task', async () => {
  const limiter = new DownloadConcurrencyLimiter(1);
  let releaseFirst: (() => void) | undefined;
  const first = limiter.run(
    () => new Promise<void>((resolve) => {
      releaseFirst = resolve;
    })
  );
  await pause(0);

  let secondStarted = false;
  const controller = new AbortController();
  const second = limiter.run(async () => {
    secondStarted = true;
  }, controller.signal);
  controller.abort();

  await assert.rejects(() => second, /Download canceled/);
  assert.equal(secondStarted, false);
  releaseFirst?.();
  await first;
});

test('bounded mapper completes every item with the requested concurrency', async () => {
  let active = 0;
  let maximumActive = 0;
  let completed = 0;

  await mapWithConcurrency(Array.from({ length: 13 }, (_, index) => index), 5, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await pause(2);
    active -= 1;
    completed += 1;
  });

  assert.equal(maximumActive, 5);
  assert.equal(completed, 13);
});
