import type { ILogger } from '@/src/core/domain/interfaces/ILogger';
import type { ITafsirOfflineStore } from '@/src/core/domain/repositories/ITafsirOfflineStore';
import type {
  ITafsirPackRepository,
  TafsirPackAvailability,
  TafsirPackInstallPhase,
  TafsirPackInstallProgress,
} from '@/src/core/domain/repositories/ITafsirPackRepository';
import type {
  HostedTafsirPackCatalog,
  HostedTafsirPackCatalogEntry,
  TafsirPackManifest,
  TafsirPackPayload,
  TafsirPackPayloadVerse,
} from '@/types';

import {
  asNonEmptyString,
  clampPercent,
  downloadHostedPackFileAsync,
  normalizePositiveInt,
  normalizeRelativePath,
  readHostedPackJsonFileAsync,
  resolveHostedPackUrl,
  verifyDownloadedFileAsync,
} from '@/src/core/infrastructure/hosted-pack/hostedPackSupport';

import { TafsirPackCatalogClient } from './TafsirPackCatalogClient';
import { TafsirPackFileStore } from './TafsirPackFileStore';
import { getTafsirPackCatalogUrl } from './tafsirPackCatalogConfig';

const MANIFEST_WEIGHT = 10;
const PAYLOAD_WEIGHT = 45;
const IMPORT_WEIGHT = 45;
const IMPORT_BATCH_SIZE = 250;

function resolveManifestUrl(entry: HostedTafsirPackCatalogEntry, catalogUrl: string): string {
  const explicitManifestUrl = entry.manifestUrl?.trim();
  if (explicitManifestUrl) {
    return resolveHostedPackUrl(catalogUrl, explicitManifestUrl);
  }

  return new URL('manifest.json', resolveHostedPackUrl(catalogUrl, entry.downloadUrl)).toString();
}

function toOverallPercent(phase: TafsirPackInstallPhase, phasePercent: number): number {
  const clampedPhasePercent = clampPercent(phasePercent);

  if (phase === 'manifest') {
    return (clampedPhasePercent / 100) * MANIFEST_WEIGHT;
  }

  if (phase === 'payload') {
    return MANIFEST_WEIGHT + (clampedPhasePercent / 100) * PAYLOAD_WEIGHT;
  }

  return MANIFEST_WEIGHT + PAYLOAD_WEIGHT + (clampedPhasePercent / 100) * IMPORT_WEIGHT;
}

function toProgress(
  phase: TafsirPackInstallPhase,
  phasePercent: number,
  activeFile: string
): TafsirPackInstallProgress {
  return {
    phase,
    percent: clampPercent(toOverallPercent(phase, phasePercent)),
    activeFile,
  };
}

function ensureManifestMatchesCatalog(
  entry: HostedTafsirPackCatalogEntry,
  manifest: TafsirPackManifest
): void {
  if (manifest.tafsirId !== entry.tafsirId) {
    throw new Error(
      `Hosted tafsir manifest ID mismatch: expected ${entry.tafsirId}, received ${manifest.tafsirId}`
    );
  }

  if (manifest.version.trim() !== entry.version.trim()) {
    throw new Error(
      `Hosted tafsir manifest version mismatch: expected ${entry.version}, received ${manifest.version}`
    );
  }

  if (!manifest.payloadFile.trim()) {
    throw new Error('Hosted tafsir manifest payloadFile is required');
  }

  if (typeof entry.totalVerses === 'number' && manifest.totalVerses !== entry.totalVerses) {
    throw new Error(
      `Hosted tafsir manifest verse count mismatch: expected ${entry.totalVerses}, received ${manifest.totalVerses}`
    );
  }
}

function mapPayloadVerse(value: unknown): TafsirPackPayloadVerse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const verseKey = asNonEmptyString(record.verseKey);
  const html = typeof record.html === 'string' ? record.html : String(record.html ?? '');

  if (!verseKey) {
    return null;
  }

  return {
    verseKey,
    html,
  };
}

