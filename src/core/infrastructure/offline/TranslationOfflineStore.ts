import { getAppDbAsync } from '@/src/core/infrastructure/db';
import type { SQLiteDatabase } from 'expo-sqlite';
import juzData from '../../../data/juz.json';

import type {
  ITranslationOfflineStore,
  OfflineTranslationRowInput,
  OfflineVerseRowInput,
  OfflineVerseWithTranslations,
} from '@/src/domain/repositories/ITranslationOfflineStore';

export type {
  OfflineTranslationRowInput,
  OfflineVerseRowInput,
  OfflineVerseWithTranslations,
} from '@/src/domain/repositories/ITranslationOfflineStore';

function mapJoinedRowsToOfflineVerses(
  rows: Array<{
    verse_key: string;
    surah: number;
    ayah: number;
    arabic_uthmani: string;
    translation_id: number | null;
    translation_text: string | null;
    words_json?: string | null;
  }>,
  resolvedTranslationIds: number[]
): OfflineVerseWithTranslations[] {
  const byVerseKey = new Map<
    string,
    {
      verseKey: string;
      surahId: number;
      ayahNumber: number;
      arabicUthmani: string;
      wordsJson?: string;
      translationsById: Map<number, string>;
    }
  >();

  const verseOrder: string[] = [];

  for (const row of rows) {
    let existing = byVerseKey.get(row.verse_key);
    if (!existing) {
      existing = {
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
        wordsJson: row.words_json || undefined,
        translationsById: new Map<number, string>(),
      };
      byVerseKey.set(row.verse_key, existing);
      verseOrder.push(row.verse_key);
    }

    if (row.translation_id !== null && row.translation_text !== null) {
      existing.translationsById.set(row.translation_id, row.translation_text);
    }
  }

  return verseOrder
    .map((verseKey) => byVerseKey.get(verseKey))
    .filter((verse): verse is NonNullable<typeof verse> => Boolean(verse))
    .map((verse) => ({
      verseKey: verse.verseKey,
      surahId: verse.surahId,
      ayahNumber: verse.ayahNumber,
      arabicUthmani: verse.arabicUthmani,
      wordsJson: verse.wordsJson,
      translations: resolvedTranslationIds
        .map((translationId) => {
          const text = verse.translationsById.get(translationId);
          if (!text) return null;
          return { translationId, text };
        })
        .filter((t): t is { translationId: number; text: string } => t !== null),
    }));
}

export class TranslationOfflineStore implements ITranslationOfflineStore {
  async upsertVersesAndTranslations(params: {
    verses: OfflineVerseRowInput[];
    translations: OfflineTranslationRowInput[];
  }): Promise<void> {
    const db = await getAppDbAsync();

    const verses = params.verses ?? [];
    const translations = params.translations ?? [];

    if (verses.length === 0 && translations.length === 0) return;

    await db.withExclusiveTransactionAsync(async (txn) => {
      await upsertVerseAndTranslationRows(txn, verses, translations);
    });
  }

  async upsertWordTranslations(params: {
    languageCode: string;
    verses: OfflineVerseRowInput[];
  }): Promise<void> {
    const db = await getAppDbAsync();
    const languageCode = normalizeWordLanguageCode(params.languageCode);
    const verses = params.verses ?? [];

    if (!languageCode || verses.length === 0) return;

    await db.withExclusiveTransactionAsync(async (txn) => {
      await upsertVerseAndTranslationRows(txn, verses, []);
      await upsertWordTranslationRows(txn, languageCode, verses);
    });
  }

  async getSurahVersesWithTranslations(
    surahId: number,
    translationIds: number[],
    wordLang?: string
  ): Promise<OfflineVerseWithTranslations[]> {
    const db = await getAppDbAsync();
    const resolvedTranslationIds = normalizeTranslationIds(translationIds);
    const resolvedWordLang = normalizeWordLanguageCode(wordLang);

    if (resolvedTranslationIds.length === 0) {
      const rows = await db.getAllAsync<{
        verse_key: string;
        surah: number;
        ayah: number;
        arabic_uthmani: string;
        words_json: string | null;
      }>(
        `
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE v.surah = ?
        ORDER BY v.ayah ASC;
        `,
        [resolvedWordLang, surahId]
      );

      return rows.map((row) => ({
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
        wordsJson: row.words_json || undefined,
        translations: [],
      }));
    }

    const placeholders = resolvedTranslationIds.map(() => '?').join(', ');
    const rows = await db.getAllAsync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      translation_id: number | null;
      translation_text: string | null;
      words_json: string | null;
    }>(
      `
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
        COALESCE(wt.words_json, v.words_json) AS words_json,
        t.translation_id AS translation_id,
        t.text AS translation_text
      FROM offline_verses v
      LEFT JOIN offline_word_translations wt
        ON wt.verse_key = v.verse_key
        AND wt.language_code = ?
      LEFT JOIN offline_translations t
        ON t.verse_key = v.verse_key
        AND t.translation_id IN (${placeholders})
      WHERE v.surah = ?
      ORDER BY v.ayah ASC, t.translation_id ASC;
      `,
      [resolvedWordLang, ...resolvedTranslationIds, surahId]
    );

