import type { IVerbReferenceRepository } from '../../domain/repositories/IVerbReferenceRepository';
import type {
  VerbPrincipalParts,
  VerbReference,
  VerbReferenceLookupResult,
  VerbReferenceQuery,
} from '../../domain/word-study';

import type { VerbReferenceDatabaseProvider } from './VerbReferenceDatabase';

type VerbReferenceRow = {
  root_arabic: string;
  root_normalized: string;
  pattern_code: string;
  verb_form: string;
  perfect: string | null;
  normalized_perfect: string | null;
  imperfect: string | null;
  imperative: string | null;
  active_participle: string | null;
  passive_participle: string | null;
  verbal_noun: string | null;
  source_id: string;
  source_version: string;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Verb reference lookup canceled');
}

function parts(row: VerbReferenceRow): VerbPrincipalParts {
  return {
    perfect: row.perfect,
    imperfect: row.imperfect,
    imperative: row.imperative,
    activeParticiple: row.active_participle,
    passiveParticiple: row.passive_participle,
    verbalNoun: row.verbal_noun,
  };
}

function sameParts(left: VerbReferenceRow, right: VerbReferenceRow): boolean {
  return JSON.stringify(parts(left)) === JSON.stringify(parts(right));
}

function reference(row: VerbReferenceRow): VerbReference {
  return {
    rootArabic: row.root_arabic,
    rootNormalized: row.root_normalized,
    verbForm: row.verb_form,
    patternCode: row.pattern_code,
    principalParts: parts(row),
    source: {
      sourceId: row.source_id,
      sourceVersion: row.source_version,
      layer: 'verb-reference',
    },
  };
}

export class SQLiteVerbReferenceRepository implements IVerbReferenceRepository {
  constructor(private readonly databaseProvider: VerbReferenceDatabaseProvider) {}

  async findByVerb(
    query: VerbReferenceQuery,
    options: { readonly signal?: AbortSignal } = {}
  ): Promise<VerbReferenceLookupResult> {
    throwIfAborted(options.signal);
    let database;
    try {
      database = await this.databaseProvider.getDatabaseAsync();
    } catch {
      return { status: 'unavailable', reason: 'verb-reference-pack-unavailable' };
    }
    const rows = await database.getAllAsync<VerbReferenceRow>(
      `SELECT root_arabic,root_normalized,pattern_code,verb_form,perfect,normalized_perfect,
              imperfect,imperative,active_participle,passive_participle,verbal_noun,
              source_id,source_version
       FROM verb_reference
       WHERE root_normalized=? AND verb_form=?
       ORDER BY pattern_code,normalized_perfect,id`,
      [query.rootNormalized, query.verbForm]
    );
    throwIfAborted(options.signal);
    if (!rows.length) return { status: 'missing', reason: 'source-row-missing' };

    const exact = query.lemmaNormalized
      ? rows.filter((row) => row.normalized_perfect === query.lemmaNormalized)
      : [];
    const candidates = exact.length ? exact : rows;
    if (candidates.length === 1 || candidates.every((row) => sameParts(row, candidates[0]!))) {
      return reference(candidates[0]!);
    }
    return { status: 'missing', reason: 'ambiguous-reference' };
  }
}