function ensurePayloadMatchesManifest(
  manifest: TafsirPackManifest,
  payload: TafsirPackPayload
): TafsirPackPayloadVerse[] {
  if (payload.tafsirId !== manifest.tafsirId) {
    throw new Error(
      `Installed tafsir payload ID mismatch: expected ${manifest.tafsirId}, received ${payload.tafsirId}`
    );
  }

  if (payload.version.trim() !== manifest.version.trim()) {
    throw new Error(
      `Installed tafsir payload version mismatch: expected ${manifest.version}, received ${payload.version}`
    );
  }

  if (payload.format !== manifest.format) {
    throw new Error(
      `Installed tafsir payload format mismatch: expected ${manifest.format}, received ${payload.format}`
    );
  }

  const verses = Array.isArray(payload.verses)
    ? payload.verses
        .map((verse) => mapPayloadVerse(verse))
        .filter((verse): verse is TafsirPackPayloadVerse => verse !== null)
    : [];

  if (verses.length === 0) {
    throw new Error('Hosted tafsir payload is empty');
  }

  if (manifest.totalVerses > 0 && verses.length !== manifest.totalVerses) {
    throw new Error(
      `Hosted tafsir payload verse count mismatch: expected ${manifest.totalVerses}, received ${verses.length}`
    );
  }

  return verses;
}

type ResolvedCatalogPack = {
  catalogUrl: string;
  entry: HostedTafsirPackCatalogEntry;
};

export class HostedTafsirPackRepository implements ITafsirPackRepository {
  private readonly catalogClient: TafsirPackCatalogClient;
  private readonly fileStore: TafsirPackFileStore;
  private cachedCatalogUrl: string | null = null;
  private cachedCatalog: HostedTafsirPackCatalog | null = null;
  private loadingCatalogPromise: Promise<HostedTafsirPackCatalog | null> | null = null;

  constructor(
    private readonly tafsirOfflineStore: ITafsirOfflineStore,
    private readonly logger?: ILogger
  ) {
    this.catalogClient = new TafsirPackCatalogClient();
    this.fileStore = new TafsirPackFileStore();
  }

  async getPackAvailability(tafsirId: number): Promise<TafsirPackAvailability | null> {
    const resolved = await this.getResolvedPack(tafsirId);
    if (!resolved) return null;

    return {
      tafsirId: resolved.entry.tafsirId,
      name: resolved.entry.name,
      authorName: resolved.entry.authorName,
      languageName: resolved.entry.languageName,
      version: resolved.entry.version,
      sizeBytes: resolved.entry.sizeBytes,
      ...(typeof resolved.entry.totalVerses === 'number'
        ? { totalVerses: resolved.entry.totalVerses }
        : {}),
    };
  }

