const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('first-run language chooses a matching word language without downloading its pack', () => {
  const welcome = read('app/welcome.tsx');
  const wordLanguages = read('lib/i18n/wordLanguages.ts');

  assert.match(welcome, /wordLang: getPreferredWordLanguageForUiLanguage\(language\)/);
  assert.doesNotMatch(welcome, /DownloadWordTranslationUseCase/);
  assert.match(wordLanguages, /getPreferredWordLanguageForUiLanguage/);
  assert.match(wordLanguages, /: 'en';/);
});

test('turning on word-by-word requires the selected language pack', () => {
  const settings = read('components/reader/settings/SettingsSidebarContent.tsx');

  assert.match(settings, /handleShowByWordsChange/);
  assert.match(settings, /kind: 'word-translation'/);
  assert.match(settings, /download\?\.status === 'installed'/);
  assert.match(settings, /enableWordByWordAfterDownloadRef/);
  assert.match(settings, /updateShowByWords\(true\)/);
  assert.match(settings, /Word Study Essentials remains a separate download/);
});

test('verse translation downloads do not also fetch word translations', () => {
  const repository = read(
    'src/core/infrastructure/repositories/QuranComTranslationDownloadRepository.ts'
  );

  assert.match(repository, /words: 'false'/);
  assert.doesNotMatch(repository, /word_translation_language:/);
  assert.doesNotMatch(repository, /word_fields:/);
});

test('offline readers select only the exact requested word-language row', () => {
  const paths = [
    'src/core/infrastructure/offline/TranslationOfflineStore.ts',
    'lib/surah/offlineSurahPageCache.ts',
    'lib/juz/offlineJuzPageCache.ts',
    'hooks/usePageVerses.ts',
  ];

  for (const relativePath of paths) {
    const source = read(relativePath);
    assert.doesNotMatch(
      source,
      /COALESCE\(wt\.words_json, v\.words_json\)/,
      `${relativePath} must not fall back to a different word language`
    );
  }

  const store = read(paths[0]);
  assert.match(store, /verses\.map\(\(verse\) => \(\{ \.\.\.verse, wordsJson: undefined \}\)\)/);

  const migrations = read('src/core/infrastructure/db/migrations.ts');
  assert.match(migrations, /version: 7/);
  assert.match(migrations, /UPDATE offline_verses\s+SET words_json = NULL/);
});
