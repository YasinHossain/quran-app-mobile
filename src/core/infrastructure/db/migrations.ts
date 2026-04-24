import type { SQLiteDatabase } from 'expo-sqlite';

import { logger } from '@/src/core/infrastructure/monitoring/logger';

type AppDbMigration = {
  version: number;
  statements: string[];
};

const APP_DB_MIGRATIONS: AppDbMigration[] = [
  {
    version: 1,
    statements: [
      `
      CREATE TABLE IF NOT EXISTS app_meta(
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      `,
    ],
  },
  {
    version: 2,
    statements: [
      `
      CREATE TABLE IF NOT EXISTS offline_verses(
        verse_key TEXT PRIMARY KEY NOT NULL,
        surah INTEGER NOT NULL,
        ayah INTEGER NOT NULL,
        arabic_uthmani TEXT NOT NULL
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS offline_translations(
        translation_id INTEGER NOT NULL,
        verse_key TEXT NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY(translation_id, verse_key),
        FOREIGN KEY(verse_key) REFERENCES offline_verses(verse_key) ON DELETE CASCADE
      );
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_offline_verses_surah_ayah
      ON offline_verses(surah, ayah);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_offline_translations_verse_key
      ON offline_translations(verse_key);
      `,
    ],
  },
  {
    version: 3,
    statements: [
      `
      CREATE TABLE IF NOT EXISTS offline_tafsir(
        tafsir_id INTEGER NOT NULL,
        verse_key TEXT NOT NULL,
        html TEXT NOT NULL,
        PRIMARY KEY(tafsir_id, verse_key)
      );
      `,
    ],
  },
  {
    version: 4,
    statements: [
      `
      CREATE TABLE IF NOT EXISTS mushaf_pack_installs(
        pack_id TEXT NOT NULL,
        version TEXT NOT NULL,
        channel TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        installed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(pack_id, version)
      );
      `,
      `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mushaf_pack_installs_active_pack
      ON mushaf_pack_installs(pack_id)
      WHERE is_active = 1;
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_mushaf_pack_installs_lookup
      ON mushaf_pack_installs(pack_id, updated_at DESC);
      `,
    ],
  },
];

export const APP_DB_LATEST_SCHEMA_VERSION =
  APP_DB_MIGRATIONS.length > 0 ? APP_DB_MIGRATIONS[APP_DB_MIGRATIONS.length - 1].version : 0;

async function getUserVersionAsync(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

function getUserVersionSync(db: SQLiteDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

export async function migrateAppDbAsync(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const startingVersion = await getUserVersionAsync(db);
  if (startingVersion >= APP_DB_LATEST_SCHEMA_VERSION) {
    return;
  }

  if (startingVersion > APP_DB_LATEST_SCHEMA_VERSION) {
    logger.warn('App DB schema version is newer than supported by this app build', {
      startingVersion,
      latestVersion: APP_DB_LATEST_SCHEMA_VERSION,
    });
    return;
  }

  const migrationsToRun = APP_DB_MIGRATIONS.filter((migration) => migration.version > startingVersion);
  if (migrationsToRun.length === 0) return;

  await db.withTransactionAsync(async () => {
    for (const migration of migrationsToRun) {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    }
  });
}

export function migrateAppDbSync(db: SQLiteDatabase): void {
  db.execSync('PRAGMA foreign_keys = ON;');

  const startingVersion = getUserVersionSync(db);
  if (startingVersion >= APP_DB_LATEST_SCHEMA_VERSION) {
    return;
  }

  if (startingVersion > APP_DB_LATEST_SCHEMA_VERSION) {
    logger.warn('App DB schema version is newer than supported by this app build', {
      startingVersion,
      latestVersion: APP_DB_LATEST_SCHEMA_VERSION,
    });
    return;
  }

  const migrationsToRun = APP_DB_MIGRATIONS.filter((migration) => migration.version > startingVersion);
  if (migrationsToRun.length === 0) return;

  db.withTransactionSync(() => {
    for (const migration of migrationsToRun) {
      for (const statement of migration.statements) {
        db.execSync(statement);
      }
      db.execSync(`PRAGMA user_version = ${migration.version};`);
    }
  });
}
