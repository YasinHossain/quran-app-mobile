import type { IWordStudyRepository } from '../../domain/repositories/IWordStudyRepository';
import {
  isWordAnalysis,
  parseVerseKey,
  parseWordStudyLocation,
  type Lemma,
  type Morpheme,
  type MorphologyFeatures,
  type PaginatedWordOccurrences,
  type Root,
  type WordAnalysis,
  type WordGloss,
  type WordOccurrence,
  type WordOccurrenceQuery,
  type WordStudyLookupResult,
  type WordStudySourceLayer,
  type WordStudySourceReference,
} from '../../domain/word-study';

import { LruCache } from './LruCache';
import type { WordStudyDatabase, WordStudyDatabaseProvider } from './WordStudyDatabase';

type WordRow = {
  location: string;
  verse_key: string;
  word_position: number;
  surface_uthmani: string;
  normalized_surface: string;
  lemma_id: number | null;
  root_id: number | null;
  primary_pos: string | null;
  verb_form: string | null;
  aspect: MorphologyFeatures['aspect'] | null;
  mood: MorphologyFeatures['mood'] | null;
  voice: MorphologyFeatures['voice'] | null;
  person: MorphologyFeatures['person'] | null;
  gender: MorphologyFeatures['gender'] | null;
  number: MorphologyFeatures['number'] | null;
  grammatical_case: MorphologyFeatures['grammaticalCase'] | null;
  grammatical_state: MorphologyFeatures['grammaticalState'] | null;
  derivation: string | null;
  source_id: string;
  source_version: string;
};

type MorphemeRow = {
  location: string;
  segment_index: number;
  arabic: string;
  segment_type: Morpheme['segmentType'];
  pos_code: string;
  features_json: string;
  source_id: string;
  source_version: string;
};

type LemmaRow = {
  id: number;
  arabic: string;
  normalized: string;
  pos_code: string | null;
  occurrence_count: number;
  source_id: string;
  source_version: string;
};

type RootRow = {
  id: number;
  arabic: string;
  normalized: string;
  occurrence_count: number;
  lemma_count: number;
  source_id: string;
  source_version: string;
};

type GlossRow = {
  location: string;
  language_code: string;
  text: string;
  source_id: string;
  source_version: string;
};

type AnalysisSourceRow = {
  location: string;
  source_id: string;
  source_version: string;
  source_role: string;
};

type CountRow = { count: number };

type VerseSurfaceRow = {
  verse_key: string;
  word_position: number;
  surface_uthmani: string;
};

export interface WordStudyQueryOptions {
  readonly signal?: AbortSignal;
}

export interface SQLiteWordStudyRepositoryOptions {
  readonly wordCacheCapacity?: number;
  readonly lemmaCacheCapacity?: number;
  readonly rootCacheCapacity?: number;
}

export class WordStudyQueryCancelledError extends Error {
  constructor() {
    super('Word-study query was cancelled');
    this.name = 'WordStudyQueryCancelledError';
  }
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new WordStudyQueryCancelledError();
}

async function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfCancelled(signal);
  if (!signal) return promise;

  return await new Promise<T>((resolve, reject) => {
    const cancel = (): void => reject(new WordStudyQueryCancelledError());
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      }
    );
  });
}

function source(sourceId: string, sourceVersion: string, layer: WordStudySourceLayer) {
  return { sourceId, sourceVersion, layer } satisfies WordStudySourceReference;
}

function mapSourceRole(role: string): WordStudySourceLayer {
  switch (role) {
    case 'surface':
      return 'surface';
    case 'contextual-gloss':
      return 'contextual-gloss';
    default:
      return 'morphology';
  }
}

