const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

function source(path) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('download confirmations use bundled size metadata without a loading phase', () => {
  const translations = source('components/reader/settings/ManageTranslationsPanel.tsx');
  const tafsirs = source('components/reader/settings/ManageTafsirsPanel.tsx');
  const settings = source('components/reader/settings/SettingsSidebarContent.tsx');
  const modal = source('components/reader/settings/resource-panel/ResourceConfirmModal.tsx');
  const metadata = source(
    'src/core/infrastructure/offline-packs/bundledDownloadMetadata.ts'
  );

  assert.match(translations, /getBundledTranslationDownloadSizeBytes/);
  assert.match(tafsirs, /getBundledTafsirDownloadSizeBytes/);
  assert.match(settings, /getBundledMushafDownloadSizeBytes/);
  assert.match(settings, /getBundledWordTranslationDownloadSizeBytes/);
  assert.match(metadata, /dist\/translation-packs\/catalog\.json/);
  assert.match(metadata, /dist\/word-translation-packs\/catalog\.json/);

  for (const file of [translations, tafsirs, settings, modal]) {
    assert.doesNotMatch(file, /Estimating size|Loading download size|isDetailLoading/);
  }
});

test('Word Study download cards start from the bundled release catalogs', () => {
  const manager = source('app/manage-word-study.tsx');
  const essentials = source(
    'components/word-study/full-study/CoreStudyPackDownloadPanel.tsx'
  );
  const grammar = source(
    'components/word-study/full-study/GrammarPackDownloadPanel.tsx'
  );
  const dictionaryPanel = source(
    'components/word-study/full-study/DictionaryPackDownloadPanel.tsx'
  );
  const dictionarySection = source(
    'components/word-study/full-study/DictionarySection.tsx'
  );

  assert.match(manager, /coreCatalog: getBundledWordStudyPacks\(\)/);
  assert.match(manager, /grammarCatalog: getBundledWordGrammarPacks\(\)/);
  assert.match(manager, /dictionaryCatalog: getBundledWordReferencePacks\(\)/);
  assert.match(essentials, /BUNDLED_ENTRY = getBundledWordStudyPacks\(\)/);
  assert.match(grammar, /BUNDLED_ENTRY = getBundledWordGrammarPacks\(\)/);
  assert.match(dictionaryPanel, /BUNDLED_ENTRIES = getBundledWordReferencePacks\(\)/);
  assert.match(dictionarySection, /BUNDLED_DICTIONARY_ENTRIES = getBundledWordReferencePacks\(\)/);

  for (const file of [manager, essentials, grammar, dictionaryPanel, dictionarySection]) {
    assert.doesNotMatch(file, /listCompatiblePacksAsync|Checking availability|Checking download/);
  }
  assert.doesNotMatch(manager, /ActivityIndicator|state\.loading/);
});
