import { Tafsir } from '@/src/core/domain/entities/Tafsir';
import { ITafsirRepository } from '@/src/core/domain/repositories/ITafsirRepository';

import { getAppDbAsync } from '@/src/core/infrastructure/db';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { fetchAllResources, fetchTafsirByVerse } from './tafsir.utils';
import { fetchResourcesForLanguage } from './tafsirApi';
import { cacheResources as cacheTafsirResources, getCachedResources as getTafsirCachedResources } from './tafsirCache';

export class TafsirRepository implements ITafsirRepository {
  async getAllResources(): Promise<Tafsir[]> {
    return fetchAllResources();
  }

  async getResourcesByLanguage(language: string): Promise<Tafsir[]> {
    return fetchResourcesForLanguage(language);
  }

  async getById(id: number): Promise<Tafsir | null> {
    const allResources = await this.getAllResources();
    return allResources.find((t) => t.id === id) || null;
  }

  async getTafsirByVerse(verseKey: string, tafsirId: number): Promise<string> {
    const normalizedTafsirId = Number.isFinite(tafsirId) ? Math.trunc(tafsirId) : NaN;
    const normalizedVerseKey = verseKey.trim();

    if (!normalizedVerseKey || !Number.isFinite(normalizedTafsirId) || normalizedTafsirId <= 0) {
      return fetchTafsirByVerse(verseKey, tafsirId);
    }

    try {
      const db = await getAppDbAsync();
      const row = await db.getFirstAsync<{ html: string }>(
        'SELECT html FROM offline_tafsir WHERE tafsir_id = ? AND verse_key = ?;',
        [normalizedTafsirId, normalizedVerseKey]
      );
      if (row?.html && row.html.trim().length > 0) {
        return row.html;
      }
    } catch (error) {
      logger.warn(
        'Failed to read offline tafsir cache',
        { tafsirId: normalizedTafsirId, verseKey: normalizedVerseKey },
        error as Error
      );
    }

    const html = await fetchTafsirByVerse(normalizedVerseKey, normalizedTafsirId);

    if (html && html.trim().length > 0) {
      try {
        const db = await getAppDbAsync();
        await db.runAsync(
          `
          INSERT INTO offline_tafsir(tafsir_id, verse_key, html)
          VALUES (?, ?, ?)
          ON CONFLICT(tafsir_id, verse_key) DO UPDATE SET
            html = excluded.html;
          `,
          [normalizedTafsirId, normalizedVerseKey, html]
        );
      } catch (error) {
        logger.warn(
          'Failed to write offline tafsir cache',
          { tafsirId: normalizedTafsirId, verseKey: normalizedVerseKey },
          error as Error
        );
      }
    }

    return html;
  }

  async search(searchTerm: string): Promise<Tafsir[]> {
    const allResources = await this.getAllResources();
    return allResources.filter((tafsir) => tafsir.matchesSearch(searchTerm));
  }

  async cacheResources(tafsirs: Tafsir[]): Promise<void> {
    await cacheTafsirResources(tafsirs);
  }

  async getCachedResources(): Promise<Tafsir[]> {
    return getTafsirCachedResources();
  }
}
