import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { IDictionaryReferenceRepository } from '@/src/core/domain/repositories/IDictionaryReferenceRepository';
import type {
  DictionaryEntryDetail,
  DictionaryEntrySummary,
  DictionaryLookupQuery,
  DictionaryLookupResult,
  DictionaryMatchKind,
  DictionarySource,
} from '@/src/core/domain/word-study';

import { WordReferencePackInstaller } from './WordReferencePackInstaller';

type EntryRow = {
  entry_id: string;
  parent_entry_id: string | null;
  headword_arabic: string;
  normalized_headword: string;
  is_root: number;
  sequence: number;
  definition?: string;
  definition_format?: 'plain-text' | 'sanitized-html';
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Dictionary lookup canceled');
}

function summary(row: EntryRow, matchKind: DictionaryMatchKind): DictionaryEntrySummary {
  return {
    entryId: row.entry_id,
    ...(row.parent_entry_id ? { parentEntryId: row.parent_entry_id } : {}),
    headwordArabic: row.headword_arabic,
    normalizedHeadword: row.normalized_headword,
    isRoot: row.is_root === 1,
    sequence: row.sequence,
    matchKind,
  };
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(',');
}

export class SQLiteDictionaryReferenceRepository implements IDictionaryReferenceRepository {
  private readonly databases = new Map<string, Promise<{ version: string; db: SQLiteDatabase }>>();

  constructor(private readonly installer: WordReferencePackInstaller) {}

  async listInstalledSources(): Promise<readonly DictionarySource[]> {
    return (await this.installer.listInstalledAsync()).map((pack) => ({
      packId: pack.packId,
      sourceId: pack.manifest.source.sourceId,
      title: pack.manifest.source.title,
      languageCode: pack.manifest.source.languageCode,
      version: pack.version,
      attribution: pack.manifest.source.attribution,
      url: pack.manifest.source.url,
    }));
  }

  async findReferences(
    query: DictionaryLookupQuery,
    options: { readonly signal?: AbortSignal } = {}
  ): Promise<DictionaryLookupResult> {
    throwIfAborted(options.signal);
    const [source, db] = await Promise.all([
      this.source(query.packId),
      this.database(query.packId),
    ]);
    throwIfAborted(options.signal);

    const exactRows = query.lemmaNormalized
      ? await db.getAllAsync<EntryRow>(
          `SELECT e.entry_id,e.parent_entry_id,e.headword_arabic,e.normalized_headword,e.is_root,e.sequence
           FROM quran_lookup q JOIN dictionary_entry e ON e.entry_id=q.entry_id
           WHERE q.kind='lemma' AND q.normalized_key=? ORDER BY q.rank,e.sequence;`,
          [query.lemmaNormalized]
        )
      : [];
    throwIfAborted(options.signal);
    const rootRows = query.rootNormalized
      ? await db.getAllAsync<EntryRow>(
          `SELECT e.entry_id,e.parent_entry_id,e.headword_arabic,e.normalized_headword,e.is_root,e.sequence
           FROM quran_lookup q JOIN dictionary_entry e ON e.entry_id=q.entry_id
           WHERE q.kind='root' AND q.normalized_key=? ORDER BY q.rank,e.sequence;`,
          [query.rootNormalized]
        )
      : [];
    throwIfAborted(options.signal);

    const rootIds = rootRows.map((row) => row.entry_id);
    const exactIds = new Set(exactRows.map((row) => row.entry_id));
    const familyRows = rootIds.length
      ? await db.getAllAsync<EntryRow>(
          `SELECT entry_id,parent_entry_id,headword_arabic,normalized_headword,is_root,sequence
           FROM dictionary_entry
           WHERE parent_entry_id IN (${placeholders(rootIds)}) AND is_root=0
           ORDER BY sequence;`,
          rootIds
        )
      : [];
    throwIfAborted(options.signal);
    return {
      source,
      query,
      exactLemmaEntries: exactRows.map((row) => summary(row, 'lemma-exact')),
      rootEntries: rootRows.map((row) => summary(row, 'root-article')),
      rootFamilyEntries: familyRows
        .filter((row) => !exactIds.has(row.entry_id))
        .map((row) => summary(row, 'root-family')),
    };
  }

  async getEntry(
    packId: string,
    entryId: string,
    matchKind: DictionaryMatchKind,
    options: { readonly signal?: AbortSignal } = {}
  ): Promise<DictionaryEntryDetail | null> {
    throwIfAborted(options.signal);
    const db = await this.database(packId);
    const row = await db.getFirstAsync<EntryRow>(
      `SELECT entry_id,parent_entry_id,headword_arabic,normalized_headword,is_root,sequence,definition,definition_format
       FROM dictionary_entry WHERE entry_id=? LIMIT 1;`,
      [entryId]
    );
    throwIfAborted(options.signal);
    if (!row) return null;
    return {
      ...summary(row, matchKind),
      definition: row.definition ?? '',
      definitionFormat: row.definition_format ?? 'plain-text',
    };
  }

  async closePack(packId: string): Promise<void> {
    const pending = this.databases.get(packId);
    this.databases.delete(packId);
    if (pending) await (await pending).db.closeAsync();
  }

  private async source(packId: string): Promise<DictionarySource> {
    const pack = await this.installer.resolveAsync(packId);
    return {
      packId,
      sourceId: pack.manifest.source.sourceId,
      title: pack.manifest.source.title,
      languageCode: pack.manifest.source.languageCode,
      version: pack.version,
      attribution: pack.manifest.source.attribution,
      url: pack.manifest.source.url,
    };
  }

  private async database(packId: string): Promise<SQLiteDatabase> {
    const pack = await this.installer.resolveAsync(packId);
    const cached = this.databases.get(packId);
    if (cached) {
      const resolved = await cached;
      if (resolved.version === pack.version) return resolved.db;
      await resolved.db.closeAsync();
      this.databases.delete(packId);
    }
    const opening = openDatabaseAsync(
      pack.manifest.databaseFile,
      { useNewConnection: true },
      pack.databaseDirectoryUri
    ).then(async (db) => {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA foreign_keys=ON;');
      return { version: pack.version, db };
    }).catch((error) => {
      this.databases.delete(packId);
      throw error;
    });
    this.databases.set(packId, opening);
    return (await opening).db;
  }
}
