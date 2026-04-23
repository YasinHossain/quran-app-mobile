import { getAppDbAsync } from '@/src/core/infrastructure/db';

import type {
  ITafsirOfflineStore,
  OfflineTafsirRowInput,
} from '@/src/domain/repositories/ITafsirOfflineStore';

export type { OfflineTafsirRowInput } from '@/src/domain/repositories/ITafsirOfflineStore';

function normalizeRows(rows: OfflineTafsirRowInput[]): OfflineTafsirRowInput[] {
  const normalized: OfflineTafsirRowInput[] = [];

  for (const row of rows ?? []) {
    const tafsirId =
      typeof row?.tafsirId === 'number' && Number.isFinite(row.tafsirId)
        ? Math.trunc(row.tafsirId)
        : 0;
    const verseKey = String(row?.verseKey ?? '').trim();
    const html = typeof row?.html === 'string' ? row.html : String(row?.html ?? '');

    if (tafsirId <= 0 || !verseKey) continue;
    normalized.push({ tafsirId, verseKey, html });
  }

  return normalized;
}

export class TafsirOfflineStore implements ITafsirOfflineStore {
  async upsertRows(rows: OfflineTafsirRowInput[]): Promise<void> {
    const normalizedRows = normalizeRows(rows);
    if (normalizedRows.length === 0) return;

    const db = await getAppDbAsync();

    await db.withTransactionAsync(async () => {
      const upsertStmt = await db.prepareAsync(`
        INSERT INTO offline_tafsir(tafsir_id, verse_key, html)
        VALUES (?, ?, ?)
        ON CONFLICT(tafsir_id, verse_key) DO UPDATE SET
          html = excluded.html;
      `);

      try {
        for (const row of normalizedRows) {
          await upsertStmt.executeAsync([row.tafsirId, row.verseKey, row.html]);
        }
      } finally {
        await upsertStmt.finalizeAsync();
      }
    });
  }

  async deleteTafsir(tafsirId: number): Promise<void> {
    const normalizedTafsirId =
      typeof tafsirId === 'number' && Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : 0;
    if (normalizedTafsirId <= 0) {
      throw new Error('tafsirId must be a positive integer');
    }

    const db = await getAppDbAsync();
    await db.runAsync('DELETE FROM offline_tafsir WHERE tafsir_id = ?', [normalizedTafsirId]);
  }
}
