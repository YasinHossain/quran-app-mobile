import { Asset } from 'expo-asset';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  VerbReferenceDatabase,
  VerbReferenceDatabaseProvider,
  VerbReferenceSqlParameter,
} from './VerbReferenceDatabase';
import { BUNDLED_VERB_REFERENCE_PACK } from './bundledVerbReferencePack';

class ExpoVerbReferenceDatabase implements VerbReferenceDatabase {
  constructor(private readonly database: SQLiteDatabase) {}

  getAllAsync<T>(
    sql: string,
    parameters: readonly VerbReferenceSqlParameter[] = []
  ): Promise<T[]> {
    return this.database.getAllAsync<T>(sql, [...parameters]);
  }
}

export class ExpoVerbReferenceDatabaseProvider implements VerbReferenceDatabaseProvider {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

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
    const asset = Asset.fromModule(BUNDLED_VERB_REFERENCE_PACK.databaseAssetModule);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri?.startsWith('file://')) {
      throw new Error('Bundled verb-reference database asset is unavailable');
    }
    const separator = uri.lastIndexOf('/');
    const database = await openDatabaseAsync(
      uri.slice(separator + 1),
      { useNewConnection: true },
      uri.slice(0, separator + 1)
    );
    await database.execAsync('PRAGMA query_only=ON;');
    return database;
  }
}
