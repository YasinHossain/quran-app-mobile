import type { IWordStudyRepository } from '../../../domain/repositories/IWordStudyRepository';
import type { WordStudyLookupResult } from '../../../domain/word-study';
import {
  formatWordStudyLocation,
  parseWordStudyLocation,
  type WordStudyLocationInput,
} from '../../../domain/word-study';

export class GetWordAnalysis {
  constructor(private readonly wordStudyRepository: IWordStudyRepository) {}

  execute(location: string | WordStudyLocationInput): Promise<WordStudyLookupResult> {
    const locationKey =
      typeof location === 'string'
        ? parseWordStudyLocation(location).locationKey
        : formatWordStudyLocation(location);
    return this.wordStudyRepository.findByLocation(locationKey);
  }
}
