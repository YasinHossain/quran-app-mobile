import type { IGrammarStudyRepository } from '../../../domain/repositories/IGrammarStudyRepository';
import type { GrammarStudyLookupResult } from '../../../domain/word-study';
import { formatVerseKey, parseVerseKey } from '../../../domain/word-study';

export class GetVerseGrammar {
  constructor(private readonly grammarStudyRepository: IGrammarStudyRepository) {}

  execute(verseKey: string): Promise<GrammarStudyLookupResult> {
    const parsed = parseVerseKey(verseKey);
    return this.grammarStudyRepository.findByVerse(formatVerseKey(parsed));
  }
}
