import type {
  PaginatedWordOccurrences,
  WordAnalysis,
  WordOccurrenceQuery,
  WordStudyLookupResult,
} from '../word-study';

export interface IWordStudyRepository {
  findByLocation(locationKey: string): Promise<WordStudyLookupResult>;
  findByVerse(verseKey: string): Promise<readonly WordAnalysis[]>;
  findOccurrences(query: WordOccurrenceQuery): Promise<PaginatedWordOccurrences>;
}
