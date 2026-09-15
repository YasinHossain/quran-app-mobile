import assert from 'node:assert/strict';
import test from 'node:test';

import { selectNativeWordWindowVerseNumbers } from '../../lib/surah/nativeWordWindow.js';

test('keeps the nearest complete verses within the native word budget', () => {
  const selected = selectNativeWordWindowVerseNumbers(
    [
      { verseNumber: 98, wordCount: 120 },
      { verseNumber: 99, wordCount: 80 },
      { verseNumber: 100, wordCount: 100 },
      { verseNumber: 101, wordCount: 90 },
      { verseNumber: 102, wordCount: 70 },
    ],
    100,
    300
  );

  assert.deepEqual(selected, [99, 100, 101]);
});

test('returns an ordered boundary window without exceeding the budget', () => {
  const candidates = Array.from({ length: 13 }, (_, index) => ({
    verseNumber: index + 1,
    wordCount: 35,
  }));
  const selected = selectNativeWordWindowVerseNumbers(candidates, 1, 400);

  assert.deepEqual(selected, Array.from({ length: 11 }, (_, index) => index + 1));
  assert.ok(selected.length * 35 <= 400);
});
