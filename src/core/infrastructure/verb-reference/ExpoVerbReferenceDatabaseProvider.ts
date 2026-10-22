import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  VerbReferenceDatabase,
  VerbReferenceDatabaseProvider,
  VerbReferenceSqlParameter,
} from './VerbReferenceDatabase';
import type { VerbReferencePackInstaller } from './VerbReferencePackInstaller';

class ExpoVerbReferenceDatabase implements VerbReferenceDatabase {
  constructor(private readonly db: SQLiteDatabase) {}

  getAllAsync<T>(
    sql: string,
    parameters: readonly VerbReferenceSqlParameter[] = []
  ): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, [...parameters]);
  }
}

/** Opens the installed verb-reference pack; lookups report unavailable until one is installed. */
export class ExpoVerbReferenceDatabaseProvider implements VerbReferenceDatabaseProvider {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

  constructor(private readonly installer: VerbReferencePackInstaller) {}

  async getDatabaseAsync(): Promise<VerbReferenceDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.openAsync().catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return new ExpoVerbReferenceDatabase(await this.databasePromise);
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
    await db.execAsync('PRAGMA query_only=ON;');
    return db;
  }
}
