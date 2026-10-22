import type {
  Lemma,
  PaginatedWordOccurrences,
  WordAnalysis,
  WordOccurrenceQuery,
  WordStudyLookupResult,
} from '../word-study';

export interface IWordStudyRepository {
  findByLocation(locationKey: string): Promise<WordStudyLookupResult>;
  findByVerse(verseKey: string): Promise<readonly WordAnalysis[]>;
  findLemmasByRoot(rootId: string): Promise<readonly Lemma[]>;
  findOccurrences(query: WordOccurrenceQuery): Promise<PaginatedWordOccurrences>;
}
