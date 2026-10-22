import { openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { migrateAppDbAsync, migrateAppDbSync } from './migrations';

export const APP_DB_NAME = 'quran_app.db';

// The offline search index uses FTS5, which prepares its own internal statements on
// each connection. Expo's default finalizes every statement on close, including those,
// and FTS5 then finalizes them again (a double free that corrupts native memory). Every
// app statement is finalized explicitly, so let SQLite close FTS5 tables itself.
const APP_DB_OPEN_OPTIONS = { finalizeUnusedStatementsBeforeClosing: false } as const;

let appDbPromise: Promise<SQLiteDatabase> | null = null;
let appDbSync: SQLiteDatabase | null = null;
let appDbWriteQueue: Promise<void> = Promise.resolve();

export async function getAppDbAsync(): Promise<SQLiteDatabase> {
  if (!appDbPromise) {
    appDbPromise = (async () => {
      const db = await openDatabaseAsync(APP_DB_NAME, APP_DB_OPEN_OPTIONS);
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
    appDbSync = openDatabaseSync(APP_DB_NAME, APP_DB_OPEN_OPTIONS);
    migrateAppDbSync(appDbSync);
  }

  return appDbSync;
}

export async function withAppDbWriteTransactionAsync(
  task: (db: SQLiteDatabase) => Promise<void>
): Promise<void> {
  const operation = appDbWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await runAppDbWriteTransactionAsync(task);
    });
  appDbWriteQueue = operation.catch(() => undefined);
  await operation;
}

async function runAppDbWriteTransactionAsync(
  task: (db: SQLiteDatabase) => Promise<void>
): Promise<void> {
  // Expo's exclusive transaction opens its own connection. Connection-level
  // PRAGMAs on getAppDbAsync() do not carry over to it, so configure this
  // writer before BEGIN. The process-wide queue also keeps native statement
  // calls from overlapping when several downloads finish together.
  await getAppDbAsync();
  const db = await openDatabaseAsync(APP_DB_NAME, { ...APP_DB_OPEN_OPTIONS, useNewConnection: true });
  try {
    await db.execAsync('PRAGMA busy_timeout = 15000;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('BEGIN IMMEDIATE;');
    try {
      await task(db);
      await db.execAsync('COMMIT;');
    } catch (error) {
      try {
        await db.execAsync('ROLLBACK;');
      } catch {
        // Keep the original import error. Closing the connection releases it.
      }
      throw error;
    }
  } finally {
    await db.closeAsync();
  }
}

export async function initializeAppDbAsync(): Promise<void> {
  try {
    await getAppDbAsync();
  } catch (error) {
    logger.error('Failed to initialize app DB', undefined, error as Error);
  }
}

export async function closeAppDbAsync(): Promise<void> {
  await appDbWriteQueue.catch(() => undefined);
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
