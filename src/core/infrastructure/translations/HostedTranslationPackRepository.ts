import type { ILogger } from '@/src/core/domain/interfaces/ILogger';
import type { ITranslationOfflineStore } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import type {
  ITranslationPackRepository,
  TranslationPackAvailability,
  TranslationPackInstallPhase,
  TranslationPackInstallProgress,
} from '@/src/core/domain/repositories/ITranslationPackRepository';
import type {
  HostedTranslationPackCatalog,
  HostedTranslationPackCatalogEntry,
  TranslationPackManifest,
  TranslationPackPayload,
  TranslationPackPayloadVerse,
} from '@/types';

import {
  asNonEmptyString,
  asPositiveNumber,
  clampPercent,
  downloadHostedPackFileAsync,
  normalizePositiveInt,
  normalizeRelativePath,
  readHostedPackJsonFileAsync,
  resolveHostedPackUrl,
  verifyDownloadedFileAsync,
} from '@/src/core/infrastructure/hosted-pack/hostedPackSupport';

import { TranslationPackCatalogClient } from './TranslationPackCatalogClient';
import { TranslationPackFileStore } from './TranslationPackFileStore';
import { getTranslationPackCatalogUrl } from './translationPackCatalogConfig';

const MANIFEST_WEIGHT = 10;
const PAYLOAD_WEIGHT = 45;
const IMPORT_WEIGHT = 45;
const IMPORT_BATCH_SIZE = 250;

function resolveManifestUrl(entry: HostedTranslationPackCatalogEntry, catalogUrl: string): string {
  const explicitManifestUrl = entry.manifestUrl?.trim();
  if (explicitManifestUrl) {
    return resolveHostedPackUrl(catalogUrl, explicitManifestUrl);
  }

  return new URL('manifest.json', resolveHostedPackUrl(catalogUrl, entry.downloadUrl)).toString();
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toOverallPercent(phase: TranslationPackInstallPhase, phasePercent: number): number {
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
  phase: TranslationPackInstallPhase,
  phasePercent: number,
  activeFile: string
): TranslationPackInstallProgress {
  return {
    phase,
    percent: clampPercent(toOverallPercent(phase, phasePercent)),
    activeFile,
  };
}

function ensureManifestMatchesCatalog(
  entry: HostedTranslationPackCatalogEntry,
  manifest: TranslationPackManifest
): void {
  if (manifest.translationId !== entry.translationId) {
    throw new Error(
      `Hosted translation manifest ID mismatch: expected ${entry.translationId}, received ${manifest.translationId}`
    );
  }

  if (manifest.version.trim() !== entry.version.trim()) {
    throw new Error(
      `Hosted translation manifest version mismatch: expected ${entry.version}, received ${manifest.version}`
    );
  }

  if (!manifest.payloadFile.trim()) {
    throw new Error('Hosted translation manifest payloadFile is required');
  }

  if (typeof entry.totalVerses === 'number' && manifest.totalVerses !== entry.totalVerses) {
    throw new Error(
      `Hosted translation manifest verse count mismatch: expected ${entry.totalVerses}, received ${manifest.totalVerses}`
    );
  }
}

function mapPayloadVerse(
  value: unknown,
  translationId: number
): TranslationPackPayloadVerse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const verseKey = asNonEmptyString(record.verseKey);
  const surahId = asPositiveNumber(record.surahId);
  const ayahNumber = asPositiveNumber(record.ayahNumber);
  const arabicUthmani = String(record.arabicUthmani ?? '').trim();
  const text = stripHtml(String(record.text ?? ''));

  if (!verseKey || !surahId || !ayahNumber || !arabicUthmani) {
    return null;
  }

  return {
    verseKey,
    surahId,
    ayahNumber,
    arabicUthmani,
    text,
  };
}

