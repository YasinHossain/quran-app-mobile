const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('initial UI languages use the product-defined translation defaults', () => {
  const defaults = require(path.join(root, 'src/data/initial-language-defaults.json'));
  assert.deepEqual(defaults, { en: 20, bn: 161, hi: 122, ur: 54, ar: null });
});

test('bundled Saheeh International contains every unique Quran verse address', () => {
  const payload = require(
    path.join(root, 'dist/translation-packs/translations/20/2026-04-23/payload.json')
  );
  assert.equal(payload.translationId, 20);
  assert.equal(payload.format, 'translation-json-v1');
  assert.equal(payload.verses.length, 6236);

  const keys = new Set();
  for (const verse of payload.verses) {
    assert.equal(verse.verseKey, `${verse.surahId}:${verse.ayahNumber}`);
    assert.ok(verse.arabicUthmani.trim());
    assert.ok(verse.text.trim());
    assert.equal(keys.has(verse.verseKey), false, `duplicate verse ${verse.verseKey}`);
    keys.add(verse.verseKey);
  }
  assert.equal(keys.size, 6236);
});

test('the legacy Unicode mushaf is neither bundled nor selectable', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'src/data/mushaf/packs/unicode-uthmani-v1/payload.json')),
    false
  );
  const optionsSource = fs.readFileSync(path.join(root, 'data/mushaf/options.ts'), 'utf8');
  assert.equal(optionsSource.includes('unicode-uthmani-v1'), false);
});
