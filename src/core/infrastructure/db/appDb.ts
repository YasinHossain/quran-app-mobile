import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { migrateAppDbAsync } from './migrations';

const APP_DB_NAME = 'quran_app.db';

let appDbPromise: Promise<SQLiteDatabase> | null = null;

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

export async function initializeAppDbAsync(): Promise<void> {
  try {
    await getAppDbAsync();
  } catch (error) {
    logger.error('Failed to initialize app DB', undefined, error as Error);
  }
}

export async function closeAppDbAsync(): Promise<void> {
  if (!appDbPromise) return;
  const db = await appDbPromise;
  appDbPromise = null;
  await db.closeAsync();
}

