import type { IWordStudyRepository } from '../../../domain/repositories/IWordStudyRepository';
import type { PaginatedWordOccurrences, WordOccurrenceQuery } from '../../../domain/word-study';

export class ListWordOccurrences {
  constructor(private readonly wordStudyRepository: IWordStudyRepository) {}

  execute(query: WordOccurrenceQuery): Promise<PaginatedWordOccurrences> {
    if (!Number.isInteger(query.limit) || query.limit < 1) {
      throw new Error('Word occurrence query limit must be a positive integer');
    }

    if (query.scope === 'surface' && !query.normalizedSurface && !query.locationKey) {
      throw new Error('Surface occurrence queries require normalizedSurface or locationKey');
    }

    if (query.scope === 'lemma' && !query.lemmaId) {
      throw new Error('Lemma occurrence queries require lemmaId');
    }

    if (query.scope === 'root' && !query.rootId) {
      throw new Error('Root occurrence queries require rootId');
    }

    return this.wordStudyRepository.findOccurrences(query);
  }
}