  async installPack(params: {
    tafsirId: number;
    onProgress?: ((progress: TafsirPackInstallProgress) => void) | undefined;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<boolean> {
    const tafsirId = normalizePositiveInt(params.tafsirId);
    if (tafsirId <= 0) {
      throw new Error('tafsirId must be a positive integer');
    }

    const resolved = await this.getResolvedPack(tafsirId);
    if (!resolved) return false;

    params.assertNotCanceled?.();

    const temporaryDirectory = await this.fileStore.prepareTemporaryPackDirectoryAsync(
      tafsirId,
      resolved.entry.version
    );

    try {
      const manifestUrl = resolveManifestUrl(resolved.entry, resolved.catalogUrl);
      const manifestUri = `${temporaryDirectory}manifest.json`;

      params.onProgress?.(toProgress('manifest', 0, 'manifest.json'));
      await downloadHostedPackFileAsync(manifestUrl, manifestUri, (progress) => {
        params.onProgress?.(toProgress('manifest', progress.percent ?? 0, 'manifest.json'));
      });
      await verifyDownloadedFileAsync(manifestUri, {
        checksum: resolved.entry.manifestChecksum,
        sizeBytes: resolved.entry.manifestSizeBytes,
      });

      params.assertNotCanceled?.();

      const manifest = await readHostedPackJsonFileAsync<TafsirPackManifest>(manifestUri);
      ensureManifestMatchesCatalog(resolved.entry, manifest);
      params.onProgress?.(toProgress('manifest', 100, 'manifest.json'));

      const normalizedPayloadFile = normalizeRelativePath(manifest.payloadFile);
      const payloadUrl = resolveHostedPackUrl(resolved.catalogUrl, resolved.entry.downloadUrl);
      const payloadUri = `${temporaryDirectory}${normalizedPayloadFile}`;

      params.onProgress?.(toProgress('payload', 0, normalizedPayloadFile));
      await downloadHostedPackFileAsync(payloadUrl, payloadUri, (progress) => {
        params.onProgress?.(toProgress('payload', progress.percent ?? 0, normalizedPayloadFile));
      });
      await verifyDownloadedFileAsync(payloadUri, {
        checksum: resolved.entry.checksum ?? manifest.payloadChecksum,
        sizeBytes: resolved.entry.sizeBytes ?? manifest.payloadSizeBytes,
      });

      params.assertNotCanceled?.();

      const payload = await readHostedPackJsonFileAsync<TafsirPackPayload>(payloadUri);
      const verses = ensurePayloadMatchesManifest(manifest, payload);
      params.onProgress?.(toProgress('payload', 100, normalizedPayloadFile));

      await this.tafsirOfflineStore.deleteTafsir(tafsirId);

      const totalVerses = verses.length;
      let processed = 0;

      for (let start = 0; start < verses.length; start += IMPORT_BATCH_SIZE) {
        params.assertNotCanceled?.();

        const batch = verses.slice(start, start + IMPORT_BATCH_SIZE);
        await this.tafsirOfflineStore.upsertRows(
          batch.map((verse) => ({
            tafsirId,
            verseKey: verse.verseKey,
            html: verse.html,
          }))
        );

        processed += batch.length;
        params.onProgress?.(
          toProgress('import', totalVerses > 0 ? (processed / totalVerses) * 100 : 100, 'sqlite import')
        );
      }

      params.assertNotCanceled?.();
      params.onProgress?.(toProgress('import', 100, 'sqlite import'));
      return true;
    } finally {
      try {
        await this.fileStore.deleteTemporaryPackDirectoryAsync(temporaryDirectory);
      } catch (cleanupError) {
        this.logger?.warn(
          'Failed to clean up temporary tafsir pack directory',
          { tafsirId, version: resolved.entry.version },
          cleanupError as Error
        );
      }
    }
  }

  private async getResolvedPack(tafsirId: number): Promise<ResolvedCatalogPack | null> {
    const normalizedTafsirId = normalizePositiveInt(tafsirId);
    if (normalizedTafsirId <= 0) return null;

    const catalogUrl = getTafsirPackCatalogUrl();
    if (!catalogUrl) return null;

    const catalog = await this.getCatalog(catalogUrl);
    if (!catalog) return null;

    const entry = catalog.packs.find((pack) => pack.tafsirId === normalizedTafsirId) ?? null;
    if (!entry) return null;

    return {
      catalogUrl,
      entry,
    };
  }

  private async getCatalog(catalogUrl: string): Promise<HostedTafsirPackCatalog | null> {
    const normalizedCatalogUrl = catalogUrl.trim();
    if (!normalizedCatalogUrl) return null;

    if (this.cachedCatalogUrl === normalizedCatalogUrl && this.cachedCatalog) {
      return this.cachedCatalog;
    }

    if (this.cachedCatalogUrl === normalizedCatalogUrl && this.loadingCatalogPromise) {
      return this.loadingCatalogPromise;
    }

    this.cachedCatalogUrl = normalizedCatalogUrl;
    this.loadingCatalogPromise = this.catalogClient
      .fetchCatalog(normalizedCatalogUrl)
      .then((catalog) => {
        this.cachedCatalog = catalog;
        return catalog;
      })
      .catch((error) => {
        this.cachedCatalog = null;
        this.logger?.warn(
          'Failed to fetch hosted tafsir pack catalog',
          { catalogUrl: normalizedCatalogUrl },
          error as Error
        );
        return null;
      })
      .finally(() => {
        this.loadingCatalogPromise = null;
      });

    return this.loadingCatalogPromise;
  }
}
