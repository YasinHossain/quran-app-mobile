import { openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { migrateAppDbAsync, migrateAppDbSync } from './migrations';

export const APP_DB_NAME = 'quran_app.db';

let appDbPromise: Promise<SQLiteDatabase> | null = null;
let appDbSync: SQLiteDatabase | null = null;

export async function getAppDbAsync(): Promise<SQLiteDatabase> {
  if (!appDbPromise) {
    appDbPromise = (async () => {
      const db = await openDatabaseAsync(APP_DB_NAME);
      await migrateAppDbAsync(db);
      return db;
    })().catch((error) => {
      appDbPromise = null;
      throw error;
    });
  }
  return appDbPromise;
}

export function getAppDbSync(): SQLiteDatabase {
  if (!appDbSync) {
    appDbSync = openDatabaseSync(APP_DB_NAME);
    migrateAppDbSync(appDbSync);
  }

  return appDbSync;
}

export async function initializeAppDbAsync(): Promise<void> {
  try {
    await getAppDbAsync();
  } catch (error) {
    logger.error('Failed to initialize app DB', undefined, error as Error);
  }
}

export async function closeAppDbAsync(): Promise<void> {
  if (appDbPromise) {
    const db = await appDbPromise;
    appDbPromise = null;
    await db.closeAsync();
  }

  if (appDbSync) {
    appDbSync.closeSync();
    appDbSync = null;
  }
}
