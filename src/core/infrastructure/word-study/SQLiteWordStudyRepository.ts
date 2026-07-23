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
  id: number;
  surah: number;
  ayah: number;
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
};

type MorphemeRow = {
  word_id: number;
  segment_index: number;
  arabic: string;
  segment_type: Morpheme['segmentType'];
  pos_code: string;
  features_json: string;
};

type LemmaRow = {
  id: number;
  arabic: string;
  normalized: string;
  pos_code: string | null;
  occurrence_count: number;
};

type RootRow = {
  id: number;
  arabic: string;
  normalized: string;
  occurrence_count: number;
  lemma_count: number;
};

type GlossRow = {
  word_id: number;
  language_code: string;
  text: string;
};

type SourceRoleRow = {
  source_role: 'morphology' | 'surface' | 'contextual-gloss';
  source_id: string;
  source_version: string;
};

type SourceRoles = Record<SourceRoleRow['source_role'], Omit<WordStudySourceReference, 'layer'>>;
type CountRow = { count: number };
type VerseCoordinate = { surah: number; ayah: number };

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

function source(
  value: Omit<WordStudySourceReference, 'layer'>,
  layer: WordStudySourceLayer
): WordStudySourceReference {
  return { ...value, layer };
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

function locationKey(row: Pick<WordRow, 'surah' | 'ayah' | 'word_position'>): string {
  return `${row.surah}:${row.ayah}:${row.word_position}`;
}

function verseKey(row: Pick<WordRow, 'surah' | 'ayah'>): string {
  return `${row.surah}:${row.ayah}`;
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
    return posCode === 'V' && !features.verbForm ? { ...features, verbForm: 'I' } : features;
  } catch {
    return posCode === 'V' ? { verbForm: 'I' } : {};
  }
}

function mapGloss(
  row: GlossRow,
  sourceRef: Omit<WordStudySourceReference, 'layer'>
): WordGloss {
  return {
    languageCode: row.language_code,
    text: row.text,
    source: source(sourceRef, 'contextual-gloss'),
  };
}