function ensurePayloadMatchesManifest(
  manifest: TranslationPackManifest,
  payload: TranslationPackPayload
): TranslationPackPayloadVerse[] {
  if (payload.translationId !== manifest.translationId) {
    throw new Error(
      `Installed translation payload ID mismatch: expected ${manifest.translationId}, received ${payload.translationId}`
    );
  }

  if (payload.version.trim() !== manifest.version.trim()) {
    throw new Error(
      `Installed translation payload version mismatch: expected ${manifest.version}, received ${payload.version}`
    );
  }

  if (payload.format !== manifest.format) {
    throw new Error(
      `Installed translation payload format mismatch: expected ${manifest.format}, received ${payload.format}`
    );
  }

  const verses = Array.isArray(payload.verses)
    ? payload.verses
        .map((verse) => mapPayloadVerse(verse, manifest.translationId))
        .filter((verse): verse is TranslationPackPayloadVerse => verse !== null)
    : [];

  if (verses.length === 0) {
    throw new Error('Hosted translation payload is empty');
  }

  if (manifest.totalVerses > 0 && verses.length !== manifest.totalVerses) {
    throw new Error(
      `Hosted translation payload verse count mismatch: expected ${manifest.totalVerses}, received ${verses.length}`
    );
  }

  return verses;
}

type ResolvedCatalogPack = {
  catalogUrl: string;
  catalog: HostedTranslationPackCatalog;
  entry: HostedTranslationPackCatalogEntry;
};

export class HostedTranslationPackRepository implements ITranslationPackRepository {
  private readonly catalogClient: TranslationPackCatalogClient;
  private readonly fileStore: TranslationPackFileStore;
  private cachedCatalogUrl: string | null = null;
  private cachedCatalog: HostedTranslationPackCatalog | null = null;
  private loadingCatalogPromise: Promise<HostedTranslationPackCatalog | null> | null = null;

  constructor(
    private readonly translationOfflineStore: ITranslationOfflineStore,
    private readonly logger?: ILogger
  ) {
    this.catalogClient = new TranslationPackCatalogClient();
    this.fileStore = new TranslationPackFileStore();
  }

  async getPackAvailability(translationId: number): Promise<TranslationPackAvailability | null> {
    const resolved = await this.getResolvedPack(translationId);
    if (!resolved) return null;

    return {
      translationId: resolved.entry.translationId,
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
    translationId: number;
    onProgress?: ((progress: TranslationPackInstallProgress) => void) | undefined;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<boolean> {
    const translationId = normalizePositiveInt(params.translationId);
    if (translationId <= 0) {
      throw new Error('translationId must be a positive integer');
    }

    const resolved = await this.getResolvedPack(translationId);
    if (!resolved) {
      throw new Error(
        `Translation ${translationId} is not available on the configured download host. API fallback is disabled.`
      );
    }

    params.assertNotCanceled?.();

    const temporaryDirectory = await this.fileStore.prepareTemporaryPackDirectoryAsync(
      translationId,
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

      const manifest = await readHostedPackJsonFileAsync<TranslationPackManifest>(manifestUri);
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

      const payload = await readHostedPackJsonFileAsync<TranslationPackPayload>(payloadUri);
      const verses = ensurePayloadMatchesManifest(manifest, payload);
      params.onProgress?.(toProgress('payload', 100, normalizedPayloadFile));

      await this.translationOfflineStore.deleteTranslation(translationId);

      const totalVerses = verses.length;
      let processed = 0;

      for (let start = 0; start < verses.length; start += IMPORT_BATCH_SIZE) {
        params.assertNotCanceled?.();

        const batch = verses.slice(start, start + IMPORT_BATCH_SIZE);
        await this.translationOfflineStore.upsertVersesAndTranslations({
          verses: batch.map((verse) => ({
            verseKey: verse.verseKey,
            surahId: verse.surahId,
            ayahNumber: verse.ayahNumber,
            arabicUthmani: verse.arabicUthmani,
          })),
          translations: batch.map((verse) => ({
            translationId,
            verseKey: verse.verseKey,
            text: verse.text,
          })),
        });

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
          'Failed to clean up temporary translation pack directory',
          { translationId, version: resolved.entry.version },
          cleanupError as Error
        );
      }
    }
  }

  private async getResolvedPack(translationId: number): Promise<ResolvedCatalogPack | null> {
    const normalizedTranslationId = normalizePositiveInt(translationId);
    if (normalizedTranslationId <= 0) return null;

    const catalogUrl = getTranslationPackCatalogUrl();
    if (!catalogUrl) return null;

    const catalog = await this.getCatalog(catalogUrl);
    if (!catalog) return null;

    const entry =
      catalog.packs.find((pack) => pack.translationId === normalizedTranslationId) ?? null;

    if (!entry) return null;

    return {
      catalogUrl,
      catalog,
      entry,
    };
  }

  private async getCatalog(catalogUrl: string): Promise<HostedTranslationPackCatalog | null> {
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
          'Failed to fetch hosted translation pack catalog',
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
