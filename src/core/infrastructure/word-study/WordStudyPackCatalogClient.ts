import Constants from 'expo-constants';

import {
  WORD_STUDY_PACK_SCHEMA_VERSION,
  type WordStudyPackCatalog,
  type WordStudyPackCatalogEntry,
} from './WordStudyPack.types';

const RAW_CATALOG_URL =
  'https://raw.githubusercontent.com/YasinHossain/quran-app-mobile/gh-pages/word-study-packs/catalog.json';

function catalogUrl(): string {
  const value = Constants.expoConfig?.extra?.wordStudyPackCatalogUrl;
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : RAW_CATALOG_URL;
}

export class WordStudyPackCatalogClient {
  async listCompatiblePacksAsync(signal?: AbortSignal): Promise<WordStudyPackCatalogEntry[]> {
    let url = catalogUrl();
    let response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (response.status === 404 && url !== RAW_CATALOG_URL) {
      url = RAW_CATALOG_URL;
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    }
    if (!response.ok) throw new Error(`Word-study pack catalog request failed (${response.status})`);
    const catalog = (await response.json()) as WordStudyPackCatalog;
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
        manifestUrl: new URL(entry.manifestUrl, url).toString(),
        databaseUrl: new URL(entry.databaseUrl, url).toString(),
      }));
  }
}
