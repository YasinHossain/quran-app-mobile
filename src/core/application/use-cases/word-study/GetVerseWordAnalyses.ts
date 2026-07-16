import type { IWordStudyRepository } from '../../../domain/repositories/IWordStudyRepository';
import type { WordAnalysis } from '../../../domain/word-study';
import { formatVerseKey, parseVerseKey } from '../../../domain/word-study';

export class GetVerseWordAnalyses {
  constructor(private readonly wordStudyRepository: IWordStudyRepository) {}

  execute(verse: string | { readonly surah: number; readonly ayah: number }): Promise<readonly WordAnalysis[]> {
    const verseKey =
      typeof verse === 'string'
        ? parseVerseKey(verse).verseKey
        : formatVerseKey(verse);
    return this.wordStudyRepository.findByVerse(verseKey);
  }
}
