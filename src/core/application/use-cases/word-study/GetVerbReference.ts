import type { IVerbReferenceRepository } from '../../../domain/repositories/IVerbReferenceRepository';
import type {
  MorphologyFeatures,
  VerbReferenceLookupResult,
  WordAnalysis,
} from '../../../domain/word-study';

function encounteredVerbForm(analysis: WordAnalysis): string | undefined {
  if (analysis.morphology.status === 'available' && analysis.morphology.value.verbForm) {
    return analysis.morphology.value.verbForm;
  }
  if (analysis.morphemes.status !== 'available') return undefined;
  return analysis.morphemes.value
    .map((segment) => segment.features)
    .find((features: MorphologyFeatures) => features.verbForm)?.verbForm;
}

export class GetVerbReference {
  constructor(private readonly repository: IVerbReferenceRepository) {}

  execute(
    analysis: WordAnalysis,
    options?: { readonly signal?: AbortSignal }
  ): Promise<VerbReferenceLookupResult> {
    if (analysis.primaryPos.status !== 'available' || analysis.primaryPos.value !== 'V') {
      return Promise.resolve({ status: 'unavailable', reason: 'not-a-verb' });
    }
    if (analysis.root.status !== 'available') {
      return Promise.resolve({ status: 'missing', reason: 'root-not-provided' });
    }
    const verbForm = encounteredVerbForm(analysis);
    if (!verbForm) {
      return Promise.resolve({ status: 'missing', reason: 'verb-form-not-provided' });
    }
    const lemmaNormalized =
      analysis.lemma.status === 'available' ? analysis.lemma.value.normalized : undefined;
    return this.repository.findByVerb(
      {
        rootNormalized: analysis.root.value.normalized,
        ...(lemmaNormalized ? { lemmaNormalized } : {}),
        verbForm,
      },
      options
    );
  }
}
