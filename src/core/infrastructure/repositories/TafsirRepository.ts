import { Tafsir } from '@/src/core/domain/entities/Tafsir';
import { ITafsirRepository } from '@/src/core/domain/repositories/ITafsirRepository';

import { getAppDbAsync } from '@/src/core/infrastructure/db';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { fetchAllResources } from './tafsir.utils';
import { fetchResourcesForLanguage } from './tafsirApi';
import { cacheResources as cacheTafsirResources, getCachedResources as getTafsirCachedResources } from './tafsirCache';

export class TafsirRepository implements ITafsirRepository {
  async getAllResources(): Promise<Tafsir[]> {
    const cached = await this.getCachedResources();
    if (cached.length > 0) {
      void fetchAllResources().catch((err) => {
        logger.warn('Failed to background refresh tafsir resources:', undefined, err as Error);
      });
      return cached;
    }
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
      return '';
    }

    try {
      const db = await getAppDbAsync();
      // Verses inside a multi-verse passage read the passage HTML from its first verse.
      const row = await db.getFirstAsync<{ html: string }>(
        `SELECT COALESCE(p.html, v.html) AS html
         FROM offline_tafsir v
         LEFT JOIN offline_tafsir p
           ON p.tafsir_id = v.tafsir_id AND p.verse_key = v.passage_start
         WHERE v.tafsir_id = ? AND v.verse_key = ?;`,
        [normalizedTafsirId, normalizedVerseKey]
      );
      if (row) {
        return row.html;
      }
    } catch (error) {
      logger.warn(
        'Failed to read offline tafsir cache',
        { tafsirId: normalizedTafsirId, verseKey: normalizedVerseKey },
        error as Error
      );
    }

    return '';
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