    return mapJoinedRowsToOfflineVerses(rows, resolvedTranslationIds);
  }

  async getSurahVersesPageWithTranslations(params: {
    surahId: number;
    translationIds: number[];
    page: number;
    perPage: number;
    wordLang?: string;
  }): Promise<OfflineVerseWithTranslations[]> {
    const db = await getAppDbAsync();
    const resolvedTranslationIds = normalizeTranslationIds(params.translationIds);
    const resolvedWordLang = normalizeWordLanguageCode(params.wordLang);
    const normalizedSurahId =
      Number.isFinite(params.surahId) && params.surahId > 0 ? Math.trunc(params.surahId) : 0;
    const normalizedPage =
      Number.isFinite(params.page) && params.page > 0 ? Math.trunc(params.page) : 0;
    const normalizedPerPage =
      Number.isFinite(params.perPage) && params.perPage > 0 ? Math.trunc(params.perPage) : 0;

    if (normalizedSurahId <= 0 || normalizedPage <= 0 || normalizedPerPage <= 0) {
      return [];
    }

    const offset = (normalizedPage - 1) * normalizedPerPage;

    if (resolvedTranslationIds.length === 0) {
      const rows = await db.getAllAsync<{
        verse_key: string;
        surah: number;
        ayah: number;
        arabic_uthmani: string;
        words_json: string | null;
      }>(
        `
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE v.surah = ?
        ORDER BY v.ayah ASC
        LIMIT ? OFFSET ?;
        `,
        [resolvedWordLang, normalizedSurahId, normalizedPerPage, offset]
      );

      return rows.map((row) => ({
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
        wordsJson: row.words_json || undefined,
        translations: [],
      }));
    }

    const placeholders = resolvedTranslationIds.map(() => '?').join(', ');
    const rows = await db.getAllAsync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      translation_id: number | null;
      translation_text: string | null;
      words_json: string | null;
    }>(
      `
      WITH verse_page AS (
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE v.surah = ?
        ORDER BY ayah ASC
        LIMIT ? OFFSET ?
      )
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
        v.words_json AS words_json,
        t.translation_id AS translation_id,
        t.text AS translation_text
      FROM verse_page v
      LEFT JOIN offline_translations t
        ON t.verse_key = v.verse_key
        AND t.translation_id IN (${placeholders})
      ORDER BY v.ayah ASC, t.translation_id ASC;
      `,
      [resolvedWordLang, normalizedSurahId, normalizedPerPage, offset, ...resolvedTranslationIds]
    );

    return mapJoinedRowsToOfflineVerses(rows, resolvedTranslationIds);
  }

  async getJuzVersesPageWithTranslations(params: {
    juzId: number;
    translationIds: number[];
    page: number;
    perPage: number;
    wordLang?: string;
  }): Promise<OfflineVerseWithTranslations[]> {
    const db = await getAppDbAsync();
    const resolvedTranslationIds = normalizeTranslationIds(params.translationIds);
    const resolvedWordLang = normalizeWordLanguageCode(params.wordLang);
    const normalizedJuzId =
      Number.isFinite(params.juzId) && params.juzId > 0 ? Math.trunc(params.juzId) : 0;
    const normalizedPage =
      Number.isFinite(params.page) && params.page > 0 ? Math.trunc(params.page) : 0;
    const normalizedPerPage =
      Number.isFinite(params.perPage) && params.perPage > 0 ? Math.trunc(params.perPage) : 0;

    if (normalizedJuzId <= 0 || normalizedPage <= 0 || normalizedPerPage <= 0) {
      return [];
    }

    const juz = (juzData as any[]).find((j: any) => j.number === normalizedJuzId);
    if (!juz) return [];

    const offset = (normalizedPage - 1) * normalizedPerPage;

    if (resolvedTranslationIds.length === 0) {
      const rows = await db.getAllAsync<{
        verse_key: string;
        surah: number;
        ayah: number;
        arabic_uthmani: string;
        words_json: string | null;
      }>(
        `
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE (surah > ? AND surah < ?)
           OR (surah = ? AND ? = ? AND ayah BETWEEN ? AND ?)
           OR (surah = ? AND ? < ? AND ayah >= ?)
           OR (surah = ? AND ? < ? AND ayah <= ?)
        ORDER BY surah ASC, ayah ASC
        LIMIT ? OFFSET ?;
        `,
        [
          resolvedWordLang,
          juz.startSurahId,
          juz.endSurahId,
          juz.startSurahId,
          juz.startSurahId,
          juz.endSurahId,
          juz.startAyah,
          juz.endAyah,
          juz.startSurahId,
          juz.startSurahId,
          juz.endSurahId,
          juz.startAyah,
          juz.endSurahId,
          juz.startSurahId,
          juz.endSurahId,
          juz.endAyah,
          normalizedPerPage,
          offset,
        ]
      );

      return rows.map((row) => ({
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
        wordsJson: row.words_json || undefined,
        translations: [],
      }));
    }

    const placeholders = resolvedTranslationIds.map(() => '?').join(', ');
    const rows = await db.getAllAsync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      translation_id: number | null;
      translation_text: string | null;
      words_json: string | null;
    }>(
      `
      WITH verse_page AS (
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE (surah > ? AND surah < ?)
           OR (surah = ? AND ? = ? AND ayah BETWEEN ? AND ?)
           OR (surah = ? AND ? < ? AND ayah >= ?)
           OR (surah = ? AND ? < ? AND ayah <= ?)
        ORDER BY surah ASC, ayah ASC
        LIMIT ? OFFSET ?
      )
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
        v.words_json AS words_json,
        t.translation_id AS translation_id,
        t.text AS translation_text
      FROM verse_page v
      LEFT JOIN offline_translations t
        ON t.verse_key = v.verse_key
        AND t.translation_id IN (${placeholders})
      ORDER BY v.surah ASC, v.ayah ASC, t.translation_id ASC;
      `,
      [
        resolvedWordLang,
        juz.startSurahId,
        juz.endSurahId,
        juz.startSurahId,
        juz.startSurahId,
        juz.endSurahId,
        juz.startAyah,
        juz.endAyah,
        juz.startSurahId,
        juz.startSurahId,
        juz.endSurahId,
        juz.startAyah,
        juz.endSurahId,
        juz.startSurahId,
        juz.endSurahId,
        juz.endAyah,
        normalizedPerPage,
        offset,
        ...resolvedTranslationIds,
      ]
    );

    return mapJoinedRowsToOfflineVerses(rows, resolvedTranslationIds);
  }

  async getVerseWithTranslations(
    verseKey: string,
    translationIds: number[],
    wordLang?: string
  ): Promise<OfflineVerseWithTranslations | null> {
    const db = await getAppDbAsync();
    const normalizedVerseKey = verseKey.trim();
    const resolvedTranslationIds = normalizeTranslationIds(translationIds);
    const resolvedWordLang = normalizeWordLanguageCode(wordLang);

    if (!normalizedVerseKey) return null;

    if (resolvedTranslationIds.length === 0) {
      const row = await db.getFirstAsync<{
        verse_key: string;
        surah: number;
        ayah: number;
        arabic_uthmani: string;
        words_json: string | null;
      }>(
        `
        SELECT
          v.verse_key AS verse_key,
          v.surah AS surah,
          v.ayah AS ayah,
          v.arabic_uthmani AS arabic_uthmani,
          COALESCE(wt.words_json, v.words_json) AS words_json
        FROM offline_verses v
        LEFT JOIN offline_word_translations wt
          ON wt.verse_key = v.verse_key
          AND wt.language_code = ?
        WHERE v.verse_key = ?
        LIMIT 1;
        `,
        [resolvedWordLang, normalizedVerseKey]
      );

      if (!row) return null;

      return {
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
        wordsJson: row.words_json || undefined,
        translations: [],
      };
    }

    const placeholders = resolvedTranslationIds.map(() => '?').join(', ');
    const rows = await db.getAllAsync<{
      verse_key: string;
      surah: number;
      ayah: number;
      arabic_uthmani: string;
      translation_id: number | null;
      translation_text: string | null;
      words_json: string | null;
    }>(
      `
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
        COALESCE(wt.words_json, v.words_json) AS words_json,
        t.translation_id AS translation_id,
        t.text AS translation_text
      FROM offline_verses v
      LEFT JOIN offline_word_translations wt
        ON wt.verse_key = v.verse_key
        AND wt.language_code = ?
      LEFT JOIN offline_translations t
        ON t.verse_key = v.verse_key
        AND t.translation_id IN (${placeholders})
      WHERE v.verse_key = ?
      ORDER BY t.translation_id ASC;
      `,
      [resolvedWordLang, ...resolvedTranslationIds, normalizedVerseKey]
    );

    if (rows.length === 0) return null;

    const translationsById = new Map<number, string>();
    const firstRow = rows[0]!;

    for (const row of rows) {
      if (row.translation_id !== null && row.translation_text !== null) {
        translationsById.set(row.translation_id, row.translation_text);
      }
    }

    return {
      verseKey: firstRow.verse_key,
      surahId: firstRow.surah,
      ayahNumber: firstRow.ayah,
      arabicUthmani: firstRow.arabic_uthmani,
      wordsJson: firstRow.words_json || undefined,
      translations: resolvedTranslationIds
        .map((translationId) => {
          const text = translationsById.get(translationId);
          if (!text) return null;
          return { translationId, text };
        })
        .filter((translation): translation is { translationId: number; text: string } => translation !== null),
    };
  }

  async deleteTranslation(translationId: number): Promise<void> {
    const db = await getAppDbAsync();

    await db.withExclusiveTransactionAsync(async (txn) => {
      await deleteTranslationRows(txn, translationId);
    });
  }

  async deleteWordTranslation(languageCode?: string): Promise<void> {
    const db = await getAppDbAsync();
    const normalizedLanguageCode = normalizeOptionalWordLanguageCode(languageCode);

    await db.withExclusiveTransactionAsync(async (txn) => {
      if (normalizedLanguageCode) {
        await txn.runAsync('DELETE FROM offline_word_translations WHERE language_code = ?', [
          normalizedLanguageCode,
        ]);
        if (normalizedLanguageCode === 'en') {
          await txn.runAsync('UPDATE offline_verses SET words_json = NULL');
        }
      } else {
        await txn.runAsync('DELETE FROM offline_word_translations');
        await txn.runAsync('UPDATE offline_verses SET words_json = NULL');
      }
      await deleteOrphanedVerseRows(txn);
    });
  }
}

