import { getAppDbAsync } from '@/src/core/infrastructure/db';

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

export class TranslationOfflineStore implements ITranslationOfflineStore {
  async upsertVersesAndTranslations(params: {
    verses: OfflineVerseRowInput[];
    translations: OfflineTranslationRowInput[];
  }): Promise<void> {
    const db = await getAppDbAsync();

    const verses = params.verses ?? [];
    const translations = params.translations ?? [];

    if (verses.length === 0 && translations.length === 0) return;

    await db.withTransactionAsync(async () => {
      const upsertVerseStmt = await db.prepareAsync(`
        INSERT INTO offline_verses(verse_key, surah, ayah, arabic_uthmani)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(verse_key) DO UPDATE SET
          surah = excluded.surah,
          ayah = excluded.ayah,
          arabic_uthmani = excluded.arabic_uthmani;
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
    });
  }

  async getSurahVersesWithTranslations(
    surahId: number,
    translationIds: number[]
  ): Promise<OfflineVerseWithTranslations[]> {
    const db = await getAppDbAsync();
    const resolvedTranslationIds = normalizeTranslationIds(translationIds);

    if (resolvedTranslationIds.length === 0) {
      const rows = await db.getAllAsync<{
        verse_key: string;
        surah: number;
        ayah: number;
        arabic_uthmani: string;
      }>(
        `
        SELECT verse_key, surah, ayah, arabic_uthmani
        FROM offline_verses
        WHERE surah = ?
        ORDER BY ayah ASC;
        `,
        [surahId]
      );

      return rows.map((row) => ({
        verseKey: row.verse_key,
        surahId: row.surah,
        ayahNumber: row.ayah,
        arabicUthmani: row.arabic_uthmani,
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
    }>(
      `
      SELECT
        v.verse_key AS verse_key,
        v.surah AS surah,
        v.ayah AS ayah,
        v.arabic_uthmani AS arabic_uthmani,
        t.translation_id AS translation_id,
        t.text AS translation_text
      FROM offline_verses v
      LEFT JOIN offline_translations t
        ON t.verse_key = v.verse_key
        AND t.translation_id IN (${placeholders})
      WHERE v.surah = ?
      ORDER BY v.ayah ASC, t.translation_id ASC;
      `,
      [...resolvedTranslationIds, surahId]
    );

    const byVerseKey = new Map<
      string,
      {
        verseKey: string;
        surahId: number;
        ayahNumber: number;
        arabicUthmani: string;
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
        translations: resolvedTranslationIds
          .map((translationId) => {
            const text = verse.translationsById.get(translationId);
            if (!text) return null;
            return { translationId, text };
          })
          .filter((t): t is { translationId: number; text: string } => t !== null),
      }));
  }

  async deleteTranslation(translationId: number): Promise<void> {
    const db = await getAppDbAsync();

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM offline_translations WHERE translation_id = ?', [translationId]);
      await db.runAsync(`
        DELETE FROM offline_verses
        WHERE NOT EXISTS (
          SELECT 1
          FROM offline_translations t
          WHERE t.verse_key = offline_verses.verse_key
        );
      `);
    });
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
