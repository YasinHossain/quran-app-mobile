const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('first-run language chooses a matching word language without downloading its pack', () => {
  const welcome = read('app/welcome.tsx');
  const wordLanguages = read('lib/i18n/wordLanguages.ts');

  assert.match(welcome, /wordLang: getPreferredWordLanguageForUiLanguage\(language\)/);
  assert.equal(
    (welcome.match(/showByWords: false/g) ?? []).length,
    2,
    'both successful and fallback onboarding must explicitly disable word-by-word'
  );
  assert.doesNotMatch(welcome, /DownloadWordTranslationUseCase/);
  assert.doesNotMatch(welcome, /wordLanguage:/);
  assert.match(wordLanguages, /getPreferredWordLanguageForUiLanguage/);
  assert.match(wordLanguages, /: 'en';/);
});

test('full-verse translation downloads do not receive a word-language argument', () => {
  const initialSetup = read('lib/onboarding/initialSetup.ts');
  const manageTranslations = read('components/reader/settings/ManageTranslationsPanel.tsx');

  assert.doesNotMatch(initialSetup, /wordLanguage\??:/);
  assert.match(initialSetup, /useCase\.execute\(translationId\)/);
  assert.match(manageTranslations, /useCase\.execute\(translationId\)/);
  assert.doesNotMatch(manageTranslations, /useCase\.execute\(translationId,\s*settings\.wordLang\)/);
});

test('turning on word-by-word requires the selected language pack', () => {
  const settings = read('components/reader/settings/SettingsSidebarContent.tsx');

  assert.match(settings, /handleShowByWordsChange/);
  assert.match(settings, /kind: 'word-translation'/);
  assert.match(settings, /download\?\.status === 'installed'/);
  assert.match(settings, /enableWordByWordAfterDownloadRef/);
  assert.match(settings, /updateShowByWords\(true\)/);
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

test('word-by-word availability fails closed and repairs only definitive unavailable states', () => {
  const exports = {};
  const source = ts.transpileModule(
    read('lib/reader/wordByWordAvailability.ts'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  vm.runInNewContext(source, { exports });

  const resolve = exports.resolveWordByWordAvailability;
  assert.deepEqual(
    { ...resolve({ requested: false, isLoading: false, hasIndexError: false }) },
    { effectiveEnabled: false, shouldDisablePersistedPreference: false }
  );
  assert.deepEqual(
    {
      ...resolve({
        requested: true,
        isLoading: false,
        hasIndexError: false,
        packStatus: 'installed',
      }),
    },
    { effectiveEnabled: true, shouldDisablePersistedPreference: false }
  );

  for (const packStatus of [undefined, 'queued', 'downloading', 'failed', 'deleting']) {
    assert.deepEqual(
      {
        ...resolve({
          requested: true,
          isLoading: false,
          hasIndexError: false,
          packStatus,
        }),
      },
      { effectiveEnabled: false, shouldDisablePersistedPreference: true },
      `status ${String(packStatus)} must render plain and repair the stale preference`
    );
  }

  for (const state of [
    { isLoading: true, hasIndexError: false },
    { isLoading: false, hasIndexError: true },
  ]) {
    assert.deepEqual(
      {
        ...resolve({
          requested: true,
          packStatus: 'installed',
          ...state,
        }),
      },
      { effectiveEnabled: false, shouldDisablePersistedPreference: false }
    );
  }
});

test('reader surfaces consume the effective word-by-word setting', () => {
  const readerPaths = [
    'app/surah/[surahId].tsx',
    'app/juz/[juzNumber].tsx',
    'app/page/[pageNumber].tsx',
    'app/tafsir/[surahId]/[ayahId].tsx',
    'app/(tabs)/bookmarks.tsx',
  ];

  for (const relativePath of readerPaths) {
    const source = read(relativePath);
    assert.match(source, /effectiveShowByWords/, `${relativePath} must use the availability gate`);
  }

  for (const relativePath of readerPaths.slice(0, 3)) {
    assert.doesNotMatch(
      read(relativePath),
      /settings\.showByWords/,
      `${relativePath} must not bypass the availability gate`
    );
  }
});
