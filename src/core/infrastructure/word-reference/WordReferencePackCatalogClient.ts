import Constants from 'expo-constants';

import catalogJson from '../../../../dist/word-reference-packs/catalog.json';

import {
  WORD_REFERENCE_PACK_SCHEMA_VERSION,
  type WordReferencePackCatalog,
  type WordReferencePackCatalogEntry,
} from './WordReferencePack.types';

const DEFAULT_CATALOG_URL =
  'https://cdn.appquran.com/word-reference-packs/catalog.json';

function catalogUrl(): string {
  const configured = Constants.expoConfig?.extra?.wordReferencePackCatalogUrl;
  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : DEFAULT_CATALOG_URL;
}

function compatiblePacks(catalog: WordReferencePackCatalog, url: string): WordReferencePackCatalogEntry[] {
  if (catalog.format !== 'quran-word-reference-catalog-v1' || !Array.isArray(catalog.packs)) {
    throw new Error('Dictionary catalog format is invalid');
  }

  return catalog.packs
    .filter(
      (entry) =>
        entry.kind === 'dictionary' &&
        entry.schemaVersion === WORD_REFERENCE_PACK_SCHEMA_VERSION &&
        Boolean(entry.packId?.trim()) &&
        Boolean(entry.sourceId?.trim()) &&
        Boolean(entry.languageCode?.trim()) &&
        /^[a-f0-9]{64}$/i.test(entry.databaseChecksumSha256)
    )
    .map((entry) => ({
      ...entry,
      manifestUrl: new URL(entry.manifestUrl, url).toString(),
      databaseUrl: new URL(entry.databaseUrl, url).toString(),
    }));
}

export function getBundledWordReferencePacks(): WordReferencePackCatalogEntry[] {
  return compatiblePacks(catalogJson as WordReferencePackCatalog, catalogUrl());
}

export class WordReferencePackCatalogClient {
  async listCompatiblePacksAsync(signal?: AbortSignal): Promise<WordReferencePackCatalogEntry[]> {
    let url = catalogUrl();
    let response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (response.status === 404 && url !== DEFAULT_CATALOG_URL) {
      url = DEFAULT_CATALOG_URL;
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    }
    if (!response.ok) throw new Error(`Dictionary catalog request failed (${response.status})`);
    return compatiblePacks((await response.json()) as WordReferencePackCatalog, url);
  }
}
