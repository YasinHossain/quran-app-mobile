import type {
  HostedMushafPackCatalog,
  HostedMushafPackCatalogEntry,
  MushafPackId,
  MushafPackRemoteFile,
} from '@/types';

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

function mapRemoteFile(value: unknown): MushafPackRemoteFile | null {
  if (!isRecord(value)) return null;

  const file = asNonEmptyString(value.file);
  if (!file) return null;

  return {
    file,
    ...(asNonEmptyString(value.url) ? { url: asNonEmptyString(value.url) ?? undefined } : {}),
    ...(asNonEmptyString(value.checksum)
      ? { checksum: asNonEmptyString(value.checksum) ?? undefined }
      : {}),
    ...(asPositiveNumber(value.sizeBytes) ? { sizeBytes: asPositiveNumber(value.sizeBytes) } : {}),
  };
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
    ? Object.fromEntries(entries) as Record<string, string | number | boolean | null>
    : undefined;
}

function mapCatalogEntry(value: unknown): HostedMushafPackCatalogEntry | null {
  if (!isRecord(value)) return null;

  const packId = asNonEmptyString(value.packId);
  const version = asNonEmptyString(value.version);
  const renderer = asNonEmptyString(value.renderer);
  const script = asNonEmptyString(value.script);
  const lines = asPositiveNumber(value.lines);
  const downloadUrl = asNonEmptyString(value.downloadUrl);
  const checksum = asNonEmptyString(value.checksum);
  const sizeBytes = asPositiveNumber(value.sizeBytes);

  if (!packId || !version || !renderer || !script || !lines || !downloadUrl || !checksum || !sizeBytes) {
    return null;
  }

  const files = Array.isArray(value.files)
    ? value.files.map(mapRemoteFile).filter((file): file is MushafPackRemoteFile => file !== null)
    : undefined;
  const compatibility = mapCompatibility(value.compatibility);

  return {
    packId: packId as MushafPackId,
    version,
    renderer: renderer as HostedMushafPackCatalogEntry['renderer'],
    script: script as HostedMushafPackCatalogEntry['script'],
    lines,
    downloadUrl,
    checksum,
    sizeBytes,
    ...(asPositiveNumber(value.totalPages) ? { totalPages: asPositiveNumber(value.totalPages) } : {}),
    ...(asNonEmptyString(value.manifestUrl)
      ? { manifestUrl: asNonEmptyString(value.manifestUrl) ?? undefined }
      : {}),
    ...(asNonEmptyString(value.manifestChecksum)
      ? { manifestChecksum: asNonEmptyString(value.manifestChecksum) ?? undefined }
      : {}),
    ...(asPositiveNumber(value.manifestSizeBytes)
      ? { manifestSizeBytes: asPositiveNumber(value.manifestSizeBytes) }
      : {}),
    ...(files && files.length > 0 ? { files } : {}),
    ...(asNonEmptyString(value.minAppVersion)
      ? { minAppVersion: asNonEmptyString(value.minAppVersion) ?? undefined }
      : {}),
    ...(asNonEmptyString(value.maxAppVersion)
      ? { maxAppVersion: asNonEmptyString(value.maxAppVersion) ?? undefined }
      : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

export function normalizeHostedMushafPackCatalog(value: unknown): HostedMushafPackCatalog {
  if (!isRecord(value) || !Array.isArray(value.packs)) {
    throw new Error('Hosted mushaf catalog is invalid');
  }

  const packs = value.packs
    .map(mapCatalogEntry)
    .filter((entry): entry is HostedMushafPackCatalogEntry => entry !== null);

  if (packs.length === 0) {
    throw new Error('Hosted mushaf catalog is empty');
  }

  return {
    ...(asNonEmptyString(value.generatedAt)
      ? { generatedAt: asNonEmptyString(value.generatedAt) ?? undefined }
      : {}),
    packs,
  };
}

export class MushafPackCatalogClient {
  async fetchCatalog(catalogUrl: string): Promise<HostedMushafPackCatalog> {
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
      throw new Error(`Failed to fetch mushaf pack catalog (${response.status})`);
    }

    return normalizeHostedMushafPackCatalog(await response.json());
  }

  async listPacks(catalogUrl: string): Promise<HostedMushafPackCatalogEntry[]> {
    return (await this.fetchCatalog(catalogUrl)).packs;
  }

  async getPack(
    catalogUrl: string,
    params: { packId: MushafPackId; version?: string | undefined }
  ): Promise<HostedMushafPackCatalogEntry | null> {
    const version = asNonEmptyString(params.version);
    const packs = await this.listPacks(catalogUrl);

    const matching = packs.filter((entry) => entry.packId === params.packId);
    if (matching.length === 0) return null;

    if (!version) {
      return matching[0] ?? null;
    }

    return matching.find((entry) => entry.version === version) ?? null;
  }
}
