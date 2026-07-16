import type {
  PaginatedWordOccurrences,
  WordOccurrenceQuery,
  WordStudyLookupResult,
} from '../word-study';

export interface IWordStudyRepository {
  findByLocation(locationKey: string): Promise<WordStudyLookupResult>;
  findOccurrences(query: WordOccurrenceQuery): Promise<PaginatedWordOccurrences>;
}
