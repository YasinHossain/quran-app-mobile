import type { ILogger } from '@/src/core/domain/interfaces/ILogger';
import type { ITranslationOfflineStore } from '@/src/core/domain/repositories/ITranslationOfflineStore';
import type {
  IWordTranslationPackRepository,
  WordTranslationPackInstallPhase,
  WordTranslationPackInstallProgress,
} from '@/src/core/domain/repositories/IWordTranslationPackRepository';
import type {
  HostedWordTranslationPackCatalog,
  HostedWordTranslationPackCatalogEntry,
  WordTranslationPackManifest,
  WordTranslationPackPayload,
  WordTranslationPackPayloadVerse,
} from '@/types';

import {
  asNonEmptyString,
  asPositiveNumber,
  clampPercent,
  downloadHostedPackFileAsync,
  normalizeRelativePath,
  readHostedPackJsonFileAsync,
  resolveHostedPackUrl,
  verifyDownloadedFileAsync,
} from '@/src/core/infrastructure/hosted-pack/hostedPackSupport';

import { WordTranslationPackCatalogClient } from './WordTranslationPackCatalogClient';
import { WordTranslationPackFileStore } from './WordTranslationPackFileStore';
import { getWordTranslationPackCatalogUrl } from './wordTranslationPackCatalogConfig';

const MANIFEST_WEIGHT = 10;
const PAYLOAD_WEIGHT = 45;
const IMPORT_WEIGHT = 45;
const IMPORT_BATCH_SIZE = 250;

function normalizeLanguageCode(value: string): string {
  return value.trim().toLowerCase();
}

function resolveManifestUrl(entry: HostedWordTranslationPackCatalogEntry, catalogUrl: string): string {
  const explicitManifestUrl = entry.manifestUrl?.trim();
  if (explicitManifestUrl) return resolveHostedPackUrl(catalogUrl, explicitManifestUrl);
  return new URL('manifest.json', resolveHostedPackUrl(catalogUrl, entry.downloadUrl)).toString();
}

function toOverallPercent(phase: WordTranslationPackInstallPhase, phasePercent: number): number {
  const clampedPhasePercent = clampPercent(phasePercent);
  if (phase === 'manifest') return (clampedPhasePercent / 100) * MANIFEST_WEIGHT;
  if (phase === 'payload') return MANIFEST_WEIGHT + (clampedPhasePercent / 100) * PAYLOAD_WEIGHT;
  return MANIFEST_WEIGHT + PAYLOAD_WEIGHT + (clampedPhasePercent / 100) * IMPORT_WEIGHT;
}

function toProgress(
  phase: WordTranslationPackInstallPhase,
  phasePercent: number,
  activeFile: string
): WordTranslationPackInstallProgress {
  return {
    phase,
    percent: clampPercent(toOverallPercent(phase, phasePercent)),
    activeFile,
  };
}

function ensureManifestMatchesCatalog(
  entry: HostedWordTranslationPackCatalogEntry,
  manifest: WordTranslationPackManifest
): void {
  if (normalizeLanguageCode(manifest.languageCode) !== entry.languageCode) {
    throw new Error(
      `Hosted word manifest language mismatch: expected ${entry.languageCode}, received ${manifest.languageCode}`
    );
  }
  if (manifest.version.trim() !== entry.version.trim()) {
    throw new Error(
      `Hosted word manifest version mismatch: expected ${entry.version}, received ${manifest.version}`
    );
  }
  if (!manifest.payloadFile.trim()) {
    throw new Error('Hosted word manifest payloadFile is required');
  }
  if (typeof entry.totalVerses === 'number' && manifest.totalVerses !== entry.totalVerses) {
    throw new Error(
      `Hosted word manifest verse count mismatch: expected ${entry.totalVerses}, received ${manifest.totalVerses}`
    );
  }
}

function mapPayloadVerse(value: unknown): WordTranslationPackPayloadVerse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const verseKey = asNonEmptyString(record.verseKey);
  const surahId = asPositiveNumber(record.surahId);
  const ayahNumber = asPositiveNumber(record.ayahNumber);
  const arabicUthmani = String(record.arabicUthmani ?? '').trim();
  const words = Array.isArray(record.words) ? record.words : [];

  if (!verseKey || !surahId || !ayahNumber || !arabicUthmani || words.length === 0) return null;

  return {
    verseKey,
    surahId,
    ayahNumber,
    arabicUthmani,
    words: words as WordTranslationPackPayloadVerse['words'],
  };
}

