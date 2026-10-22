import Constants from 'expo-constants';

import catalogJson from '../../../../dist/word-study-packs/catalog.json';

import {
  WORD_STUDY_PACK_SCHEMA_VERSION,
  wordStudyPackAssetUrl,
  type WordStudyPackCatalog,
  type WordStudyPackCatalogEntry,
} from './WordStudyPack.types';

const DEFAULT_CATALOG_URL =
  'https://cdn.appquran.com/word-study-packs/catalog.json';

function catalogUrl(): string {
  const value = Constants.expoConfig?.extra?.wordStudyPackCatalogUrl;
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_CATALOG_URL;
}

function compatiblePacks(catalog: WordStudyPackCatalog, url: string): WordStudyPackCatalogEntry[] {
  if (catalog.format !== 'quran-word-study-catalog-v1' || !Array.isArray(catalog.packs)) {
    throw new Error('Word-study pack catalog format is invalid');
  }

  return catalog.packs
    .filter(
      (entry) =>
        entry.schemaVersion === WORD_STUDY_PACK_SCHEMA_VERSION &&
        Boolean(entry.packId?.trim()) &&
        Boolean(entry.version?.trim()) &&
        /^[a-f0-9]{64}$/i.test(entry.databaseChecksumSha256)
    )
    .map((entry) => ({
      ...entry,
      manifestUrl: wordStudyPackAssetUrl(entry.manifestUrl, url, entry),
      databaseUrl: wordStudyPackAssetUrl(entry.databaseUrl, url, entry),
    }));
}

export function getBundledWordStudyPacks(): WordStudyPackCatalogEntry[] {
  return compatiblePacks(catalogJson as WordStudyPackCatalog, catalogUrl());
}

export class WordStudyPackCatalogClient {
  async listCompatiblePacksAsync(signal?: AbortSignal): Promise<WordStudyPackCatalogEntry[]> {
    let url = catalogUrl();
    let response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (response.status === 404 && url !== DEFAULT_CATALOG_URL) {
      url = DEFAULT_CATALOG_URL;
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    }
    if (!response.ok) throw new Error(`Word-study pack catalog request failed (${response.status})`);
    return compatiblePacks((await response.json()) as WordStudyPackCatalog, url);
  }
}
