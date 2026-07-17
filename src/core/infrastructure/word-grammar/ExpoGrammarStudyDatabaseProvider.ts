import { Asset } from 'expo-asset';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  GrammarStudyDatabase,
  GrammarStudyDatabaseProvider,
  GrammarStudySqlParameter,
} from './GrammarStudyDatabase';
import { BUNDLED_WORD_GRAMMAR_PACK } from './bundledWordGrammarPack';

class ExpoGrammarStudyDatabase implements GrammarStudyDatabase {
  constructor(private readonly db: SQLiteDatabase) {}

  async getFirstAsync<T>(
    sql: string,
    parameters: readonly GrammarStudySqlParameter[] = []
  ): Promise<T | null> {
    return (await this.db.getFirstAsync<T>(sql, [...parameters])) ?? null;
  }

  getAllAsync<T>(
    sql: string,
    parameters: readonly GrammarStudySqlParameter[] = []
  ): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, [...parameters]);
  }
}

export class ExpoGrammarStudyDatabaseProvider implements GrammarStudyDatabaseProvider {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

  async getDatabaseAsync(): Promise<GrammarStudyDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.openAsync().catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return new ExpoGrammarStudyDatabase(await this.databasePromise);
  }

  async closeAsync(): Promise<void> {
    const pending = this.databasePromise;
    this.databasePromise = null;
    if (pending) await (await pending).closeAsync();
  }

  private async openAsync(): Promise<SQLiteDatabase> {
    const asset = Asset.fromModule(BUNDLED_WORD_GRAMMAR_PACK.databaseAssetModule);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri?.startsWith('file://')) {
      throw new Error('Bundled word grammar database asset is unavailable');
    }
    const separator = uri.lastIndexOf('/');
    const directory = uri.slice(0, separator + 1);
    const fileName = uri.slice(separator + 1);
    const db = await openDatabaseAsync(fileName, { useNewConnection: true }, directory);
    await db.execAsync('PRAGMA query_only=ON; PRAGMA foreign_keys=ON;');
    return db;
  }
}
