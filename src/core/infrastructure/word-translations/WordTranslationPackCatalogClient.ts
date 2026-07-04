import type {
  HostedWordTranslationPackCatalog,
  HostedWordTranslationPackCatalogEntry,
} from '@/types';

import {
  asNonEmptyString,
  asPositiveNumber,
} from '@/src/core/infrastructure/hosted-pack/hostedPackSupport';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapCatalogEntry(value: unknown): HostedWordTranslationPackCatalogEntry | null {
  if (!isRecord(value)) return null;

  const languageCode = asNonEmptyString(value.languageCode)?.toLowerCase();
  const name = asNonEmptyString(value.name);
  const version = asNonEmptyString(value.version);
  const downloadUrl = asNonEmptyString(value.downloadUrl);
  const checksum = asNonEmptyString(value.checksum);
  const sizeBytes = asPositiveNumber(value.sizeBytes);

  if (!languageCode || !name || !version || !downloadUrl || !checksum || !sizeBytes) {
    return null;
  }

  return {
    languageCode,
    name,
    version,
    downloadUrl,
    checksum,
    sizeBytes,
    ...(asPositiveNumber(value.totalVerses)
      ? { totalVerses: asPositiveNumber(value.totalVerses) }
      : {}),
    ...(asNonEmptyString(value.manifestUrl)
      ? { manifestUrl: asNonEmptyString(value.manifestUrl) ?? undefined }
      : {}),
    ...(asNonEmptyString(value.manifestChecksum)
      ? { manifestChecksum: asNonEmptyString(value.manifestChecksum) ?? undefined }
      : {}),
    ...(asPositiveNumber(value.manifestSizeBytes)
      ? { manifestSizeBytes: asPositiveNumber(value.manifestSizeBytes) }
      : {}),
  };
}

export function normalizeHostedWordTranslationPackCatalog(
  value: unknown
): HostedWordTranslationPackCatalog {
  if (!isRecord(value) || !Array.isArray(value.packs)) {
    throw new Error('Hosted word translation pack catalog is invalid');
  }

  const packs = value.packs
    .map(mapCatalogEntry)
    .filter((entry): entry is HostedWordTranslationPackCatalogEntry => entry !== null);

  if (packs.length === 0) {
    throw new Error('Hosted word translation pack catalog is empty');
  }

  return {
    ...(asNonEmptyString(value.generatedAt)
      ? { generatedAt: asNonEmptyString(value.generatedAt) ?? undefined }
      : {}),
    packs,
  };
}

export class WordTranslationPackCatalogClient {
  async fetchCatalog(catalogUrl: string): Promise<HostedWordTranslationPackCatalog> {
    const normalizedCatalogUrl = asNonEmptyString(catalogUrl);
    if (!normalizedCatalogUrl) {
      throw new Error('catalogUrl is required');
    }

    const response = await fetch(normalizedCatalogUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch word translation pack catalog (${response.status})`);
    }

    return normalizeHostedWordTranslationPackCatalog(await response.json());
  }
}
