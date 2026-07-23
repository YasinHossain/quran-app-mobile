import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  WordStudyDatabase,
  WordStudyDatabaseProvider,
  WordStudySqlParameter,
} from './WordStudyDatabase';
import { WordStudyPackLifecycle } from './WordStudyPackLifecycle';
import type { ReadyWordStudyPack, WordStudyPackCatalogEntry } from './WordStudyPack.types';

class ExpoWordStudyDatabase implements WordStudyDatabase {
  constructor(private readonly db: SQLiteDatabase) {}

  async getFirstAsync<T>(
    sql: string,
    parameters: readonly WordStudySqlParameter[] = []
  ): Promise<T | null> {
    return (await this.db.getFirstAsync<T>(sql, [...parameters])) ?? null;
  }

  getAllAsync<T>(
    sql: string,
    parameters: readonly WordStudySqlParameter[] = []
  ): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, [...parameters]);
  }
}

export class ExpoWordStudyDatabaseProvider implements WordStudyDatabaseProvider {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

  constructor(private readonly lifecycle: WordStudyPackLifecycle) {}

  async getDatabaseAsync(): Promise<WordStudyDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.openAsync().catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return new ExpoWordStudyDatabase(await this.databasePromise);
  }

  async closeAsync(): Promise<void> {
    const pending = this.databasePromise;
    this.databasePromise = null;
    if (pending) await (await pending).closeAsync();
  }

  async installUpdateAsync(
    entry: WordStudyPackCatalogEntry,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<ReadyWordStudyPack> {
    await this.closeAsync();
    return this.lifecycle.installUpdateAsync(entry, signal, onProgress);
  }

  private async openAsync(): Promise<SQLiteDatabase> {
    const ready = await this.lifecycle.ensureReadyAsync();
    const db = await openDatabaseAsync(
      ready.manifest.databaseFile,
      { useNewConnection: true },
      ready.databaseDirectoryUri
    );
    await db.execAsync('PRAGMA query_only=ON; PRAGMA foreign_keys=ON;');
    return db;
  }
}
