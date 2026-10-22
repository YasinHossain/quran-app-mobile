import type { SQLiteDatabase } from 'expo-sqlite';

import {
  SEARCH_ARABIC_FTS_TABLE,
  SEARCH_TRANSLATION_FTS_TABLE,
  TRANSLATION_INDEX_ROWID_FACTOR,
  UPSERT_ARABIC_INDEX_SQL,
  buildArabicIndexParams,
} from '@/lib/search/localSearchEngine';
import { SEARCH_INDEX_TEXT_VERSION } from '@/lib/search/searchText';
import { getAppDbAsync, withAppDbWriteTransactionAsync } from '@/src/core/infrastructure/db';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { indexTranslationRowsAsync, removeTranslationFromIndexAsync } from './searchIndexWriter';

type ImlaeiSource = {
  format: string;
  generatedAt: string;
  verseCount: number;
  chapters: string[][];
};

// Matches `generatedAt` in src/data/search/quran-imlaei.json, so a refreshed source
// rebuilds the Arabic index without loading the 1.3 MB file on every launch.
const IMLAEI_SOURCE_VERSION = '2026-10-18';
const EXPECTED_VERSE_COUNT = 6236;
const ARABIC_INDEX_META_KEY = 'search_arabic_index_version';
const TRANSLATION_INDEX_META_KEY = 'search_translation_index_version';
const ARABIC_INDEX_VERSION = `${SEARCH_INDEX_TEXT_VERSION}:${IMLAEI_SOURCE_VERSION}`;
const TRANSLATION_INDEX_VERSION = String(SEARCH_INDEX_TEXT_VERSION);
const ARABIC_BATCH_SIZE = 500;

let preparePromise: Promise<void> | null = null;

/**
 * Builds the bundled Arabic index and reconciles translation rows with installed
 * translations. Safe to call repeatedly: work runs once per launch and is skipped when
 * the stored index is current. Searches await it so the first query sees a full index.
 */
export function prepareSearchIndexAsync(): Promise<void> {
  preparePromise ??= (async () => {
    const db = await getAppDbAsync();
    await ensureArabicIndexAsync(db);
    await reconcileTranslationIndexAsync(db);
  })().catch((error) => {
    preparePromise = null;
    logger.error('Failed to prepare offline search index', undefined, error as Error);
    throw error;
  });
  return preparePromise;
}

async function getMetaAsync(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setMetaAsync(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

function loadImlaeiSource(): ImlaeiSource {
  const source = require('../../../data/search/quran-imlaei.json') as ImlaeiSource;
  const verseCount = source.chapters.reduce((total, verses) => total + verses.length, 0);
  if (
    source.format !== 'quran-imlaei-v1' ||
    source.generatedAt !== IMLAEI_SOURCE_VERSION ||
    source.chapters.length !== 114 ||
    verseCount !== EXPECTED_VERSE_COUNT
  ) {
    throw new Error('Bundled Arabic search text is invalid');
  }
  return source;
}

async function ensureArabicIndexAsync(db: SQLiteDatabase): Promise<void> {
  if ((await getMetaAsync(db, ARABIC_INDEX_META_KEY)) === ARABIC_INDEX_VERSION) return;

  const source = loadImlaeiSource();
  const rows: Array<{ verseId: number; verseKey: string; text: string }> = [];
  source.chapters.forEach((verses, surahIndex) => {
    verses.forEach((text, ayahIndex) => {
      rows.push({ verseId: rows.length + 1, verseKey: `${surahIndex + 1}:${ayahIndex + 1}`, text });
    });
  });

  await withAppDbWriteTransactionAsync(async (txn) => {
    await txn.runAsync(`DELETE FROM ${SEARCH_ARABIC_FTS_TABLE};`);
    const statement = await txn.prepareAsync(UPSERT_ARABIC_INDEX_SQL);
    try {
      for (let start = 0; start < rows.length; start += ARABIC_BATCH_SIZE) {
        for (const row of rows.slice(start, start + ARABIC_BATCH_SIZE)) {
          await statement.executeAsync(buildArabicIndexParams(row.verseId, row.verseKey, row.text));
        }
      }
    } finally {
      await statement.finalizeAsync();
    }
    await setMetaAsync(txn, ARABIC_INDEX_META_KEY, ARABIC_INDEX_VERSION);
  });
}

async function reindexTranslationAsync(translationId: number): Promise<void> {
  await withAppDbWriteTransactionAsync(async (txn) => {
    await removeTranslationFromIndexAsync(txn, translationId);
    const rows = await txn.getAllAsync<{ verse_key: string; text: string }>(
      'SELECT verse_key, text FROM offline_translations WHERE translation_id = ?',
      [translationId]
    );
    await indexTranslationRowsAsync(
      txn,
      rows.map((row) => ({ translationId, verseKey: row.verse_key, text: row.text }))
    );
  });
}

/**
 * Indexes translations installed before the search index existed, rebuilds everything
 * after a normalization change, and repairs any translation whose row count drifted.
 */
async function reconcileTranslationIndexAsync(db: SQLiteDatabase): Promise<void> {
  const isCurrentVersion =
    (await getMetaAsync(db, TRANSLATION_INDEX_META_KEY)) === TRANSLATION_INDEX_VERSION;
  if (!isCurrentVersion) {
    await withAppDbWriteTransactionAsync((txn) =>
      txn.runAsync(`DELETE FROM ${SEARCH_TRANSLATION_FTS_TABLE};`).then(() => undefined)
    );
  }

  const installed = await db.getAllAsync<{ translation_id: number; count: number }>(
    'SELECT translation_id, COUNT(*) AS count FROM offline_translations GROUP BY translation_id'
  );
  const indexed = isCurrentVersion
    ? await db.getAllAsync<{ translation_id: number; count: number }>(
        `SELECT rowid / ${TRANSLATION_INDEX_ROWID_FACTOR} AS translation_id, COUNT(*) AS count
         FROM ${SEARCH_TRANSLATION_FTS_TABLE}
         GROUP BY rowid / ${TRANSLATION_INDEX_ROWID_FACTOR}`
      )
    : [];

  const indexedCounts = new Map(indexed.map((row) => [Number(row.translation_id), Number(row.count)]));
  const installedIds = new Set(installed.map((row) => Number(row.translation_id)));

  for (const row of installed) {
    const translationId = Number(row.translation_id);
    if (indexedCounts.get(translationId) !== Number(row.count)) {
      await reindexTranslationAsync(translationId);
    }
  }

  for (const translationId of indexedCounts.keys()) {
    if (!installedIds.has(translationId)) {
      await withAppDbWriteTransactionAsync((txn) => removeTranslationFromIndexAsync(txn, translationId));
    }
  }

  if (!isCurrentVersion) {
    await withAppDbWriteTransactionAsync((txn) =>
      setMetaAsync(txn, TRANSLATION_INDEX_META_KEY, TRANSLATION_INDEX_VERSION)
    );
  }
}
