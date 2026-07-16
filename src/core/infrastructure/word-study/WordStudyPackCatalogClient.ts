import Constants from 'expo-constants';

import {
  WORD_STUDY_PACK_SCHEMA_VERSION,
  type WordStudyPackCatalog,
  type WordStudyPackCatalogEntry,
} from './WordStudyPack.types';

function catalogUrl(): string {
  const value = Constants.expoConfig?.extra?.wordStudyPackCatalogUrl;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Word-study pack catalog URL is not configured');
  }
  return value.trim();
}

export class WordStudyPackCatalogClient {
  async listCompatiblePacksAsync(signal?: AbortSignal): Promise<WordStudyPackCatalogEntry[]> {
    const url = catalogUrl();
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
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
