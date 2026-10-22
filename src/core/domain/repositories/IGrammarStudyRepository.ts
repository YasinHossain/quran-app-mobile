import type { GrammarStudyLookupResult } from '../word-study';

export interface IGrammarStudyRepository {
  findByVerse(verseKey: string): Promise<GrammarStudyLookupResult>;
}
