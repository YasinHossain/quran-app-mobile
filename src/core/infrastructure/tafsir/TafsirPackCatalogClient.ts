import type { HostedTafsirPackCatalog, HostedTafsirPackCatalogEntry } from '@/types';

import {
  asNonEmptyString,
  asPositiveNumber,
} from '@/src/core/infrastructure/hosted-pack/hostedPackSupport';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapCompatibility(
  value: unknown
): Record<string, string | number | boolean | null> | undefined {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value).filter(([, compatibilityValue]) => {
    return (
      typeof compatibilityValue === 'string' ||
      typeof compatibilityValue === 'number' ||
      typeof compatibilityValue === 'boolean' ||
      compatibilityValue === null
    );
  });

  return entries.length > 0
    ? (Object.fromEntries(entries) as Record<string, string | number | boolean | null>)
    : undefined;
}

function mapCatalogEntry(value: unknown): HostedTafsirPackCatalogEntry | null {
  if (!isRecord(value)) return null;

  const tafsirId = asPositiveNumber(value.tafsirId);
  const name = asNonEmptyString(value.name);
  const authorName = asNonEmptyString(value.authorName);
  const languageName = asNonEmptyString(value.languageName);
  const version = asNonEmptyString(value.version);
  const downloadUrl = asNonEmptyString(value.downloadUrl);
  const checksum = asNonEmptyString(value.checksum);
  const sizeBytes = asPositiveNumber(value.sizeBytes);

  if (!tafsirId || !name || !authorName || !languageName || !version || !downloadUrl || !checksum || !sizeBytes) {
    return null;
  }

  const compatibility = mapCompatibility(value.compatibility);

  return {
    tafsirId,
    name,
    authorName,
    languageName,
    version,
    downloadUrl,
    checksum,
    sizeBytes,
    ...(asPositiveNumber(value.totalVerses) ? { totalVerses: asPositiveNumber(value.totalVerses) } : {}),
    ...(asNonEmptyString(value.manifestUrl) ? { manifestUrl: asNonEmptyString(value.manifestUrl) ?? undefined } : {}),
    ...(asNonEmptyString(value.manifestChecksum)
      ? { manifestChecksum: asNonEmptyString(value.manifestChecksum) ?? undefined }
      : {}),
    ...(asPositiveNumber(value.manifestSizeBytes)
      ? { manifestSizeBytes: asPositiveNumber(value.manifestSizeBytes) }
      : {}),
    ...(asNonEmptyString(value.minAppVersion)
      ? { minAppVersion: asNonEmptyString(value.minAppVersion) ?? undefined }
      : {}),
    ...(asNonEmptyString(value.maxAppVersion)
      ? { maxAppVersion: asNonEmptyString(value.maxAppVersion) ?? undefined }
      : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

export function normalizeHostedTafsirPackCatalog(value: unknown): HostedTafsirPackCatalog {
  if (!isRecord(value) || !Array.isArray(value.packs)) {
    throw new Error('Hosted tafsir pack catalog is invalid');
  }

  const packs = value.packs
    .map(mapCatalogEntry)
    .filter((entry): entry is HostedTafsirPackCatalogEntry => entry !== null);

  if (packs.length === 0) {
    throw new Error('Hosted tafsir pack catalog is empty');
  }

  return {
    ...(asNonEmptyString(value.generatedAt)
      ? { generatedAt: asNonEmptyString(value.generatedAt) ?? undefined }
      : {}),
    packs,
  };
}

export class TafsirPackCatalogClient {
  async fetchCatalog(catalogUrl: string): Promise<HostedTafsirPackCatalog> {
    const normalizedCatalogUrl = asNonEmptyString(catalogUrl);
    if (!normalizedCatalogUrl) {
      throw new Error('catalogUrl is required');
    }

    const response = await fetch(normalizedCatalogUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tafsir pack catalog (${response.status})`);
    }

    return normalizeHostedTafsirPackCatalog(await response.json());
  }
}
