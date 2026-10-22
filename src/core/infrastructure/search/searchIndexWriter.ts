import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_TRANSLATION_INDEX_SQL,
  INSERT_TRANSLATION_INDEX_SQL,
  buildTranslationIndexParams,
  getTranslationIndexRowRange,
} from '@/lib/search/localSearchEngine';
import { insertRowsAsync } from '@/src/core/infrastructure/db/insertRows';

import chapters from '../../../data/chapters.en.json';

// Verse ids follow Quran order (1:1 = 1 … 114:6 = 6236), matching Quran.com verse ids.
const surahVerseOffsets: number[] = (() => {
  const offsets = [0];
  let total = 0;
  for (const chapter of chapters as Array<{ verses_count: number }>) {
    offsets.push(total);
    total += chapter.verses_count;
  }
  return offsets;
})();

export function getVerseIdFromKey(verseKey: string): number | null {
  const [surahPart, ayahPart] = verseKey.split(':');
  const surah = Number.parseInt(surahPart ?? '', 10);
  const ayah = Number.parseInt(ayahPart ?? '', 10);
  const chapter = (chapters as Array<{ verses_count: number }>)[surah - 1];
  if (!chapter || !Number.isFinite(ayah) || ayah < 1 || ayah > chapter.verses_count) return null;
  return surahVerseOffsets[surah]! + ayah;
}

/** Adds or replaces translation rows in the search index, inside the caller's transaction. */
export async function indexTranslationRowsAsync(
  db: SQLiteDatabase,
  rows: ReadonlyArray<{ translationId: number; verseKey: string; text: string }>
): Promise<void> {
  const indexRows = rows.flatMap((row) => {
    const verseId = getVerseIdFromKey(row.verseKey);
    return verseId === null
      ? []
      : [buildTranslationIndexParams(row.translationId, verseId, row.verseKey, row.text)];
  });
  await insertRowsAsync(db, { insert: INSERT_TRANSLATION_INDEX_SQL }, indexRows);
}

export async function removeTranslationFromIndexAsync(
  db: SQLiteDatabase,
  translationId: number
): Promise<void> {
  await db.runAsync(DELETE_TRANSLATION_INDEX_SQL, getTranslationIndexRowRange(translationId));
}
