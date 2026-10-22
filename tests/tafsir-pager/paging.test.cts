import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTafsirSnapIndex as snap } from '../../lib/tafsir/paging.js';

test('short flicks advance in either direction', () => {
  assert.equal(snap(400, 418, 0.3, 400, 10), 2);
  assert.equal(snap(400, 382, -0.3, 400, 10), 0);
});
test('deliberate slow drags advance but incidental movement returns', () => {
  assert.equal(snap(400, 455, 0, 400, 10), 2);
  assert.equal(snap(400, 345, 0, 400, 10), 0);
  assert.equal(snap(400, 420, 0, 400, 10), 1);
});
test('release direction allows reversing a swipe', () => {
  assert.equal(snap(400, 490, -0.4, 400, 10), 0);
});
test('flings cannot skip pages or go beyond Quran boundaries', () => {
  assert.equal(snap(400, 490, 8, 400, 10), 2);
  assert.equal(snap(0, 0, -1, 400, 10), 0);
  assert.equal(snap(3600, 3600, 1, 400, 10), 9);
  assert.equal(snap(0, 20, 1, 400, 1), 0);
});
test('interrupted transitions use the nearest visible page', () => {
  assert.equal(snap(710, 760, 0.4, 400, 10), 3);
  assert.equal(snap(510, 460, -0.4, 400, 10), 0);
});
