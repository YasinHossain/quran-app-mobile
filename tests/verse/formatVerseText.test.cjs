const assert = require('node:assert/strict');
const test = require('node:test');

const { formatVerseText } = require('../../lib/verse/formatVerseText.ts');

test('formats verse with Surah name, verse key, and Arabic text', () => {
  const result = formatVerseText({
    surahName: 'Al-Fatihah',
    verseKey: '1:1',
    arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  });

  const expected = [
    'Al-Fatihah 1:1',
    '',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  ].join('\n');

  assert.equal(result, expected);
});

test('formats verse without Surah name using only verse key', () => {
  const result = formatVerseText({
    verseKey: '1:1',
    arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  });

  const expected = [
    '1:1',
    '',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  ].join('\n');

  assert.equal(result, expected);
});

test('formats single translation with translator name', () => {
  const result = formatVerseText({
    surahName: 'Al-Fatihah',
    verseKey: '1:1',
    arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    translationItems: [
      {
        resourceName: 'Saheeh International',
        text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      },
    ],
  });

  const expected = [
    'Al-Fatihah 1:1',
    '',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    '',
    'Saheeh International:',
    'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
  ].join('\n');

  assert.equal(result, expected);
});

test('formats multiple translations (e.g. 2 and 5) each with translator names', () => {
  const items = [
    {
      resourceName: 'Saheeh International',
      text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    },
    {
      resourceName: 'Dr. Mustafa Khattab',
      text: 'In the Name of Allah—the Most Compassionate, Most Merciful.',
    },
    {
      resourceName: 'Mufti Taqi Usmani',
      text: 'With the name of Allah, the All-Merciful, the Very-Merciful.',
    },
    {
      resourceName: 'Abdul Haleem',
      text: 'In the name of God, the Lord of Mercy, the Giver of Mercy!',
    },
    {
      resourceName: 'Yusuf Ali',
      text: 'In the name of Allah, Most Gracious, Most Merciful.',
    },
  ];

  const result = formatVerseText({
    surahName: 'Al-Fatihah',
    verseKey: '1:1',
    arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    translationItems: items,
  });

  const expected = [
    'Al-Fatihah 1:1',
    '',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    '',
    'Saheeh International:',
    'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    '',
    'Dr. Mustafa Khattab:',
    'In the Name of Allah—the Most Compassionate, Most Merciful.',
    '',
    'Mufti Taqi Usmani:',
    'With the name of Allah, the All-Merciful, the Very-Merciful.',
    '',
    'Abdul Haleem:',
    'In the name of God, the Lord of Mercy, the Giver of Mercy!',
    '',
    'Yusuf Ali:',
    'In the name of Allah, Most Gracious, Most Merciful.',
  ].join('\n');

  assert.equal(result, expected);
});

test('strips HTML tags from translation text', () => {
  const result = formatVerseText({
    verseKey: '2:1',
    arabicText: 'الٓمٓ',
    translationItems: [
      {
        resourceName: 'Dr. Mustafa Khattab',
        text: 'Alif-Lãm-Mĩm. <sup foot_note="123">1</sup>',
      },
    ],
  });

  const expected = [
    '2:1',
    '',
    'الٓمٓ',
    '',
    'Dr. Mustafa Khattab:',
    'Alif-Lãm-Mĩm. 1',
  ].join('\n');

  assert.equal(result, expected);
});

test('resolves translator name via translationsById map when item has resourceId', () => {
  const translationsById = new Map([
    [20, { name: 'Saheeh International' }],
  ]);

  const result = formatVerseText({
    verseKey: '1:1',
    arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    translationItems: [
      {
        resourceId: 20,
        text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      },
    ],
    translationsById,
  });

  const expected = [
    '1:1',
    '',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    '',
    'Saheeh International:',
    'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
  ].join('\n');

  assert.equal(result, expected);
});

test('falls back to translationTexts without translator names if items are not available', () => {
  const result = formatVerseText({
    verseKey: '1:1',
    arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    translationTexts: [
      'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      'In the Name of Allah—the Most Compassionate, Most Merciful.',
    ],
  });

  const expected = [
    '1:1',
    '',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    '',
    'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    '',
    'In the Name of Allah—the Most Compassionate, Most Merciful.',
  ].join('\n');

  assert.equal(result, expected);
});
