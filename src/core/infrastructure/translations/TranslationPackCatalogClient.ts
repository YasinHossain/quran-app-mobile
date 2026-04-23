import type { HostedTranslationPackCatalog, HostedTranslationPackCatalogEntry } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
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

function mapCatalogEntry(value: unknown): HostedTranslationPackCatalogEntry | null {
  if (!isRecord(value)) return null;

  const translationId = asPositiveNumber(value.translationId);
  const name = asNonEmptyString(value.name);
  const authorName = asNonEmptyString(value.authorName);
  const languageName = asNonEmptyString(value.languageName);
  const version = asNonEmptyString(value.version);
  const downloadUrl = asNonEmptyString(value.downloadUrl);
  const checksum = asNonEmptyString(value.checksum);
  const sizeBytes = asPositiveNumber(value.sizeBytes);

  if (
    !translationId ||
    !name ||
    !authorName ||
    !languageName ||
    !version ||
    !downloadUrl ||
    !checksum ||
    !sizeBytes
  ) {
    return null;
  }

  const compatibility = mapCompatibility(value.compatibility);

  return {
    translationId,
    name,
    authorName,
    languageName,
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
    ...(asNonEmptyString(value.minAppVersion)
      ? { minAppVersion: asNonEmptyString(value.minAppVersion) ?? undefined }
      : {}),
    ...(asNonEmptyString(value.maxAppVersion)
      ? { maxAppVersion: asNonEmptyString(value.maxAppVersion) ?? undefined }
      : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

export function normalizeHostedTranslationPackCatalog(value: unknown): HostedTranslationPackCatalog {
  if (!isRecord(value) || !Array.isArray(value.packs)) {
    throw new Error('Hosted translation pack catalog is invalid');
  }

  const packs = value.packs
    .map(mapCatalogEntry)
    .filter((entry): entry is HostedTranslationPackCatalogEntry => entry !== null);

  if (packs.length === 0) {
    throw new Error('Hosted translation pack catalog is empty');
  }

  return {
    ...(asNonEmptyString(value.generatedAt)
      ? { generatedAt: asNonEmptyString(value.generatedAt) ?? undefined }
      : {}),
    packs,
  };
}

export class TranslationPackCatalogClient {
  async fetchCatalog(catalogUrl: string): Promise<HostedTranslationPackCatalog> {
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
      throw new Error(`Failed to fetch translation pack catalog (${response.status})`);
    }

    return normalizeHostedTranslationPackCatalog(await response.json());
  }
}
