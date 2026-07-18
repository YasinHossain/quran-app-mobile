import type {
  DictionaryEntryDetail,
  DictionaryLookupQuery,
  DictionaryLookupResult,
  DictionarySource,
} from '../word-study';

export interface IDictionaryReferenceRepository {
  listInstalledSources(): Promise<readonly DictionarySource[]>;
  findReferences(
    query: DictionaryLookupQuery,
    options?: { readonly signal?: AbortSignal }
  ): Promise<DictionaryLookupResult>;
  getEntry(
    packId: string,
    entryId: string,
    matchKind: DictionaryEntryDetail['matchKind'],
    options?: { readonly signal?: AbortSignal }
  ): Promise<DictionaryEntryDetail | null>;
  closePack(packId: string): Promise<void>;
}
