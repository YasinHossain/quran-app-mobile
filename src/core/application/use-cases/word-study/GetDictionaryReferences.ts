import type { IDictionaryReferenceRepository } from '../../../domain/repositories/IDictionaryReferenceRepository';
import type {
  DictionaryLookupResult,
  WordAnalysis,
} from '../../../domain/word-study';

export class GetDictionaryReferences {
  constructor(private readonly repository: IDictionaryReferenceRepository) {}

  execute(
    analysis: WordAnalysis,
    packId: string,
    options?: { readonly signal?: AbortSignal }
  ): Promise<DictionaryLookupResult> {
    const lemmaNormalized =
      analysis.lemma.status === 'available' ? analysis.lemma.value.normalized : undefined;
    const rootNormalized =
      analysis.root.status === 'available' ? analysis.root.value.normalized : undefined;
    return this.repository.findReferences(
      {
        packId,
        ...(lemmaNormalized ? { lemmaNormalized } : {}),
        ...(rootNormalized ? { rootNormalized } : {}),
      },
      options
    );
  }
}
