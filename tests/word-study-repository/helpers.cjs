const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '../..');
const PACK_PATH = path.join(
  ROOT,
  'dist/word-study-packs/qac-v0.4/quran-word-study.db'
);
const MANIFEST_PATH = path.join(ROOT, 'dist/word-study-packs/qac-v0.4/manifest.json');
const GRAMMAR_PACK_PATH = path.join(
  ROOT,
  'dist/word-grammar-packs/qac-irab-v1.4/quran-word-grammar.db'
);
const VERB_REFERENCE_PACK_PATH = path.join(
  ROOT,
  'dist/verb-reference-packs/quran-verbs-v1/quran-verb-reference.db'
);
const COMPILED_ROOT = path.join(ROOT, '.artifacts/word-study-tests');

class NodeWordStudyDatabase {
  constructor(database) {
    this.database = database;
  }

  async getFirstAsync(sql, parameters = []) {
    return this.database.prepare(sql).get(...parameters) ?? null;
  }

  async getAllAsync(sql, parameters = []) {
    return this.database.prepare(sql).all(...parameters);
  }
}

class NodeWordStudyDatabaseProvider {
  constructor(databasePath = PACK_PATH) {
    this.database = new DatabaseSync(databasePath, { readOnly: true });
    this.adapter = new NodeWordStudyDatabase(this.database);
  }

  async getDatabaseAsync() {
    return this.adapter;
  }

  async closeAsync() {
    this.database.close();
  }
}

function loadRepositoryModule() {
  return require(path.join(
    COMPILED_ROOT,
    'infrastructure/word-study/SQLiteWordStudyRepository.js'
  ));
}

function loadLifecycleModule() {
  return require(path.join(
    COMPILED_ROOT,
    'infrastructure/word-study/WordStudyPackLifecycle.js'
  ));
}

function loadPackTypesModule() {
  return require(path.join(
    COMPILED_ROOT,
    'infrastructure/word-study/WordStudyPack.types.js'
  ));
}

function loadGrammarRepositoryModule() {
  return require(path.join(
    COMPILED_ROOT,
    'infrastructure/word-grammar/SQLiteGrammarStudyRepository.js'
  ));
}

function loadWordReferenceRegistryModule() {
  return require(path.join(
    COMPILED_ROOT,
    'infrastructure/word-reference/WordReferencePackRegistry.js'
  ));
}

function loadVerbReferenceRepositoryModule() {
  return require(path.join(
    COMPILED_ROOT,
    'infrastructure/verb-reference/SQLiteVerbReferenceRepository.js'
  ));
}

module.exports = {
  COMPILED_ROOT,
  GRAMMAR_PACK_PATH,
  MANIFEST_PATH,
  PACK_PATH,
  VERB_REFERENCE_PACK_PATH,
  NodeWordStudyDatabaseProvider,
  loadLifecycleModule,
  loadGrammarRepositoryModule,
  loadPackTypesModule,
  loadRepositoryModule,
  loadWordReferenceRegistryModule,
  loadVerbReferenceRepositoryModule,
};
