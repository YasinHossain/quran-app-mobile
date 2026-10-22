import Constants from 'expo-constants';

import catalogJson from '../../../../dist/verb-reference-packs/catalog.json';

import {
  VERB_REFERENCE_PACK_SCHEMA_VERSION,
  type VerbReferencePackCatalog,
  type VerbReferencePackCatalogEntry,
} from './VerbReferencePack.types';

const DEFAULT_CATALOG_URL =
  'https://cdn.appquran.com/verb-reference-packs/catalog.json';

function catalogUrl(): string {
  const configured = Constants.expoConfig?.extra?.verbReferencePackCatalogUrl;
  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : DEFAULT_CATALOG_URL;
}

function compatiblePacks(
  catalog: VerbReferencePackCatalog,
  url: string
): VerbReferencePackCatalogEntry[] {
  if (catalog.format !== 'quran-verb-reference-catalog-v1' || !Array.isArray(catalog.packs)) {
    throw new Error('Verb reference catalog format is invalid');
  }

  return catalog.packs
    .filter(
      (entry) =>
        entry.schemaVersion === VERB_REFERENCE_PACK_SCHEMA_VERSION &&
        Boolean(entry.packId?.trim()) &&
        Boolean(entry.version?.trim()) &&
        Boolean(entry.sourceId?.trim()) &&
        Number.isInteger(entry.databaseSizeBytes) &&
        /^[a-f0-9]{64}$/i.test(entry.databaseChecksumSha256)
    )
    .map((entry) => ({
      ...entry,
      manifestUrl: new URL(entry.manifestUrl, url).toString(),
      databaseUrl: new URL(entry.databaseUrl, url).toString(),
    }));
}

/**
 * Release catalog bundled with the app, like the other Word Study packs. It lists no
 * packs until one is published, which keeps every verb-reference download offer hidden.
 */
export function getBundledVerbReferencePacks(): VerbReferencePackCatalogEntry[] {
  return compatiblePacks(catalogJson as VerbReferencePackCatalog, catalogUrl());
}
