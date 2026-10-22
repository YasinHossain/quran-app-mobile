import { insertRowsAsync, withAppDbWriteTransactionAsync } from '@/src/core/infrastructure/db';

import type {
  ITafsirOfflineStore,
  OfflineTafsirRowInput,
} from '@/src/domain/repositories/ITafsirOfflineStore';

export type { OfflineTafsirRowInput } from '@/src/domain/repositories/ITafsirOfflineStore';

/**
 * A row from a hosted tafsir pack. Verses of a multi-verse passage carry its range; the
 * passage HTML is stored on the `passageStart` row and the other rows keep empty HTML.
 */
export interface OfflineTafsirPackRowInput extends OfflineTafsirRowInput {
  passageStart?: string | null;
  passageEnd?: string | null;
}

export interface ITafsirPackOfflineStore extends ITafsirOfflineStore {
  upsertRows(rows: OfflineTafsirPackRowInput[]): Promise<void>;
}

type NormalizedRow = {
  tafsirId: number;
  verseKey: string;
  html: string;
  passageStart: string | null;
  passageEnd: string | null;
};

function normalizeRows(rows: OfflineTafsirPackRowInput[]): NormalizedRow[] {
  const normalized: NormalizedRow[] = [];

  for (const row of rows ?? []) {
    const tafsirId =
      typeof row?.tafsirId === 'number' && Number.isFinite(row.tafsirId)
        ? Math.trunc(row.tafsirId)
        : 0;
    const verseKey = String(row?.verseKey ?? '').trim();
    const html = typeof row?.html === 'string' ? row.html : String(row?.html ?? '');
    const passageStart = String(row?.passageStart ?? '').trim();
    const passageEnd = String(row?.passageEnd ?? '').trim();
    const hasPassage = passageStart.length > 0 && passageEnd.length > 0;

    if (tafsirId <= 0 || !verseKey) continue;
    normalized.push({
      tafsirId,
      verseKey,
      html,
      passageStart: hasPassage ? passageStart : null,
      passageEnd: hasPassage ? passageEnd : null,
    });
  }

  return normalized;
}

export class TafsirOfflineStore implements ITafsirPackOfflineStore {
  async upsertRows(rows: OfflineTafsirPackRowInput[]): Promise<void> {
    const normalizedRows = normalizeRows(rows);
    if (normalizedRows.length === 0) return;

    await withAppDbWriteTransactionAsync(async (db) => {
      await insertRowsAsync(
        db,
        {
          insert: 'INSERT INTO offline_tafsir(tafsir_id, verse_key, html, passage_start, passage_end)',
          suffix: `ON CONFLICT(tafsir_id, verse_key) DO UPDATE SET
            html = excluded.html,
            passage_start = excluded.passage_start,
            passage_end = excluded.passage_end`,
        },
        normalizedRows.map((row) => [
          row.tafsirId,
          row.verseKey,
          row.html,
          row.passageStart,
          row.passageEnd,
        ])
      );
    });
  }

  async deleteTafsir(tafsirId: number): Promise<void> {
    const normalizedTafsirId =
      typeof tafsirId === 'number' && Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
    if (normalizedTafsirId <= 0) {
      throw new Error('tafsirId must be a positive integer');
    }

    await withAppDbWriteTransactionAsync(async (db) => {
      await db.runAsync('DELETE FROM offline_tafsir WHERE tafsir_id = ?', [normalizedTafsirId]);
    });
  }
}