function uniqueSources(sources: readonly WordStudySourceReference[]): WordStudySourceReference[] {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.sourceId}\u0000${item.sourceVersion}\u0000${item.layer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactFeatures(row: WordRow): MorphologyFeatures {
  return {
    ...(row.aspect ? { aspect: row.aspect } : {}),
    ...(row.mood ? { mood: row.mood } : {}),
    ...(row.voice ? { voice: row.voice } : {}),
    ...(row.person ? { person: row.person } : {}),
    ...(row.gender ? { gender: row.gender } : {}),
    ...(row.number ? { number: row.number } : {}),
    ...(row.grammatical_case ? { grammaticalCase: row.grammatical_case } : {}),
    ...(row.grammatical_state ? { grammaticalState: row.grammatical_state } : {}),
    ...(row.verb_form
      ? { verbForm: row.verb_form }
      : row.primary_pos === 'V'
        ? { verbForm: 'I' }
        : {}),
    ...(row.derivation ? { derivation: row.derivation } : {}),
  };
}

function parseMorphemeFeatures(raw: string, posCode: string): MorphologyFeatures {
  try {
    const value = JSON.parse(raw) as unknown;
    const features = value && typeof value === 'object' ? (value as MorphologyFeatures) : {};
    return posCode === 'V' && !features.verbForm
      ? { ...features, verbForm: 'I' }
      : features;
  } catch {
    return posCode === 'V' ? { verbForm: 'I' } : {};
  }
}

function mapGloss(row: GlossRow): WordGloss {
  return {
    languageCode: row.language_code,
    text: row.text,
    source: source(row.source_id, row.source_version, 'contextual-gloss'),
  };
}

function mapLemma(row: LemmaRow): Lemma {
  return {
    id: String(row.id),
    arabic: row.arabic,
    normalized: row.normalized,
    ...(row.pos_code ? { posCode: row.pos_code } : {}),
    occurrenceCount: row.occurrence_count,
    source: source(row.source_id, row.source_version, 'lemma'),
  };
}

const ROOTLESS_PARTICLE_POS_CODES = new Set([
  'P',
  'CONJ',
  'SUB',
  'ACC',
  'NEG',
  'EMPH',
  'INTG',
  'COND',
  'CERT',
  'VOC',
  'INL',
  'PART',
]);

function rootMissingReason(primaryPos: string | null) {
  if (primaryPos === 'PN') return 'proper-noun-root-absent' as const;
  if (primaryPos === 'N' || primaryPos === 'V' || primaryPos === 'ADJ' || primaryPos === 'VN') {
    return 'root-not-provided' as const;
  }
  if (primaryPos && ROOTLESS_PARTICLE_POS_CODES.has(primaryPos)) {
    return 'particle-has-no-root' as const;
  }
  return 'not-applicable' as const;
}

function parseCursor(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error('Word occurrence cursor is invalid');
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) throw new Error('Word occurrence cursor is invalid');
  return offset;
}

function positiveDatabaseId(value: string, fieldName: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${fieldName} must be a positive integer`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${fieldName} must be a positive integer`);
  return result;
}

export class SQLiteWordStudyRepository implements IWordStudyRepository {
  private readonly wordCache: LruCache<string, Promise<WordStudyLookupResult>>;
  private readonly lemmaCache: LruCache<number, Promise<Lemma | null>>;
  private readonly rootCache: LruCache<number, Promise<Root | null>>;

  constructor(
    private readonly databaseProvider: WordStudyDatabaseProvider,
    options: SQLiteWordStudyRepositoryOptions = {}
  ) {
    this.wordCache = new LruCache(options.wordCacheCapacity ?? 128);
    this.lemmaCache = new LruCache(options.lemmaCacheCapacity ?? 64);
    this.rootCache = new LruCache(options.rootCacheCapacity ?? 64);
  }

  findByLocation(locationKey: string): Promise<WordStudyLookupResult>;
  findByLocation(
    locationKey: string,
    options: WordStudyQueryOptions
  ): Promise<WordStudyLookupResult>;
  async findByLocation(
    locationKey: string,
    options: WordStudyQueryOptions = {}
  ): Promise<WordStudyLookupResult> {
    const canonicalLocation = parseWordStudyLocation(locationKey);
    let pending = this.wordCache.get(canonicalLocation.locationKey);
    if (!pending) {
      pending = this.loadWordAsync(canonicalLocation.locationKey).catch((error) => {
        this.wordCache.delete(canonicalLocation.locationKey);
        throw error;
      });
      this.wordCache.set(canonicalLocation.locationKey, pending);
    }
    return cancellable(pending, options.signal);
  }

  findByVerse(verseKey: string): Promise<readonly WordAnalysis[]>;
  findByVerse(
    verseKey: string,
    options: WordStudyQueryOptions
  ): Promise<readonly WordAnalysis[]>;
  async findByVerse(
    verseKey: string,
    options: WordStudyQueryOptions = {}
  ): Promise<readonly WordAnalysis[]> {
    const canonicalVerseKey = parseVerseKey(verseKey).verseKey;
    throwIfCancelled(options.signal);
    const db = await this.databaseProvider.getDatabaseAsync();
    const rows = await cancellable(
      db.getAllAsync<Pick<WordRow, 'location'>>(
        'SELECT location FROM word_analysis WHERE verse_key = ? ORDER BY word_position;',
        [canonicalVerseKey]
      ),
      options.signal
    );
    const results = await Promise.all(
      rows.map((row) => this.findByLocation(row.location, options))
    );
    return results.filter(isWordAnalysis);
  }