function normalizeWordLanguageCode(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || 'en';
}

function normalizeOptionalWordLanguageCode(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function upsertVerseAndTranslationRows(
  db: SQLiteDatabase,
  verses: OfflineVerseRowInput[],
  translations: OfflineTranslationRowInput[]
): Promise<void> {
  const upsertVerseStmt = await db.prepareAsync(`
    INSERT INTO offline_verses(verse_key, surah, ayah, arabic_uthmani, words_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(verse_key) DO UPDATE SET
      surah = excluded.surah,
      ayah = excluded.ayah,
      arabic_uthmani = excluded.arabic_uthmani,
      words_json = COALESCE(excluded.words_json, offline_verses.words_json);
  `);

  const upsertTranslationStmt = await db.prepareAsync(`
    INSERT INTO offline_translations(translation_id, verse_key, text)
    VALUES (?, ?, ?)
    ON CONFLICT(translation_id, verse_key) DO UPDATE SET
      text = excluded.text;
  `);

  try {
    for (const verse of verses) {
      await upsertVerseStmt.executeAsync([
        verse.verseKey,
        verse.surahId,
        verse.ayahNumber,
        verse.arabicUthmani,
        verse.wordsJson ?? null,
      ]);
    }

    for (const translation of translations) {
      await upsertTranslationStmt.executeAsync([
        translation.translationId,
        translation.verseKey,
        translation.text,
      ]);
    }
  } finally {
    await upsertVerseStmt.finalizeAsync();
    await upsertTranslationStmt.finalizeAsync();
  }
}

async function deleteTranslationRows(db: SQLiteDatabase, translationId: number): Promise<void> {
  await db.runAsync('DELETE FROM offline_translations WHERE translation_id = ?', [translationId]);
  await deleteOrphanedVerseRows(db);
}

async function deleteOrphanedVerseRows(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`
    DELETE FROM offline_verses
    WHERE NOT EXISTS (
      SELECT 1
      FROM offline_translations t
      WHERE t.verse_key = offline_verses.verse_key
    )
    AND NOT EXISTS (
      SELECT 1
      FROM offline_word_translations wt
      WHERE wt.verse_key = offline_verses.verse_key
    );
  `);
}

async function upsertWordTranslationRows(
  db: SQLiteDatabase,
  languageCode: string,
  verses: OfflineVerseRowInput[]
): Promise<void> {
  const stmt = await db.prepareAsync(`
    INSERT INTO offline_word_translations(language_code, verse_key, words_json)
    VALUES (?, ?, ?)
    ON CONFLICT(language_code, verse_key) DO UPDATE SET
      words_json = excluded.words_json;
  `);

  try {
    for (const verse of verses) {
      if (!verse.wordsJson) continue;
      await stmt.executeAsync([languageCode, verse.verseKey, verse.wordsJson]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

function normalizeTranslationIds(translationIds: number[]): number[] {
  const unique = new Set<number>();

  for (const id of translationIds ?? []) {
    if (!Number.isFinite(id)) continue;
    const normalized = Math.trunc(id);
    if (normalized <= 0) continue;
    unique.add(normalized);
  }

  return Array.from(unique);
}
