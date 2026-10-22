declare function require(id: string): any;

const assert = require('node:assert/strict') as {
  equal(actual: unknown, expected: unknown): void;
};
const test = require('node:test') as (name: string, callback: () => void) => void;

import {
  normalizeNumeralsToAscii,
  sanitizeNumeralInput,
} from '../../lib/search/numerals.js';

test('normalizes supported numeral scripts to the same ASCII number', () => {
  assert.equal(normalizeNumeralsToAscii('2'), '2');
  assert.equal(normalizeNumeralsToAscii('২'), '2');
  assert.equal(normalizeNumeralsToAscii('٢'), '2');
  assert.equal(normalizeNumeralsToAscii('۲'), '2');
  assert.equal(normalizeNumeralsToAscii('२'), '2');
  assert.equal(normalizeNumeralsToAscii('সূরা ১২'), 'সূরা 12');
});

test('numeric selector input retains supported scripts and removes other characters', () => {
  assert.equal(sanitizeNumeralInput('2২٢۲२'), '2২٢۲२');
  assert.equal(sanitizeNumeralInput('verse 2:২৫'), '2২৫');
});
