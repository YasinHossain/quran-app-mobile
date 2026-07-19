import type {
  VerbReferenceLookupResult,
  VerbReferenceQuery,
} from '../word-study';

export interface IVerbReferenceRepository {
  findByVerb(
    query: VerbReferenceQuery,
    options?: { readonly signal?: AbortSignal }
  ): Promise<VerbReferenceLookupResult>;
}
