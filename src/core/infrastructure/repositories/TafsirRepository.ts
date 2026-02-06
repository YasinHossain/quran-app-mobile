import { Tafsir } from '@/src/core/domain/entities/Tafsir';
import { ITafsirRepository } from '@/src/core/domain/repositories/ITafsirRepository';

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
    return fetchTafsirByVerse(verseKey, tafsirId);
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