function ensurePayloadMatchesManifest(
  manifest: WordTranslationPackManifest,
  payload: WordTranslationPackPayload
): WordTranslationPackPayloadVerse[] {
  if (normalizeLanguageCode(payload.languageCode) !== normalizeLanguageCode(manifest.languageCode)) {
    throw new Error(
      `Installed word payload language mismatch: expected ${manifest.languageCode}, received ${payload.languageCode}`
    );
  }
  if (payload.version.trim() !== manifest.version.trim()) {
    throw new Error(
      `Installed word payload version mismatch: expected ${manifest.version}, received ${payload.version}`
    );
  }
  if (payload.format !== manifest.format) {
    throw new Error(
      `Installed word payload format mismatch: expected ${manifest.format}, received ${payload.format}`
    );
  }

  const verses = Array.isArray(payload.verses)
    ? payload.verses
        .map(mapPayloadVerse)
        .filter((verse): verse is WordTranslationPackPayloadVerse => verse !== null)
    : [];

  if (verses.length === 0) throw new Error('Hosted word payload is empty');
  if (manifest.totalVerses > 0 && verses.length !== manifest.totalVerses) {
    throw new Error(
      `Hosted word payload verse count mismatch: expected ${manifest.totalVerses}, received ${verses.length}`
    );
  }
  return verses;
}

type ResolvedCatalogPack = {
  catalogUrl: string;
  catalog: HostedWordTranslationPackCatalog;
  entry: HostedWordTranslationPackCatalogEntry;
};

export class HostedWordTranslationPackRepository implements IWordTranslationPackRepository {
  private readonly catalogClient = new WordTranslationPackCatalogClient();
  private readonly fileStore = new WordTranslationPackFileStore();
  private cachedCatalogUrl: string | null = null;
  private cachedCatalog: HostedWordTranslationPackCatalog | null = null;
  private loadingCatalogPromise: Promise<HostedWordTranslationPackCatalog | null> | null = null;

  constructor(
    private readonly translationOfflineStore: ITranslationOfflineStore,
    private readonly logger?: ILogger
  ) {}

  async installPack(params: {
    languageCode: string;
    onProgress?: ((progress: WordTranslationPackInstallProgress) => void) | undefined;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<boolean> {
    const languageCode = normalizeLanguageCode(params.languageCode);
    if (!languageCode) throw new Error('languageCode must be non-empty');

    const resolved = await this.getResolvedPack(languageCode);
    if (!resolved) return false;

    params.assertNotCanceled?.();

    const temporaryDirectory = await this.fileStore.prepareTemporaryPackDirectoryAsync(
      languageCode,
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

      const manifest = await readHostedPackJsonFileAsync<WordTranslationPackManifest>(manifestUri);
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

      const payload = await readHostedPackJsonFileAsync<WordTranslationPackPayload>(payloadUri);
      const verses = ensurePayloadMatchesManifest(manifest, payload);
      params.onProgress?.(toProgress('payload', 100, normalizedPayloadFile));

      await this.translationOfflineStore.deleteWordTranslation(languageCode);

      const totalVerses = verses.length;
      let processed = 0;
      for (let start = 0; start < verses.length; start += IMPORT_BATCH_SIZE) {
        params.assertNotCanceled?.();
        const batch = verses.slice(start, start + IMPORT_BATCH_SIZE);
        await this.translationOfflineStore.upsertWordTranslations({
          languageCode,
          verses: batch.map((verse) => ({
            verseKey: verse.verseKey,
            surahId: verse.surahId,
            ayahNumber: verse.ayahNumber,
            arabicUthmani: verse.arabicUthmani,
            wordsJson: JSON.stringify(verse.words),
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
          'Failed to clean up temporary word translation pack directory',
          { languageCode, version: resolved.entry.version },
          cleanupError as Error
        );
      }
    }
  }

  private async getResolvedPack(languageCode: string): Promise<ResolvedCatalogPack | null> {
    const catalogUrl = getWordTranslationPackCatalogUrl();
    if (!catalogUrl) return null;

    const catalog = await this.getCatalog(catalogUrl);
    if (!catalog) return null;

    const entry = catalog.packs.find((pack) => pack.languageCode === languageCode) ?? null;
    if (!entry) return null;

    return { catalogUrl, catalog, entry };
  }

  private async getCatalog(catalogUrl: string): Promise<HostedWordTranslationPackCatalog | null> {
    if (this.cachedCatalog && this.cachedCatalogUrl === catalogUrl) return this.cachedCatalog;
    if (this.loadingCatalogPromise && this.cachedCatalogUrl === catalogUrl) {
      return this.loadingCatalogPromise;
    }

    this.cachedCatalogUrl = catalogUrl;
    this.loadingCatalogPromise = this.catalogClient
      .fetchCatalog(catalogUrl)
      .then((catalog) => {
        this.cachedCatalog = catalog;
        return catalog;
      })
      .catch((error) => {
        this.logger?.warn('Failed to fetch word translation pack catalog', { catalogUrl }, error as Error);
        return null;
      })
      .finally(() => {
        this.loadingCatalogPromise = null;
      });

    return this.loadingCatalogPromise;
  }
}
