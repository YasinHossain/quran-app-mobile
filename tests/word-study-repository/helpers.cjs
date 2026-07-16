const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '../..');
const PACK_PATH = path.join(
  ROOT,
  'dist/word-study-packs/qac-v0.4/quran-word-study.db'
);
const MANIFEST_PATH = path.join(ROOT, 'dist/word-study-packs/qac-v0.4/manifest.json');
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

module.exports = {
  COMPILED_ROOT,
  MANIFEST_PATH,
  PACK_PATH,
  NodeWordStudyDatabaseProvider,
  loadLifecycleModule,
  loadPackTypesModule,
  loadRepositoryModule,
};