  findOccurrences(query: WordOccurrenceQuery): Promise<PaginatedWordOccurrences>;
  findOccurrences(
    query: WordOccurrenceQuery,
    options: WordStudyQueryOptions
  ): Promise<PaginatedWordOccurrences>;
  async findOccurrences(
    query: WordOccurrenceQuery,
    options: WordStudyQueryOptions = {}
  ): Promise<PaginatedWordOccurrences> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      throw new Error('Word occurrence limit must be between 1 and 100');
    }
    throwIfCancelled(options.signal);
    const db = await this.databaseProvider.getDatabaseAsync();
    const { where, parameter } = await this.resolveOccurrencePredicateAsync(db, query);
    throwIfCancelled(options.signal);
    const offset = parseCursor(query.cursor);
    const countRow = await cancellable(
      db.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM word_analysis WHERE ${where};`, [
        parameter,
      ]),
      options.signal
    );
    const totalCount = countRow?.count ?? 0;
    const rows = await cancellable(
      db.getAllAsync<WordRow>(
        `
        SELECT * FROM word_analysis
        WHERE ${where}
        ORDER BY
          CAST(substr(verse_key, 1, instr(verse_key, ':') - 1) AS INTEGER),
          CAST(substr(verse_key, instr(verse_key, ':') + 1) AS INTEGER),
          word_position
        LIMIT ? OFFSET ?;
        `,
        [parameter, query.limit, offset]
      ),
      options.signal
    );
    const locations = rows.map((row) => row.location);
    const verseKeys = [...new Set(rows.map((row) => row.verse_key))];
    const [glosses, sourceRows, verseSurfaceRows] = await Promise.all([
      this.loadGlossesForLocationsAsync(db, locations),
      this.loadSourcesForLocationsAsync(db, locations),
      this.loadVerseSurfacesAsync(db, verseKeys),
    ]);
    throwIfCancelled(options.signal);

    const glossesByLocation = new Map<string, GlossRow[]>();
    for (const gloss of glosses) {
      const current = glossesByLocation.get(gloss.location) ?? [];
      current.push(gloss);
      glossesByLocation.set(gloss.location, current);
    }
    const sourcesByLocation = new Map<string, AnalysisSourceRow[]>();
    for (const sourceRow of sourceRows) {
      const current = sourcesByLocation.get(sourceRow.location) ?? [];
      current.push(sourceRow);
      sourcesByLocation.set(sourceRow.location, current);
    }
    const contextByVerse = new Map<string, string[]>();
    for (const verseWord of verseSurfaceRows) {
      const current = contextByVerse.get(verseWord.verse_key) ?? [];
      current.push(verseWord.surface_uthmani);
      contextByVerse.set(verseWord.verse_key, current);
    }
    const items: WordOccurrence[] = rows.map((row) => ({
      location: parseWordStudyLocation(row.location),
      surfaceUthmani: row.surface_uthmani,
      normalizedSurface: row.normalized_surface,
      ayahContextUthmani: (contextByVerse.get(row.verse_key) ?? []).join(' '),
      contextualGlosses: (glossesByLocation.get(row.location) ?? []).map(mapGloss),
      sourceReferences: uniqueSources(
        [
          ...(sourcesByLocation.get(row.location) ?? []).map((item) =>
            source(item.source_id, item.source_version, mapSourceRole(item.source_role))
          ),
          source(row.source_id, row.source_version, 'occurrence-index'),
        ]
      ),
    }));
    const nextOffset = offset + items.length;
    const hasNextPage = nextOffset < totalCount;
    return {
      query,
      items,
      pageInfo: {
        limit: query.limit,
        hasNextPage,
        totalCount,
        ...(hasNextPage ? { nextCursor: String(nextOffset) } : {}),
      },
    };
  }

  findLemmasByRoot(rootId: string): Promise<readonly Lemma[]>;
  findLemmasByRoot(
    rootId: string,
    options: WordStudyQueryOptions
  ): Promise<readonly Lemma[]>;
  async findLemmasByRoot(
    rootId: string,
    options: WordStudyQueryOptions = {}
  ): Promise<readonly Lemma[]> {
    const databaseRootId = positiveDatabaseId(rootId, 'rootId');
    throwIfCancelled(options.signal);
    const db = await this.databaseProvider.getDatabaseAsync();
    const rows = await cancellable(
      db.getAllAsync<LemmaRow>(
        `
        SELECT l.*
        FROM lemma l
        JOIN word_analysis wa ON wa.lemma_id = l.id
        WHERE wa.root_id = ?
        GROUP BY l.id
        ORDER BY l.occurrence_count DESC, l.id;
        `,
        [databaseRootId]
      ),
      options.signal
    );
    return rows.map(mapLemma);
  }

  clearCache(): void {
    this.wordCache.clear();
    this.lemmaCache.clear();
    this.rootCache.clear();
  }

  getCacheStats(): { words: number; lemmas: number; roots: number } {
    return {
      words: this.wordCache.size,
      lemmas: this.lemmaCache.size,
      roots: this.rootCache.size,
    };
  }

  private async loadWordAsync(locationKey: string): Promise<WordStudyLookupResult> {
    const db = await this.databaseProvider.getDatabaseAsync();
    const row = await db.getFirstAsync<WordRow>(
      'SELECT * FROM word_analysis WHERE location = ? LIMIT 1;',
      [locationKey]
    );
    if (!row) {
      return {
        location: parseWordStudyLocation(locationKey),
        status: 'missing',
        reason: 'source-row-missing',
        sourceReferences: [],
      };
    }

    const [morphemeRows, glossRows, sourceRows, lemma, root] = await Promise.all([
      db.getAllAsync<MorphemeRow>(
        'SELECT * FROM morpheme WHERE location = ? ORDER BY segment_index;',
        [locationKey]
      ),
      db.getAllAsync<GlossRow>(
        'SELECT * FROM word_gloss WHERE location = ? ORDER BY language_code, source_id;',
        [locationKey]
      ),
      db.getAllAsync<AnalysisSourceRow>(
        `
        SELECT was.location, was.source_id, sm.version AS source_version, was.source_role
        FROM word_analysis_source was
        JOIN source_metadata sm ON sm.source_id = was.source_id
        WHERE was.location = ?
        ORDER BY was.source_role, was.source_id;
        `,
        [locationKey]
      ),
      row.lemma_id === null ? Promise.resolve(null) : this.loadLemmaAsync(db, row.lemma_id),
      row.root_id === null ? Promise.resolve(null) : this.loadRootAsync(db, row.root_id),
    ]);
    const morphologySource = source(row.source_id, row.source_version, 'morphology');
    const morphemes: Morpheme[] = morphemeRows.map((item) => ({
      locationKey: item.location,
      segmentIndex: item.segment_index,
      arabic: item.arabic,
      segmentType: item.segment_type,
      posCode: item.pos_code,
      features: parseMorphemeFeatures(item.features_json, item.pos_code),
      source: source(item.source_id, item.source_version, 'segmentation'),
    }));
    const analysis: WordAnalysis = {
      location: parseWordStudyLocation(row.location),
      surfaceUthmani: row.surface_uthmani,
      normalizedSurface: row.normalized_surface,
      primaryPos: row.primary_pos
        ? { status: 'available', value: row.primary_pos, source: morphologySource }
        : { status: 'missing', reason: 'source-row-missing', source: morphologySource },
      morphology: {
        status: 'available',
        value: compactFeatures(row),
        source: morphologySource,
      },
      morphemes:
        morphemes.length > 0
          ? { status: 'available', value: morphemes, source: source(row.source_id, row.source_version, 'segmentation') }
          : { status: 'missing', reason: 'segmentation-not-provided', source: morphologySource },
      lemma: lemma
        ? { status: 'available', value: lemma, source: lemma.source }
        : { status: 'missing', reason: 'lemma-not-provided', source: morphologySource },
      root: root
        ? { status: 'available', value: root, source: root.source }
        : { status: 'unsupported', reason: rootMissingReason(row.primary_pos), source: morphologySource },
      contextualGlosses: glossRows.map(mapGloss),
      sourceReferences: uniqueSources([
        ...sourceRows.map((item) =>
          source(item.source_id, item.source_version, mapSourceRole(item.source_role))
        ),
        ...(lemma ? [lemma.source] : []),
        ...(root ? [root.source] : []),
      ]),
    };
    return analysis;
  }

  private loadLemmaAsync(db: WordStudyDatabase, id: number): Promise<Lemma | null> {
    let pending = this.lemmaCache.get(id);
    if (!pending) {
      pending = db
        .getFirstAsync<LemmaRow>('SELECT * FROM lemma WHERE id = ? LIMIT 1;', [id])
        .then((row) => (row ? mapLemma(row) : null))
        .catch((error) => {
          this.lemmaCache.delete(id);
          throw error;
        });
      this.lemmaCache.set(id, pending);
    }
    return pending;
  }

  private loadRootAsync(db: WordStudyDatabase, id: number): Promise<Root | null> {
    let pending = this.rootCache.get(id);
    if (!pending) {
      pending = db
        .getFirstAsync<RootRow>('SELECT * FROM root WHERE id = ? LIMIT 1;', [id])
        .then((row) =>
          row
            ? {
                id: String(row.id),
                arabic: row.arabic,
                normalized: row.normalized,
                occurrenceCount: row.occurrence_count,
                lemmaCount: row.lemma_count,
                source: source(row.source_id, row.source_version, 'root'),
              }
            : null
        )
        .catch((error) => {
          this.rootCache.delete(id);
          throw error;
        });
      this.rootCache.set(id, pending);
    }
    return pending;
  }

  private async resolveOccurrencePredicateAsync(
    db: WordStudyDatabase,
    query: WordOccurrenceQuery
  ): Promise<{ where: string; parameter: string | number }> {
    if (query.scope === 'lemma') {
      if (!query.lemmaId) throw new Error('Lemma occurrence queries require lemmaId');
      return { where: 'lemma_id = ?', parameter: positiveDatabaseId(query.lemmaId, 'lemmaId') };
    }
    if (query.scope === 'root') {
      if (!query.rootId) throw new Error('Root occurrence queries require rootId');
      return { where: 'root_id = ?', parameter: positiveDatabaseId(query.rootId, 'rootId') };
    }
    let normalizedSurface = query.normalizedSurface?.trim();
    if (!normalizedSurface && query.locationKey) {
      const location = parseWordStudyLocation(query.locationKey).locationKey;
      const row = await db.getFirstAsync<{ normalized_surface: string }>(
        'SELECT normalized_surface FROM word_analysis WHERE location = ? LIMIT 1;',
        [location]
      );
      normalizedSurface = row?.normalized_surface;
    }
    if (!normalizedSurface) {
      throw new Error('Surface occurrence queries require normalizedSurface or a known locationKey');
    }
    return { where: 'normalized_surface = ?', parameter: normalizedSurface };
  }

  private loadGlossesForLocationsAsync(
    db: WordStudyDatabase,
    locations: readonly string[]
  ): Promise<GlossRow[]> {
    if (locations.length === 0) return Promise.resolve([]);
    const placeholders = locations.map(() => '?').join(',');
    return db.getAllAsync<GlossRow>(
      `SELECT * FROM word_gloss WHERE location IN (${placeholders}) ORDER BY location, language_code, source_id;`,
      locations
    );
  }

  private loadSourcesForLocationsAsync(
    db: WordStudyDatabase,
    locations: readonly string[]
  ): Promise<AnalysisSourceRow[]> {
    if (locations.length === 0) return Promise.resolve([]);
    const placeholders = locations.map(() => '?').join(',');
    return db.getAllAsync<AnalysisSourceRow>(
      `
      SELECT was.location, was.source_id, sm.version AS source_version, was.source_role
      FROM word_analysis_source was
      JOIN source_metadata sm ON sm.source_id = was.source_id
      WHERE was.location IN (${placeholders})
      ORDER BY was.location, was.source_role, was.source_id;
      `,
      locations
    );
  }

  private loadVerseSurfacesAsync(
    db: WordStudyDatabase,
    verseKeys: readonly string[]
  ): Promise<VerseSurfaceRow[]> {
    if (verseKeys.length === 0) return Promise.resolve([]);
    const placeholders = verseKeys.map(() => '?').join(',');
    return db.getAllAsync<VerseSurfaceRow>(
      `
      SELECT verse_key, word_position, surface_uthmani
      FROM word_analysis
      WHERE verse_key IN (${placeholders})
      ORDER BY verse_key, word_position;
      `,
      verseKeys
    );
  }
}
