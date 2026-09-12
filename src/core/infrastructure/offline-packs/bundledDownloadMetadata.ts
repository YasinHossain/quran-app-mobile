import translationCatalogJson from '../../../../dist/translation-packs/catalog.json';
import wordTranslationCatalogJson from '../../../../dist/word-translation-packs/catalog.json';

type SizedCatalogEntry = {
  readonly sizeBytes?: number;
};

type TranslationCatalogEntry = SizedCatalogEntry & {
  readonly translationId?: number;
};

type WordTranslationCatalogEntry = SizedCatalogEntry & {
  readonly languageCode?: string;
};

const translationSizeBytesById = new Map<number, number>(
  (translationCatalogJson.packs as TranslationCatalogEntry[]).flatMap((entry) =>
    typeof entry.translationId === 'number' &&
    typeof entry.sizeBytes === 'number' &&
    entry.sizeBytes > 0
      ? [[entry.translationId, entry.sizeBytes] as const]
      : []
  )
);

const wordTranslationSizeBytesByLanguage = new Map<string, number>(
  (wordTranslationCatalogJson.packs as WordTranslationCatalogEntry[]).flatMap((entry) =>
    typeof entry.languageCode === 'string' &&
    typeof entry.sizeBytes === 'number' &&
    entry.sizeBytes > 0
      ? [[entry.languageCode.trim().toLowerCase(), entry.sizeBytes] as const]
      : []
  )
);

// These published pack sizes are release metadata, not values that need to be
// fetched or recalculated when a confirmation sheet opens.
const tafsirSizeBytesById = new Map<number, number>([
  [165, 9_481_416],
  [169, 11_264_624],
]);

const mushafSizeBytesByPackId = new Map<string, number>([
  ['qcf-madani-v1', 28_227_018],
  ['qcf-madani-v2', 28_227_616],
  ['qcf-tajweed-v4', 28_150_963],
  ['qpc-uthmani-hafs', 28_151_107],
  ['unicode-indopak-15', 28_151_128],
  ['unicode-indopak-16', 28_151_128],
]);

export function getBundledTranslationDownloadSizeBytes(translationId: number): number | null {
  return translationSizeBytesById.get(translationId) ?? null;
}

export function getBundledTafsirDownloadSizeBytes(tafsirId: number): number | null {
  return tafsirSizeBytesById.get(tafsirId) ?? null;
}

export function getBundledWordTranslationDownloadSizeBytes(languageCode: string): number | null {
  return wordTranslationSizeBytesByLanguage.get(languageCode.trim().toLowerCase()) ?? null;
}

export function getBundledMushafDownloadSizeBytes(packId: string): number | null {
  return mushafSizeBytesByPackId.get(packId) ?? null;
}