function mapLemma(
  row: LemmaRow,
  sourceRef: Omit<WordStudySourceReference, 'layer'>
): Lemma {
  return {
    id: String(row.id),
    arabic: row.arabic,
    normalized: row.normalized,
    ...(row.pos_code ? { posCode: row.pos_code } : {}),
    occurrenceCount: row.occurrence_count,
    source: source(sourceRef, 'lemma'),
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
  private sourceRolesPromise: Promise<SourceRoles> | null = null;

  constructor(
    private readonly databaseProvider: WordStudyDatabaseProvider,
    options: SQLiteWordStudyRepositoryOptions = {}
  ) {
    this.wordCache = new LruCache(options.wordCacheCapacity ?? 128);
    this.lemmaCache = new LruCache(options.lemmaCacheCapacity ?? 64);
    this.rootCache = new LruCache(options.rootCacheCapacity ?? 64);
  }

  findByLocation(location: string): Promise<WordStudyLookupResult>;
  findByLocation(location: string, options: WordStudyQueryOptions): Promise<WordStudyLookupResult>;
  async findByLocation(
    location: string,
    options: WordStudyQueryOptions = {}
  ): Promise<WordStudyLookupResult> {
    const canonical = parseWordStudyLocation(location);
    let pending = this.wordCache.get(canonical.locationKey);
    if (!pending) {
      pending = this.loadWordAsync(canonical.locationKey).catch((error) => {
        this.wordCache.delete(canonical.locationKey);
        throw error;
      });
      this.wordCache.set(canonical.locationKey, pending);
    }
    return cancellable(pending, options.signal);
  }

  findByVerse(key: string): Promise<readonly WordAnalysis[]>;
  findByVerse(key: string, options: WordStudyQueryOptions): Promise<readonly WordAnalysis[]>;
  async findByVerse(
    key: string,
    options: WordStudyQueryOptions = {}
  ): Promise<readonly WordAnalysis[]> {
    const canonical = parseVerseKey(key);
    throwIfCancelled(options.signal);
    const db = await this.databaseProvider.getDatabaseAsync();
    const rows = await cancellable(
      db.getAllAsync<Pick<WordRow, 'surah' | 'ayah' | 'word_position'>>(
        `SELECT surah, ayah, word_position FROM word_analysis
         WHERE surah = ? AND ayah = ? ORDER BY word_position`,
        [canonical.surah, canonical.ayah]
      ),
      options.signal
    );
    const results = await Promise.all(
      rows.map((row) => this.findByLocation(locationKey(row), options))
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
    const offset = parseCursor(query.cursor);
    const [countRow, sources] = await Promise.all([
      cancellable(
        db.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM word_analysis WHERE ${where}`, [
          parameter,
        ]),
        options.signal
      ),
      this.loadSourceRolesAsync(db),
    ]);
    const totalCount = countRow?.count ?? 0;
    const rows = await cancellable(
      db.getAllAsync<WordRow>(
        `SELECT * FROM word_analysis WHERE ${where}
         ORDER BY surah, ayah, word_position LIMIT ? OFFSET ?`,
        [parameter, query.limit, offset]
      ),
      options.signal
    );
    const wordIds = rows.map((row) => row.id);
    const verses = Array.from(
      new Map(rows.map((row) => [verseKey(row), { surah: row.surah, ayah: row.ayah }])).values()
    );
    const [glosses, verseSurfaceRows] = await Promise.all([
      this.loadGlossesForWordIdsAsync(db, wordIds),
      this.loadVerseSurfacesAsync(db, verses),
    ]);
    throwIfCancelled(options.signal);

    const glossesByWordId = new Map<number, GlossRow[]>();
    for (const gloss of glosses) {
      const current = glossesByWordId.get(gloss.word_id) ?? [];
      current.push(gloss);
      glossesByWordId.set(gloss.word_id, current);
    }
    const contextByVerse = new Map<string, string[]>();
    for (const verseWord of verseSurfaceRows) {
      const key = verseKey(verseWord);
      const current = contextByVerse.get(key) ?? [];
      current.push(verseWord.surface_uthmani);
      contextByVerse.set(key, current);
    }

    const items: WordOccurrence[] = rows.map((row) => {
      const rowGlosses = glossesByWordId.get(row.id) ?? [];
      return {
        location: parseWordStudyLocation(locationKey(row)),
        surfaceUthmani: row.surface_uthmani,
        normalizedSurface: row.normalized_surface,
        ayahContextUthmani: (contextByVerse.get(verseKey(row)) ?? []).join(' '),
        contextualGlosses: rowGlosses.map((gloss) => mapGloss(gloss, sources['contextual-gloss'])),
        sourceReferences: uniqueSources([
          source(sources.surface, 'surface'),
          ...(rowGlosses.length ? [source(sources['contextual-gloss'], 'contextual-gloss')] : []),
          source(sources.morphology, 'occurrence-index'),
        ]),
      };
    });
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
    const [rows, sources] = await Promise.all([
      cancellable(
        db.getAllAsync<LemmaRow>(
          `SELECT l.* FROM lemma l
           JOIN word_analysis wa ON wa.lemma_id = l.id
           WHERE wa.root_id = ?
           GROUP BY l.id ORDER BY l.occurrence_count DESC, l.id`,
          [databaseRootId]
        ),
        options.signal
      ),
      this.loadSourceRolesAsync(db),
    ]);
    return rows.map((row) => mapLemma(row, sources.morphology));
  }

  clearCache(): void {
    this.wordCache.clear();
    this.lemmaCache.clear();
    this.rootCache.clear();
    this.sourceRolesPromise = null;
  }

  getCacheStats(): { words: number; lemmas: number; roots: number } {
    return {
      words: this.wordCache.size,
      lemmas: this.lemmaCache.size,
      roots: this.rootCache.size,
    };
  }

  private async loadWordAsync(key: string): Promise<WordStudyLookupResult> {
    const canonical = parseWordStudyLocation(key);
    const db = await this.databaseProvider.getDatabaseAsync();
    const row = await db.getFirstAsync<WordRow>(
      `SELECT * FROM word_analysis
       WHERE surah = ? AND ayah = ? AND word_position = ? LIMIT 1`,
      [canonical.surah, canonical.ayah, canonical.wordPosition]
    );
    if (!row) {
      return {
        location: canonical,
        status: 'missing',
        reason: 'source-row-missing',
        sourceReferences: [],
      };
    }

    const sources = await this.loadSourceRolesAsync(db);
    const [morphemeRows, glossRows, lemma, root] = await Promise.all([
      db.getAllAsync<MorphemeRow>(
        'SELECT * FROM morpheme WHERE word_id = ? ORDER BY segment_index',
        [row.id]
      ),
      db.getAllAsync<GlossRow>(
        'SELECT * FROM word_gloss WHERE word_id = ? ORDER BY language_code',
        [row.id]
      ),
      row.lemma_id === null
        ? Promise.resolve(null)
        : this.loadLemmaAsync(db, row.lemma_id, sources.morphology),
      row.root_id === null
        ? Promise.resolve(null)
        : this.loadRootAsync(db, row.root_id, sources.morphology),
    ]);
    const morphologySource = source(sources.morphology, 'morphology');
    const segmentationSource = source(sources.morphology, 'segmentation');
    const morphemes: Morpheme[] = morphemeRows.map((item) => ({
      locationKey: canonical.locationKey,
      segmentIndex: item.segment_index,
      arabic: item.arabic,
      segmentType: item.segment_type,
      posCode: item.pos_code,
      features: parseMorphemeFeatures(item.features_json, item.pos_code),
      source: segmentationSource,
    }));
    const analysis: WordAnalysis = {
      location: canonical,
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
          ? { status: 'available', value: morphemes, source: segmentationSource }
          : { status: 'missing', reason: 'segmentation-not-provided', source: morphologySource },
      lemma: lemma
        ? { status: 'available', value: lemma, source: lemma.source }
        : { status: 'missing', reason: 'lemma-not-provided', source: morphologySource },
      root: root
        ? { status: 'available', value: root, source: root.source }
        : { status: 'unsupported', reason: rootMissingReason(row.primary_pos), source: morphologySource },
      contextualGlosses: glossRows.map((gloss) => mapGloss(gloss, sources['contextual-gloss'])),
      sourceReferences: uniqueSources([
        morphologySource,
        source(sources.surface, 'surface'),
        ...(glossRows.length ? [source(sources['contextual-gloss'], 'contextual-gloss')] : []),
        ...(lemma ? [lemma.source] : []),
        ...(root ? [root.source] : []),
      ]),
    };
    return analysis;
  }

  private loadLemmaAsync(
    db: WordStudyDatabase,
    id: number,
    sourceRef: Omit<WordStudySourceReference, 'layer'>
  ): Promise<Lemma | null> {
    let pending = this.lemmaCache.get(id);
    if (!pending) {
      pending = db
        .getFirstAsync<LemmaRow>('SELECT * FROM lemma WHERE id = ? LIMIT 1', [id])
        .then((row) => (row ? mapLemma(row, sourceRef) : null))
        .catch((error) => {
          this.lemmaCache.delete(id);
          throw error;
        });
      this.lemmaCache.set(id, pending);
    }
    return pending;
  }

  private loadRootAsync(
    db: WordStudyDatabase,
    id: number,
    sourceRef: Omit<WordStudySourceReference, 'layer'>
  ): Promise<Root | null> {
    let pending = this.rootCache.get(id);
    if (!pending) {
      pending = db
        .getFirstAsync<RootRow>('SELECT * FROM root WHERE id = ? LIMIT 1', [id])
        .then((row) =>
          row
            ? {
                id: String(row.id),
                arabic: row.arabic,
                normalized: row.normalized,
                occurrenceCount: row.occurrence_count,
                lemmaCount: row.lemma_count,
                source: source(sourceRef, 'root'),
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

  private async loadSourceRolesAsync(db: WordStudyDatabase): Promise<SourceRoles> {
    if (!this.sourceRolesPromise) {
      this.sourceRolesPromise = db
        .getAllAsync<SourceRoleRow>(
          `SELECT sr.source_role, sr.source_id, sm.version AS source_version
           FROM source_role sr JOIN source_metadata sm ON sm.source_id = sr.source_id`
        )
        .then((rows) => {
          const values = Object.fromEntries(
            rows.map((row) => [
              row.source_role,
              { sourceId: row.source_id, sourceVersion: row.source_version },
            ])
          ) as Partial<SourceRoles>;
          if (!values.morphology || !values.surface || !values['contextual-gloss']) {
            throw new Error('Word-study source-role metadata is incomplete');
          }
          return values as SourceRoles;
        })
        .catch((error) => {
          this.sourceRolesPromise = null;
          throw error;
        });
    }
    return this.sourceRolesPromise;
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
      const location = parseWordStudyLocation(query.locationKey);
      const row = await db.getFirstAsync<{ normalized_surface: string }>(
        `SELECT normalized_surface FROM word_analysis
         WHERE surah = ? AND ayah = ? AND word_position = ? LIMIT 1`,
        [location.surah, location.ayah, location.wordPosition]
      );
      normalizedSurface = row?.normalized_surface;
    }
    if (!normalizedSurface) {
      throw new Error('Surface occurrence queries require normalizedSurface or a known locationKey');
    }
    return { where: 'normalized_surface = ?', parameter: normalizedSurface };
  }

  private loadGlossesForWordIdsAsync(
    db: WordStudyDatabase,
    wordIds: readonly number[]
  ): Promise<GlossRow[]> {
    if (wordIds.length === 0) return Promise.resolve([]);
    const placeholders = wordIds.map(() => '?').join(',');
    return db.getAllAsync<GlossRow>(
      `SELECT * FROM word_gloss WHERE word_id IN (${placeholders}) ORDER BY word_id, language_code`,
      wordIds
    );
  }

  private loadVerseSurfacesAsync(
    db: WordStudyDatabase,
    verses: readonly VerseCoordinate[]
  ): Promise<WordRow[]> {
    if (verses.length === 0) return Promise.resolve([]);
    const conditions = verses.map(() => '(surah = ? AND ayah = ?)').join(' OR ');
    const parameters = verses.flatMap((item) => [item.surah, item.ayah]);
    return db.getAllAsync<WordRow>(
      `SELECT surah, ayah, word_position, surface_uthmani FROM word_analysis
       WHERE ${conditions} ORDER BY surah, ayah, word_position`,
      parameters
    );
  }
}
