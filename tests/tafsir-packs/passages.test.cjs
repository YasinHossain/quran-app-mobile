const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildPassagePayload } = require('../../scripts/generate-tafsir-packs.js');

function verses(entries) {
  return Object.entries(entries).map(([verseKey, html]) => ({ verseKey, html }));
}

function htmlOf(payload) {
  return Object.fromEntries(payload.verses.map((verse) => [verse.verseKey, verse.html]));
}

function range(surah, from, to) {
  return Array.from({ length: to - from + 1 }, (_value, index) => `${surah}:${from + index}`);
}

test('a passage with its text on the first verse covers the following blank verses', () => {
  const payload = buildPassagePayload({
    tafsirId: 169,
    verses: verses({ '2:7': 'seven', '2:8': 'eight and nine', '2:9': '', '2:10': 'ten' }),
    groups: [{ queriedVerseKey: '2:9', verseKeys: ['2:8', '2:9'], text: 'eight and nine' }],
  });

  assert.deepEqual(payload.passages, [{ startVerseKey: '2:8', endVerseKey: '2:9' }]);
  assert.deepEqual(htmlOf(payload), { '2:7': 'seven', '2:8': 'eight and nine', '2:9': '', '2:10': 'ten' });
});

test('text kept on the last verse of a passage is moved to its first verse', () => {
  const payload = buildPassagePayload({
    tafsirId: 381,
    verses: verses({ '2:3': '', '2:4': '', '2:5': 'verses 3-5' }),
    // This API returns the (empty) first-verse text for the whole passage.
    groups: [{ queriedVerseKey: '2:3', verseKeys: ['2:3', '2:4', '2:5'], text: '' }],
  });

  assert.deepEqual(payload.passages, [{ startVerseKey: '2:3', endVerseKey: '2:5' }]);
  assert.deepEqual(htmlOf(payload), { '2:3': 'verses 3-5', '2:4': '', '2:5': '' });
});

test('a passage longer than the API verse list is rebuilt from every verse returning it', () => {
  const listed = range(3, 35, 44);
  const chapter = Object.fromEntries(range(3, 35, 60).map((verseKey) => [verseKey, '']));
  chapter['3:60'] = 'verses 35-60';
  chapter['3:61'] = 'verse 61';

  const payload = buildPassagePayload({
    tafsirId: 381,
    verses: verses(chapter),
    groups: [
      ...range(3, 35, 60).map((verseKey) => ({ queriedVerseKey: verseKey, verseKeys: listed, text: '' })),
      { queriedVerseKey: '3:61', verseKeys: ['3:61'], text: 'verse 61' },
    ],
  });

  assert.deepEqual(payload.passages, [{ startVerseKey: '3:35', endVerseKey: '3:60' }]);
  assert.equal(htmlOf(payload)['3:35'], 'verses 35-60');
  assert.equal(htmlOf(payload)['3:60'], '');
});

test('verses the API joins from the next surah are left without commentary', () => {
  const payload = buildPassagePayload({
    tafsirId: 168,
    verses: verses({ '14:51': 'verses 51-52', '14:52': '', '15:1': '', '15:2': '', '15:3': 'three' }),
    groups: [
      {
        queriedVerseKey: '15:1',
        verseKeys: ['14:51', '14:52', '15:1', '15:2'],
        text: 'verses 51-52',
      },
    ],
  });

  assert.deepEqual(payload.passages, [{ startVerseKey: '14:51', endVerseKey: '14:52' }]);
  assert.equal(payload.droppedCrossSurahVerses, 2);
  assert.equal(htmlOf(payload)['15:1'], '');
});

test('groups that cannot be attributed safely produce no passage', () => {
  const payload = buildPassagePayload({
    tafsirId: 169,
    verses: verses({
      '1:1': '',
      '1:2': '',
      '2:1': 'one',
      '2:2': '',
      '2:3': 'three',
      '2:4': '',
      '3:1': 'stored one',
      '3:2': '',
    }),
    groups: [
      { queriedVerseKey: '1:1', verseKeys: ['1:1', '1:2'], text: '' },
      { queriedVerseKey: '2:2', verseKeys: ['2:1', '2:2', '2:3', '2:4'], text: 'one' },
      { queriedVerseKey: '3:2', verseKeys: ['3:1', '3:2'], text: 'a different text' },
    ],
  });

  assert.deepEqual(payload.passages, []);
  assert.equal(payload.issues.length, 2);
});

test('trailing-text tafsirs join blank verses to the next verse with text in the same surah', () => {
  const payload = buildPassagePayload({
    tafsirId: 170,
    verses: verses({
      '110:3': 'surah 110',
      '111:1': '',
      '111:2': '',
      '111:3': 'surah 111',
      '112:1': 'one',
      '112:2': '',
      '112:3': 'two and three',
    }),
    groups: [],
  });

  assert.deepEqual(payload.passages, [
    { startVerseKey: '111:1', endVerseKey: '111:3' },
    { startVerseKey: '112:2', endVerseKey: '112:3' },
  ]);
  assert.deepEqual(htmlOf(payload), {
    '110:3': 'surah 110',
    '111:1': 'surah 111',
    '111:2': '',
    '111:3': '',
    '112:1': 'one',
    '112:2': 'two and three',
    '112:3': '',
  });
});
