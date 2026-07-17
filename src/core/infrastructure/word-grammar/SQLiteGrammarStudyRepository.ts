import type { IGrammarStudyRepository } from '../../domain/repositories/IGrammarStudyRepository';
import {
  formatVerseKey,
  parseVerseKey,
  type GrammarPassage,
  type GrammarStudyLookupResult,
} from '../../domain/word-study';

import type { GrammarStudyDatabaseProvider } from './GrammarStudyDatabase';

type AnalysisRow = {
  verse_key: string;
  source_id: string;
  source_version: string;
  review_status: 'source-provided' | 'reviewed' | 'unreviewed';
};

type PassageRow = {
  sequence: number;
  heading_ar: string;
  body_ar: string;
};

export class SQLiteGrammarStudyRepository implements IGrammarStudyRepository {
  constructor(private readonly databaseProvider: GrammarStudyDatabaseProvider) {}

  async findByVerse(verseKey: string): Promise<GrammarStudyLookupResult> {
    const normalizedVerseKey = formatVerseKey(parseVerseKey(verseKey));
    let database;
    try {
      database = await this.databaseProvider.getDatabaseAsync();
    } catch {
      return {
        verseKey: normalizedVerseKey,
        status: 'unavailable',
        reason: 'grammar-pack-unavailable',
      };
    }
    const analysis = await database.getFirstAsync<AnalysisRow>(
      `SELECT verse_key, source_id, source_version, review_status
       FROM grammar_analysis WHERE verse_key = ? LIMIT 1`,
      [normalizedVerseKey]
    );
    if (!analysis) {
      return {
        verseKey: normalizedVerseKey,
        status: 'missing',
        reason: 'source-row-missing',
      };
    }
    const rows = await database.getAllAsync<PassageRow>(
      `SELECT sequence, heading_ar, body_ar
       FROM grammar_passage WHERE verse_key = ? ORDER BY sequence`,
      [normalizedVerseKey]
    );
    const passages: GrammarPassage[] = rows.map((row) => ({
      sequence: row.sequence,
      headingArabic: row.heading_ar,
      bodyArabic: row.body_ar,
    }));
    return {
      verseKey: analysis.verse_key,
      passages,
      source: {
        sourceId: analysis.source_id,
        sourceVersion: analysis.source_version,
        layer: 'grammar',
      },
      reviewStatus: analysis.review_status,
    };
  }
}
