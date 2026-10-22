import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  GrammarStudyDatabase,
  GrammarStudyDatabaseProvider,
  GrammarStudySqlParameter,
} from './GrammarStudyDatabase';
import type { WordGrammarPackInstaller } from './WordGrammarPackInstaller';

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

  constructor(private readonly installer: WordGrammarPackInstaller) {}

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
    const ready = await this.installer.resolveAsync();
    const db = await openDatabaseAsync(
      ready.manifest.databaseFile,
      { useNewConnection: true },
      ready.databaseDirectoryUri
    );
    await db.execAsync('PRAGMA query_only=ON; PRAGMA foreign_keys=ON;');
    return db;
  }
}
