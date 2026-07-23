import Constants from 'expo-constants';

import {
  WORD_GRAMMAR_PACK_SCHEMA_VERSION,
  type WordGrammarPackCatalog,
  type WordGrammarPackCatalogEntry,
} from './WordGrammarPack.types';

const RAW_CATALOG_URL =
  'https://raw.githubusercontent.com/YasinHossain/quran-app-mobile/gh-pages/word-grammar-packs/catalog.json';

function catalogUrl(): string {
  const configured = Constants.expoConfig?.extra?.wordGrammarPackCatalogUrl;
  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : RAW_CATALOG_URL;
}

export class WordGrammarPackCatalogClient {
  async listCompatiblePacksAsync(signal?: AbortSignal): Promise<WordGrammarPackCatalogEntry[]> {
    let url = catalogUrl();
    let response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (response.status === 404 && url !== RAW_CATALOG_URL) {
      url = RAW_CATALOG_URL;
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    }
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Grammar catalog request failed (${response.status})`);
    const catalog = (await response.json()) as WordGrammarPackCatalog;
    if (catalog.format !== 'quran-word-grammar-catalog-v1' || !Array.isArray(catalog.packs)) {
      throw new Error('Grammar catalog format is invalid');
    }
    return catalog.packs
      .filter(
        (entry) =>
          entry.schemaVersion === WORD_GRAMMAR_PACK_SCHEMA_VERSION &&
          Boolean(entry.packId?.trim()) &&
          Boolean(entry.version?.trim()) &&
          Boolean(entry.sourceId?.trim()) &&
          /^[a-f0-9]{64}$/i.test(entry.databaseChecksumSha256)
      )
      .map((entry) => ({
        ...entry,
        manifestUrl: new URL(entry.manifestUrl, url).toString(),
        databaseUrl: new URL(entry.databaseUrl, url).toString(),
      }));
  }
}
