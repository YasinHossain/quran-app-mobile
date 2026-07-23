import translationsJson from '../../src/data/translations.json';

import { BUNDLED_SAHIH_TRANSLATION_ID, BUNDLED_SAHIH_TRANSLATOR_NAME } from './bundledFallback';

type TranslationMetadata = {
  id: number;
  name: string;
  authorName?: string;
};

const translationsById = new Map<number, TranslationMetadata>(
  (translationsJson as TranslationMetadata[]).map((translation) => [
    translation.id,
    translation,
  ])
);

export function getSpotlightTranslationAttribution(translationId: number): string {
  if (translationId === BUNDLED_SAHIH_TRANSLATION_ID) {
    return BUNDLED_SAHIH_TRANSLATOR_NAME;
  }

  const metadata = translationsById.get(translationId);
  return metadata?.name.trim() || `Translation ${translationId}`;
}
