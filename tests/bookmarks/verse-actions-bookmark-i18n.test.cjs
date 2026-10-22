const assert = require('node:assert/strict');
const test = require('node:test');

const en = require('../../locales/en/common.json');
const bn = require('../../locales/bn/common.json');
const ar = require('../../locales/ar/common.json');
const ur = require('../../locales/ur/common.json');
const hi = require('../../locales/hi/common.json');
const { localizeDigits } = require('../../lib/i18n/localizeNumbers.ts');

const REQUIRED_KEYS = [
  'pin_or_bookmark',
  'remove_bookmark',
  'add_to_collections',
  'surah_verse_key',
  'pin_verse',
  'add_to_folder',
  'pinned_verse_title',
  'pin_this_verse_title',
  'pinned_verse_description',
  'pin_this_verse_description',
  'pin_verse_action',
  'unpin_verse',
  'bookmarks_create_folder',
  'bookmarks_folder_name_placeholder',
  'bookmarks_no_folders_yet',
  'bookmarks_bookmark_count_single',
  'bookmarks_bookmark_count_plural',
  'close',
];

const LOCALES = { en, bn, ar, ur, hi };

test('All verse action and bookmark modal keys exist and are non-empty across all locales', () => {
  for (const [lang, dict] of Object.entries(LOCALES)) {
    for (const key of REQUIRED_KEYS) {
      assert.ok(
        typeof dict[key] === 'string' && dict[key].trim().length > 0,
        `Expected key "${key}" to exist and be non-empty in locale "${lang}"`
      );
    }
  }
});

test('Bangla translations for verse actions and bookmark modal match expected copy', () => {
  assert.equal(bn.pin_or_bookmark, 'পিন বা বুকমার্ক');
  assert.equal(bn.add_to_collections, 'সংগ্রহে যোগ করুন');
  assert.equal(bn.pin_verse, 'আয়াত পিন করুন');
  assert.equal(bn.add_to_folder, 'ফোল্ডারে যোগ করুন');
  assert.equal(bn.pinned_verse_title, 'আয়াত পিন করা হয়েছে');
  assert.equal(bn.pin_this_verse_title, 'এই আয়াতটি পিন করুন');
  assert.equal(bn.pin_verse_action, 'পিন করুন');
  assert.equal(bn.unpin_verse, 'পিন সরান');
  assert.equal(bn.bookmarks_create_folder, 'ফোল্ডার তৈরি করুন');
  assert.equal(bn.bookmarks_folder_name_placeholder, 'ফোল্ডারের নাম');
  assert.equal(bn.bookmarks_no_folders_yet, 'এখনও কোনো ফোল্ডার নেই। শুরু করতে একটি তৈরি করুন!');
});

test('Verse key digits are localized correctly in Bangla and Arabic', () => {
  assert.equal(localizeDigits('2:255', 'bn'), '২:২৫৫');
  assert.equal(localizeDigits('114:6', 'bn'), '১১৪:৬');
  assert.equal(localizeDigits('1:1', 'en'), '1:1');
  assert.equal(localizeDigits('2:255', 'ar'), '٢:٢٥٥');
});
