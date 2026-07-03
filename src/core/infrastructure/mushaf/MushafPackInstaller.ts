import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

import type { DownloadableContent, MushafPackInstall } from '@/src/core/domain/entities';
import type { ILogger } from '@/src/core/domain/interfaces/ILogger';
import type { IDownloadIndexRepository } from '@/src/core/domain/repositories/IDownloadIndexRepository';
import type { IMushafPackInstallRegistry } from '@/src/core/domain/repositories/IMushafPackInstallRegistry';
import type {
  HostedMushafPackCatalogEntry,
  MushafPackChecksum,
  MushafPackId,
  MushafPackPageAddressableLocalPayload,
  MushafPackPageLookupPayload,
  MushafPackPagePayload,
  MushafPackManifest,
  MushafPackPayload,
  MushafPackRemoteFile,
  MushafVerse,
  MushafWord,
} from '@/types';

import {
  QCF_MADANI_V1_PACK,
  getDownloadableMushafPackDefinition,
  getExactPackPageFontFileName,
  getExactPackPageFontRelativePath,
  getSharedPackFontRelativePath,
  type DownloadableMushafPackDefinition,
} from './downloadablePacks';
import { MushafPackFileStore } from './MushafPackFileStore';

const UTHMANIC_HAFS_FONT_ASSET = require('../../../../assets/fonts/UthmanicHafs1Ver18.ttf') as number;
const INDOPAK_FONT_ASSET = require('../../../../assets/fonts/indopak-nastaleeq-waqf-lazim-v4.2.1.ttf') as number;

type ResolvedRemoteFile = {
  file: string;
  url: string;
  checksum?: MushafPackChecksum | undefined;
  sizeBytes?: number | undefined;
};

export type MushafPackInstallProgress = {
  completedFiles: number;
  totalFiles: number;
  activeFile: string;
  percent: number | null;
};

export type InstallHostedMushafPackParams = {
  catalogEntry: HostedMushafPackCatalogEntry;
  activateOnInstall?: boolean | undefined;
  onProgress?: ((progress: MushafPackInstallProgress) => void) | undefined;
};

export type InstallQcfMadaniV1PackParams = {
  activateOnInstall?: boolean | undefined;
  onProgress?: ((progress: MushafPackInstallProgress) => void) | undefined;
};

type QcfApiWordResponse = {
  id: number;
  position: number;
  char_type_name?: string | null;
  verse_key?: string | null;
  verse_id?: number | null;
  line_number?: number | null;
  location?: string | null;
  text_uthmani?: string | null;
  text_qpc_hafs?: string | null;
  text_indopak?: string | null;
  code_v1?: string | null;
  code_v2?: string | null;
  page_number?: number | null;
};

type QcfApiVerseResponse = {
  id: number;
  verse_key: string;
  chapter_id?: number | null;
  page_number: number;
  juz_number?: number | null;
  hizb_number?: number | null;
  rub_el_hizb_number?: number | null;
  text_uthmani?: string | null;
  text_indopak?: string | null;
  text_uthmani_tajweed?: string | null;
  words?: QcfApiWordResponse[] | null;
};

type QcfApiPageResponse = {
  verses?: QcfApiVerseResponse[] | null;
};

const PAGE_ADDRESSABLE_LOOKUP_FILE = 'page-data/lookup.json';
const PAGE_ADDRESSABLE_PAGES_DIRECTORY = 'page-data/pages';
const PAGE_DATA_FETCH_TIMEOUT_MS = 20000;
const PAGE_DATA_FETCH_RETRY_COUNT = 2;
const HOSTED_DOWNLOAD_CONCURRENCY = 8;
const HOSTED_PROGRESS_PERSIST_STEP = 8;
const CANCELED_ERROR_CODE = 'mushaf_pack_install_canceled';
const canceledInstallKeys = new Set<string>();
const activeInstallAbortControllers = new Map<string, AbortController>();

export class MushafPackInstallCanceledError extends Error {
  readonly code = CANCELED_ERROR_CODE;

  constructor(readonly packId: MushafPackId, readonly version: string) {
    super('Mushaf pack install canceled');
    this.name = 'MushafPackInstallCanceledError';
  }
}

export function isMushafPackInstallCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { code?: unknown }).code === CANCELED_ERROR_CODE) return true;
  return error.name === 'MushafPackInstallCanceledError';
}

function asNonEmptyString(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('A non-empty string is required');
  }
  return normalized;
}

function normalizeRelativePath(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');

  if (!normalized) {
    throw new Error('A relative file path is required');
  }

  return normalized;
}

function normalizeChecksum(checksum: string): string {
  const normalized = checksum.trim().toLowerCase();
  if (!normalized) {
    throw new Error('checksum is required');
  }

  if (/^[a-f0-9]{32}$/.test(normalized)) {
    return normalized;
  }

  const md5PrefixedMatch = normalized.match(/^md5[:\-]([a-f0-9]{32})$/);
  if (md5PrefixedMatch?.[1]) {
    return md5PrefixedMatch[1];
  }

  throw new Error(`Unsupported checksum format: ${checksum}`);
}

function getInstallCancelKey(packId: MushafPackId, version: string): string {
  return `${packId}@${version.trim()}`;
}

function throwIfInstallCanceled(packId: MushafPackId, version: string, signal?: AbortSignal): void {
  if (!signal?.aborted && !canceledInstallKeys.has(getInstallCancelKey(packId, version))) {
    return;
  }

  throw new MushafPackInstallCanceledError(packId, version);
}

function resolveUrl(baseUrl: string, value?: string): string {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error('A download URL is required');
  }

  return new URL(normalizedValue, baseUrl).toString();
}

function resolveManifestUrl(entry: HostedMushafPackCatalogEntry): string {
  const explicitManifestUrl = entry.manifestUrl?.trim();
  if (explicitManifestUrl) {
    return explicitManifestUrl;
  }

  return new URL('manifest.json', entry.downloadUrl).toString();
}

const QCF_V1_PAGE_WORD_FIELDS = [
  'verse_key',
  'verse_id',
  'page_number',
  'line_number',
  'location',
  'text_uthmani',
  'text_indopak',
  'text_qpc_hafs',
  'code_v1',
  'code_v2',
  'char_type_name',
] as const;

const QCF_V1_PAGE_FIELDS = [
  'chapter_id',
  'hizb_number',
  'rub_el_hizb_number',
  'text_uthmani',
  'text_indopak',
  'text_uthmani_tajweed',
] as const;

function mapQcfV1Word(word: QcfApiWordResponse): MushafWord {
  return {
    id: word.id,
    verseKey: word.verse_key ?? undefined,
    pageNumber: typeof word.page_number === 'number' ? word.page_number : undefined,
    lineNumber: typeof word.line_number === 'number' ? word.line_number : undefined,
    position: word.position,
    charType: word.char_type_name ?? undefined,
    location: word.location ?? undefined,
    textUthmani: word.text_uthmani ?? undefined,
    textQpcHafs: word.text_qpc_hafs ?? undefined,
    textIndopak: word.text_indopak ?? undefined,
    codeV1: word.code_v1 ?? undefined,
    codeV2: word.code_v2 ?? undefined,
  };
}

function mapQcfV1Verse(verse: QcfApiVerseResponse): MushafVerse {
  return {
    id: verse.id,
    verseKey: verse.verse_key,
    chapterId: verse.chapter_id ?? undefined,
    pageNumber: verse.page_number,
    juzNumber: verse.juz_number ?? undefined,
    hizbNumber: verse.hizb_number ?? undefined,
    rubElHizbNumber: verse.rub_el_hizb_number ?? undefined,
    textUthmani: verse.text_uthmani ?? undefined,
    textIndopak: verse.text_indopak ?? undefined,
    textUthmaniTajweed: verse.text_uthmani_tajweed ?? undefined,
    words: Array.isArray(verse.words) ? verse.words.map(mapQcfV1Word) : [],
  };
}

async function fetchJsonOnceAsync<T>(url: string, signal?: AbortSignal): Promise<T> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), PAGE_DATA_FETCH_TIMEOUT_MS);
  const abortFromParent = (): void => abortController.abort();

  if (signal?.aborted) {
    abortController.abort();
  } else {
    signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'x-client': 'quran-app-mobile-qcf-v1-installer',
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch ${url} (${response.status}): ${errorText.slice(0, 240)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

async function fetchJsonAsync<T>(url: string, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= PAGE_DATA_FETCH_RETRY_COUNT; attempt += 1) {
    if (signal?.aborted) {
      throw lastError instanceof Error ? lastError : new Error('Request canceled');
    }

    try {
      return await fetchJsonOnceAsync<T>(url, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        break;
      }
      if (attempt >= PAGE_DATA_FETCH_RETRY_COUNT) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function buildPackPageUrl(pack: DownloadableMushafPackDefinition, pageNumber: number): string {
  const baseUrl = pack.pageDataApiBaseUrl;
  if (!baseUrl) {
    throw new Error(`${pack.packId} page data API base URL is not configured`);
  }

  const url = new URL(`${baseUrl}/${pageNumber}`);
  url.searchParams.set('words', 'true');
  url.searchParams.set('per_page', 'all');
  url.searchParams.set('filter_page_words', 'true');
  url.searchParams.set('word_fields', QCF_V1_PAGE_WORD_FIELDS.join(','));
  url.searchParams.set('fields', QCF_V1_PAGE_FIELDS.join(','));
  url.searchParams.set('mushaf', String(pack.apiMushafId));
  return url.toString();
}

async function fetchMushafPackPageAsync(
  pack: DownloadableMushafPackDefinition,
  pageNumber: number,
  signal?: AbortSignal
): Promise<{
  pageNumber: number;
  lookup: MushafPackPayload['lookup'][string];
  verses: MushafVerse[];
}> {
  const response = await fetchJsonAsync<QcfApiPageResponse>(
    buildPackPageUrl(pack, pageNumber),
    signal
  );
  const verses = Array.isArray(response.verses) ? response.verses.map(mapQcfV1Verse) : [];
  const firstVerseKey = verses[0]?.verseKey ?? '';
  const lastVerseKey = verses[verses.length - 1]?.verseKey ?? '';

  return {
    pageNumber,
    lookup: {
      from: firstVerseKey,
      to: lastVerseKey,
      firstVerseKey,
      lastVerseKey,
    },
    verses,
  };
}

async function writeJsonFileAsync(fileUri: string, value: unknown): Promise<void> {
  const parentDirectory = fileUri.slice(0, fileUri.lastIndexOf('/') + 1);
  await FileSystem.makeDirectoryAsync(parentDirectory, { intermediates: true });
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(value));
}

async function readJsonFileAsync<T>(fileUri: string): Promise<T> {
  const raw = await FileSystem.readAsStringAsync(fileUri);
  return JSON.parse(raw) as T;
}

function getSharedPackFontAssetModule(packId: MushafPackId): number | null {
  switch (packId) {
    case 'qpc-uthmani-hafs':
      return UTHMANIC_HAFS_FONT_ASSET;
    case 'unicode-indopak-15':
    case 'unicode-indopak-16':
      return INDOPAK_FONT_ASSET;
    default:
      return null;
  }
}

async function copyBundledAssetAsync(assetModule: number, destinationUri: string): Promise<void> {
  const parentDirectory = destinationUri.slice(0, destinationUri.lastIndexOf('/') + 1);
  await FileSystem.makeDirectoryAsync(parentDirectory, { intermediates: true });

  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();
  const sourceUri = asset.localUri ?? asset.uri;
  if (!sourceUri) {
    throw new Error('Bundled font asset is not available locally.');
  }

  await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
}

async function runPromisePool<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        break;
      }

      results[currentIndex] = await worker(items[currentIndex] as TInput, currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

function toDownloadContent(packId: MushafPackId, version: string): DownloadableContent {
  return {
    kind: 'mushaf-pack',
    packId,
    version,
  };
}

function buildPageAddressableLocalPayload(): MushafPackPageAddressableLocalPayload {
  return {
    format: 'page-json-v1',
    lookupFile: PAGE_ADDRESSABLE_LOOKUP_FILE,
    pagesDirectory: PAGE_ADDRESSABLE_PAGES_DIRECTORY,
  };
}

function buildPageAddressablePageRelativePath(
  localPayload: MushafPackPageAddressableLocalPayload,
  pageNumber: number
): string {
  return `${normalizeRelativePath(localPayload.pagesDirectory)}/${Math.trunc(pageNumber)}.json`;
}

function buildPageLookupPayload(
  packId: MushafPackId,
  version: string,
  totalPages: number,
  lookup: Record<string, MushafPackPayload['lookup'][string]>
): MushafPackPageLookupPayload {
  return {
    packId,
    version,
    totalPages,
    lookup,
  };
}

function buildPagePayload(
  packId: MushafPackId,
  version: string,
  pageNumber: number,
  verses: MushafVerse[]
): MushafPackPagePayload {
  return {
    packId,
    version,
    pageNumber,
    verses,
  };
}

function ensurePayloadMatchesManifest(
  manifest: MushafPackManifest,
  payload: MushafPackPayload
): MushafPackPayload {
  if (payload.packId !== manifest.packId) {
    throw new Error(
      `Installed mushaf payload packId mismatch: expected ${manifest.packId}, received ${payload.packId}`
    );
  }

  if (payload.version.trim() !== manifest.version.trim()) {
    throw new Error(
      `Installed mushaf payload version mismatch: expected ${manifest.version}, received ${payload.version}`
    );
  }

  return payload;
}

function ensureManifestMatchesCatalog(
  catalogEntry: HostedMushafPackCatalogEntry,
  manifest: MushafPackManifest
): void {
  if (manifest.packId !== catalogEntry.packId) {
    throw new Error(
      `Hosted manifest packId mismatch: expected ${catalogEntry.packId}, received ${manifest.packId}`
    );
  }

  if (manifest.version.trim() !== catalogEntry.version.trim()) {
    throw new Error(
      `Hosted manifest version mismatch: expected ${catalogEntry.version}, received ${manifest.version}`
    );
  }

  if (manifest.channel !== 'download') {
    throw new Error(`Hosted manifest must use download channel, received ${manifest.channel}`);
  }

  if (manifest.renderer !== catalogEntry.renderer) {
    throw new Error(
      `Hosted manifest renderer mismatch: expected ${catalogEntry.renderer}, received ${manifest.renderer}`
    );
  }

  if (manifest.script !== catalogEntry.script) {
    throw new Error(
      `Hosted manifest script mismatch: expected ${catalogEntry.script}, received ${manifest.script}`
    );
  }

  if (manifest.lines !== catalogEntry.lines) {
    throw new Error(
      `Hosted manifest lines mismatch: expected ${catalogEntry.lines}, received ${manifest.lines}`
    );
  }

  if (typeof catalogEntry.totalPages === 'number' && manifest.totalPages !== catalogEntry.totalPages) {
    throw new Error(
      `Hosted manifest totalPages mismatch: expected ${catalogEntry.totalPages}, received ${manifest.totalPages}`
    );
  }

  if (!manifest.payloadFile.trim()) {
    throw new Error('Hosted manifest payloadFile is required');
  }
}

function mergeRemoteFileDescriptors(
  manifest: MushafPackManifest,
  catalogEntry: HostedMushafPackCatalogEntry,
  manifestUrl: string
): ResolvedRemoteFile[] {
  const normalizedPayloadFile = normalizeRelativePath(manifest.payloadFile);
  const catalogFiles = new Map<string, MushafPackRemoteFile>();

  for (const file of catalogEntry.files ?? []) {
    const normalizedFile = normalizeRelativePath(file.file);
    catalogFiles.set(normalizedFile, {
      ...file,
      file: normalizedFile,
    });
  }

  const manifestFiles = new Map<string, MushafPackRemoteFile>();
  for (const file of manifest.assetFiles ?? []) {
    const normalizedFile = normalizeRelativePath(file.file);
    manifestFiles.set(normalizedFile, {
      ...file,
      file: normalizedFile,
    });
  }

  const primaryDescriptor = catalogFiles.get(normalizedPayloadFile);
  const resolvedFiles: ResolvedRemoteFile[] = [
    {
      file: normalizedPayloadFile,
      url: primaryDescriptor?.url?.trim()
        ? resolveUrl(manifestUrl, primaryDescriptor.url)
        : catalogEntry.downloadUrl,
      checksum: primaryDescriptor?.checksum ?? catalogEntry.checksum ?? manifest.payloadChecksum,
      sizeBytes: primaryDescriptor?.sizeBytes ?? catalogEntry.sizeBytes ?? manifest.payloadSizeBytes,
    },
  ];

  const assetFileNames = new Set<string>([
    ...Array.from(manifestFiles.keys()),
    ...Array.from(catalogFiles.keys()).filter((file) => file !== normalizedPayloadFile),
  ]);

  for (const fileName of assetFileNames) {
    const manifestDescriptor = manifestFiles.get(fileName);
    const catalogDescriptor = catalogFiles.get(fileName);
    const urlSource = catalogDescriptor?.url ?? manifestDescriptor?.url ?? fileName;

    resolvedFiles.push({
      file: fileName,
      url: resolveUrl(manifestUrl, urlSource),
      checksum: catalogDescriptor?.checksum ?? manifestDescriptor?.checksum,
      sizeBytes: catalogDescriptor?.sizeBytes ?? manifestDescriptor?.sizeBytes,
    });
  }

  return resolvedFiles;
}

function manifestIncludesExpectedDownloadablePackAssets(
  pack: DownloadableMushafPackDefinition,
  manifest: MushafPackManifest
): boolean {
  if (manifest.packId !== pack.packId || manifest.version.trim() !== pack.version.trim()) {
    return false;
  }

  if (!pack.qcfVersion) {
    return true;
  }

  for (const pageNumber of [1, pack.totalPages]) {
    const relativePath = getExactPackPageFontRelativePath(pack.packId, pageNumber);
    if (!relativePath) {
      return false;
    }

    const isIncluded = (manifest.assetFiles ?? []).some((file) => file.file === relativePath);
    if (!isIncluded) {
      return false;
    }
  }

  return true;
}

async function verifyDownloadedFileAsync(
  fileUri: string,
  options: {
    checksum?: MushafPackChecksum | undefined;
    sizeBytes?: number | undefined;
  }
): Promise<void> {
  const shouldComputeMd5 = typeof options.checksum === 'string' && options.checksum.trim().length > 0;
  const info = await FileSystem.getInfoAsync(fileUri, {
    md5: shouldComputeMd5,
  });

  if (!info.exists || info.isDirectory) {
    throw new Error(`Downloaded file missing at ${fileUri}`);
  }

  if (typeof options.sizeBytes === 'number' && info.size !== options.sizeBytes) {
    throw new Error(`Downloaded file size mismatch for ${fileUri}`);
  }

  if (shouldComputeMd5) {
    const expectedChecksum = normalizeChecksum(options.checksum ?? '');
    const actualChecksum = info.md5?.toLowerCase();
    if (!actualChecksum || actualChecksum !== expectedChecksum) {
      throw new Error(`Downloaded file checksum mismatch for ${fileUri}`);
    }
  }
}

async function downloadFileAsync(
  url: string,
  fileUri: string,
  onProgress?: ((progress: { percent: number | null }) => void) | undefined,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw new Error('Download canceled');
  }

  const parentDirectory = fileUri.slice(0, fileUri.lastIndexOf('/') + 1);
  await FileSystem.makeDirectoryAsync(parentDirectory, { intermediates: true });

  const download = FileSystem.createDownloadResumable(url, fileUri, {}, (progress) => {
    if (!onProgress) return;

    const expected = progress.totalBytesExpectedToWrite;
    const percent =
      expected > 0
        ? Math.max(0, Math.min(100, (progress.totalBytesWritten / expected) * 100))
        : null;

    onProgress({ percent });
  });
  const cancelDownload = (): void => {
    void download.cancelAsync().catch(() => undefined);
  };

  signal?.addEventListener('abort', cancelDownload, { once: true });

  try {
    const result = await download.downloadAsync();
    if (!result?.uri) {
      throw new Error(`Failed to download ${url}`);
    }
  } finally {
    signal?.removeEventListener('abort', cancelDownload);
  }
}

async function convertInstalledPayloadToPageAddressableFormatAsync(
  temporaryDirectory: string,
  manifest: MushafPackManifest
): Promise<MushafPackManifest> {
  if (manifest.renderer !== 'webview' || manifest.localPayload?.format === 'page-json-v1') {
    return manifest;
  }

  const normalizedPayloadFile = normalizeRelativePath(manifest.payloadFile);
  if (!normalizedPayloadFile.toLowerCase().endsWith('.json')) {
    return manifest;
  }

  const payloadUri = `${temporaryDirectory}${normalizedPayloadFile}`;
  const payloadInfo = await FileSystem.getInfoAsync(payloadUri);
  if (!payloadInfo.exists || payloadInfo.isDirectory) {
    throw new Error(`Downloaded mushaf payload is missing at ${payloadUri}`);
  }

  const payload = ensurePayloadMatchesManifest(
    manifest,
    await readJsonFileAsync<MushafPackPayload>(payloadUri)
  );
  const localPayload = buildPageAddressableLocalPayload();

  await writeJsonFileAsync(
    `${temporaryDirectory}${localPayload.lookupFile}`,
    buildPageLookupPayload(payload.packId, payload.version, payload.totalPages, payload.lookup)
  );

  for (let pageNumber = 1; pageNumber <= payload.totalPages; pageNumber += 1) {
    await writeJsonFileAsync(
      `${temporaryDirectory}${buildPageAddressablePageRelativePath(localPayload, pageNumber)}`,
      buildPagePayload(
        payload.packId,
        payload.version,
        pageNumber,
        payload.pages[String(pageNumber)] ?? []
      )
    );
  }

  await FileSystem.deleteAsync(payloadUri, { idempotent: true });

  const {
    payloadChecksum: _payloadChecksum,
    payloadSizeBytes: _payloadSizeBytes,
    localPayload: _existingLocalPayload,
    ...nextManifest
  } = manifest;

  return {
    ...nextManifest,
    payloadFile: localPayload.lookupFile,
    localPayload,
  };
}

export class MushafPackInstaller {
  constructor(
    private readonly fileStore: MushafPackFileStore,
    private readonly installRegistry: IMushafPackInstallRegistry,
    private readonly downloadIndexRepository: IDownloadIndexRepository,
    private readonly logger?: ILogger
  ) {}

  clearPackInstallCancel(packId: MushafPackId, version: string): void {
    canceledInstallKeys.delete(getInstallCancelKey(packId, version));
  }

  async installHostedPackAsync(params: InstallHostedMushafPackParams): Promise<MushafPackInstall> {
    const entry = params.catalogEntry;
    const version = asNonEmptyString(entry.version);
    const content = toDownloadContent(entry.packId, version);
    const installKey = getInstallCancelKey(entry.packId, version);

    const existing = await this.installRegistry.get(entry.packId, version);
    const existingManifest =
      existing && (await this.fileStore.hasInstalledVersionAsync(entry.packId, version))
        ? await this.fileStore.readInstalledManifestAsync(entry.packId, version)
        : null;
    const packDefinition = getDownloadableMushafPackDefinition(entry.packId);
    const canReuseExisting =
      existing &&
      existingManifest &&
      (!packDefinition ||
        manifestIncludesExpectedDownloadablePackAssets(packDefinition, existingManifest));

    if (canReuseExisting) {
      await this.downloadIndexRepository.upsert(content, {
        status: 'installed',
        progress: null,
        error: null,
      });

      if (params.activateOnInstall === true && !existing.isActive) {
        return this.setActiveInstalledVersionAsync(entry.packId, version);
      }

      return existing;
    }

    await this.downloadIndexRepository.upsert(content, {
      status: 'queued',
      progress: { kind: 'items', completed: 0, total: 1 },
      error: null,
    });

    const temporaryDirectory = await this.fileStore.prepareTemporaryVersionDirectoryAsync(
      entry.packId,
      version
    );
    const abortController = new AbortController();
    activeInstallAbortControllers.set(installKey, abortController);

    try {
      throwIfInstallCanceled(entry.packId, version, abortController.signal);
      await this.downloadIndexRepository.upsert(content, {
        status: 'downloading',
        progress: { kind: 'items', completed: 0, total: 1 },
        error: null,
      });

      const manifestUrl = resolveManifestUrl(entry);
      const temporaryManifestUri = `${temporaryDirectory}manifest.json`;
      await downloadFileAsync(manifestUrl, temporaryManifestUri, undefined, abortController.signal);
      await verifyDownloadedFileAsync(temporaryManifestUri, {
        checksum: entry.manifestChecksum,
        sizeBytes: entry.manifestSizeBytes,
      });
      throwIfInstallCanceled(entry.packId, version, abortController.signal);

      let manifest = JSON.parse(
        await FileSystem.readAsStringAsync(temporaryManifestUri)
      ) as MushafPackManifest;
      ensureManifestMatchesCatalog(entry, manifest);

      const files = mergeRemoteFileDescriptors(manifest, entry, manifestUrl);
      const totalFiles = Math.max(1, files.length + 1);
      let completedFiles = 1;
      let lastPersistedCompleted = completedFiles;
      let progressWrite = Promise.resolve();

      await this.downloadIndexRepository.upsert(content, {
        status: 'downloading',
        progress: { kind: 'items', completed: completedFiles, total: totalFiles },
        error: null,
      });

      const notifyProgress = (activeFile: string, percent: number | null): void => {
        params.onProgress?.({
          completedFiles,
          totalFiles,
          activeFile,
          percent,
        });
      };

      const persistProgressAsync = async (force = false): Promise<void> => {
        if (
          !force &&
          completedFiles < totalFiles &&
          completedFiles - lastPersistedCompleted < HOSTED_PROGRESS_PERSIST_STEP
        ) {
          return;
        }

        const completedSnapshot = completedFiles;
        lastPersistedCompleted = completedSnapshot;
        progressWrite = progressWrite.then(() =>
          this.downloadIndexRepository.upsert(content, {
            status: 'downloading',
            progress: { kind: 'items', completed: completedSnapshot, total: totalFiles },
            error: null,
          }).then(() => undefined)
        );
        await progressWrite;
      };

      await runPromisePool(files, HOSTED_DOWNLOAD_CONCURRENCY, async (file) => {
        throwIfInstallCanceled(entry.packId, version, abortController.signal);
        const temporaryFileUri = `${temporaryDirectory}${normalizeRelativePath(file.file)}`;

        notifyProgress(file.file, 0);
        await downloadFileAsync(
          file.url,
          temporaryFileUri,
          (progress) => {
            notifyProgress(file.file, progress.percent);
          },
          abortController.signal
        );
        await verifyDownloadedFileAsync(temporaryFileUri, {
          checksum: file.checksum,
          sizeBytes: file.sizeBytes,
        });
        throwIfInstallCanceled(entry.packId, version, abortController.signal);

        completedFiles += 1;
        notifyProgress(file.file, 100);
        await persistProgressAsync();
      });

      await persistProgressAsync(true);

      manifest = await convertInstalledPayloadToPageAddressableFormatAsync(
        temporaryDirectory,
        manifest
      );
      await writeJsonFileAsync(temporaryManifestUri, manifest);

      await this.fileStore.promoteTemporaryVersionDirectoryAsync(temporaryDirectory, entry.packId, version);

      const installed = await this.installRegistry.upsert({
        packId: entry.packId,
        version,
        channel: 'download',
        ...(typeof params.activateOnInstall === 'boolean'
          ? { isActive: params.activateOnInstall }
          : {}),
      });

      await this.downloadIndexRepository.upsert(content, {
        status: 'installed',
        progress: null,
        error: null,
      });

      return installed;
    } catch (error) {
      if (
        isMushafPackInstallCanceledError(error) ||
        abortController.signal.aborted ||
        canceledInstallKeys.has(installKey)
      ) {
        await this.downloadIndexRepository.remove(content);
        throw new MushafPackInstallCanceledError(entry.packId, version);
      }

      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      activeInstallAbortControllers.delete(installKey);
      canceledInstallKeys.delete(installKey);
      try {
        await this.fileStore.deleteTemporaryVersionDirectoryAsync(temporaryDirectory);
      } catch (cleanupError) {
        this.logger?.warn(
          'Failed to clean up temporary mushaf pack install directory',
          {
            packId: entry.packId,
            version,
          },
          cleanupError as Error
        );
      }
    }
  }

  async installQcfMadaniV1PackAsync(
    params: InstallQcfMadaniV1PackParams = {}
  ): Promise<MushafPackInstall> {
    return this.installDownloadablePackAsync(QCF_MADANI_V1_PACK.packId, params);
  }

  async installDownloadablePackAsync(
    packId: MushafPackId,
    params: InstallQcfMadaniV1PackParams = {}
  ): Promise<MushafPackInstall> {
    const pack = getDownloadableMushafPackDefinition(packId);
    if (!pack) {
      throw new Error(`Unknown downloadable mushaf pack: ${packId}`);
    }
    if (pack.support !== 'installable') {
      throw new Error(`This mushaf download is not implemented yet: ${packId}`);
    }

    const version = asNonEmptyString(pack.version);
    const content = toDownloadContent(pack.packId, version);
    const installKey = getInstallCancelKey(pack.packId, version);

    const existing = await this.installRegistry.get(pack.packId, version);
    const existingManifest =
      existing && (await this.fileStore.hasInstalledVersionAsync(pack.packId, version))
        ? await this.fileStore.readInstalledManifestAsync(pack.packId, version)
        : null;
    if (
      existing &&
      existingManifest &&
      manifestIncludesExpectedDownloadablePackAssets(pack, existingManifest)
    ) {
      await this.downloadIndexRepository.upsert(content, {
        status: 'installed',
        progress: null,
        error: null,
      });

      if (params.activateOnInstall === true && !existing.isActive) {
        return this.setActiveInstalledVersionAsync(pack.packId, version);
      }

      return existing;
    }

    const pageNumbers = Array.from({ length: pack.totalPages }, (_value, index) => index + 1);
    const shouldInstallPageFonts = Boolean(pack.qcfVersion && pack.pageFontBaseUrl);
    const sharedFontRelativePath = getSharedPackFontRelativePath(pack.packId);
    const sharedFontAssetModule = getSharedPackFontAssetModule(pack.packId);
    const shouldInstallSharedFont = Boolean(sharedFontRelativePath && sharedFontAssetModule);
    const totalFiles =
      pageNumbers.length +
      (shouldInstallPageFonts ? pageNumbers.length : 0) +
      (shouldInstallSharedFont ? 1 : 0) +
      2;
    let completedFiles = 0;
    let lastPersistedCompleted = -1;
    let progressWrite = Promise.resolve();

    await this.downloadIndexRepository.upsert(content, {
      status: 'queued',
      progress: { kind: 'items', completed: completedFiles, total: totalFiles },
      error: null,
    });

    const emitProgress = (activeFile: string, percent: number | null): void => {
      params.onProgress?.({
        completedFiles,
        totalFiles,
        activeFile,
        percent,
      });
    };

    const persistProgressAsync = async (force = false): Promise<void> => {
      if (!force && completedFiles < totalFiles && completedFiles - lastPersistedCompleted < 8) {
        return;
      }

      const completedSnapshot = completedFiles;
      lastPersistedCompleted = completedSnapshot;
      progressWrite = progressWrite.then(() =>
        this.downloadIndexRepository.upsert(content, {
          status: 'downloading',
          progress: { kind: 'items', completed: completedSnapshot, total: totalFiles },
          error: null,
        }).then(() => undefined)
      );
      await progressWrite;
    };

    const temporaryDirectory = await this.fileStore.prepareTemporaryVersionDirectoryAsync(
      pack.packId,
      version
    );
    const abortController = new AbortController();
    activeInstallAbortControllers.set(installKey, abortController);

    try {
      throwIfInstallCanceled(pack.packId, version, abortController.signal);
      await this.downloadIndexRepository.upsert(content, {
        status: 'downloading',
        progress: { kind: 'items', completed: completedFiles, total: totalFiles },
        error: null,
      });

      const localPayload = buildPageAddressableLocalPayload();
      const pages = await runPromisePool(pageNumbers, 4, async (pageNumber) => {
        throwIfInstallCanceled(pack.packId, version, abortController.signal);
        const relativePageFile = buildPageAddressablePageRelativePath(localPayload, pageNumber);

        emitProgress(relativePageFile, 0);
        const page = await fetchMushafPackPageAsync(pack, pageNumber, abortController.signal);
        throwIfInstallCanceled(pack.packId, version, abortController.signal);
        await writeJsonFileAsync(
          `${temporaryDirectory}${relativePageFile}`,
          buildPagePayload(pack.packId, version, pageNumber, page.verses)
        );
        completedFiles += 1;
        emitProgress(relativePageFile, 100);
        await persistProgressAsync();
        return {
          pageNumber,
          lookup: page.lookup,
        };
      });

      throwIfInstallCanceled(pack.packId, version, abortController.signal);
      const assetFiles: MushafPackRemoteFile[] = shouldInstallPageFonts ? pageNumbers.map((pageNumber) => {
        const relativePath = getExactPackPageFontRelativePath(pack.packId, pageNumber);
        if (!relativePath) {
          throw new Error(`Missing local font path mapping for ${pack.packId} page ${pageNumber}`);
        }

        const fontBaseUrl = pack.pageFontBaseUrl;
        const fontFileName = getExactPackPageFontFileName(pack.packId, pageNumber);
        if (!fontBaseUrl) {
          throw new Error('QCF Madani V1 font base URL is not configured');
        }
        if (!fontFileName) {
          throw new Error(`Missing remote font file mapping for ${pack.packId} page ${pageNumber}`);
        }

        return {
          file: relativePath,
          url: `${fontBaseUrl}/${fontFileName}`,
        };
      }) : [];

      if (shouldInstallSharedFont && sharedFontRelativePath && sharedFontAssetModule) {
        assetFiles.push({ file: sharedFontRelativePath });
      }

      const manifest: MushafPackManifest = {
        packId: pack.packId,
        version,
        channel: 'download',
        renderer: pack.renderer,
        script: pack.script,
        lines: pack.lines,
        totalPages: pack.totalPages,
        bundled: false,
        payloadFile: localPayload.lookupFile,
        localPayload,
        assetFiles,
        generatedAt: new Date().toISOString(),
        source: [
          pack.pageDataApiBaseUrl,
          pack.pageFontBaseUrl,
        ]
          .filter(Boolean)
          .join(' | '),
      };

      emitProgress(localPayload.lookupFile, 0);
      throwIfInstallCanceled(pack.packId, version, abortController.signal);
      await writeJsonFileAsync(
        `${temporaryDirectory}${localPayload.lookupFile}`,
        buildPageLookupPayload(
          pack.packId,
          version,
          pack.totalPages,
          Object.fromEntries(pages.map((page) => [String(page.pageNumber), page.lookup]))
        )
      );
      completedFiles += 1;
      emitProgress(localPayload.lookupFile, 100);
      await persistProgressAsync(true);

      emitProgress('manifest.json', 0);
      throwIfInstallCanceled(pack.packId, version, abortController.signal);
      await writeJsonFileAsync(`${temporaryDirectory}manifest.json`, manifest);
      completedFiles += 1;
      emitProgress('manifest.json', 100);
      await persistProgressAsync(true);

      await runPromisePool(assetFiles, 6, async (assetFile) => {
        throwIfInstallCanceled(pack.packId, version, abortController.signal);
        const relativePath = normalizeRelativePath(assetFile.file);
        const assetUrl = assetFile.url?.trim();
        const bundledAssetModule =
          relativePath === sharedFontRelativePath ? sharedFontAssetModule : null;
        if (!assetUrl && !bundledAssetModule) {
          throw new Error(`Missing asset URL for ${relativePath}`);
        }

        const fileUri = `${temporaryDirectory}${relativePath}`;
        emitProgress(relativePath, 0);
        if (bundledAssetModule) {
          await copyBundledAssetAsync(bundledAssetModule, fileUri);
        } else {
          await downloadFileAsync(assetUrl as string, fileUri, (progress) => {
            emitProgress(relativePath, progress.percent);
          }, abortController.signal);
        }
        throwIfInstallCanceled(pack.packId, version, abortController.signal);
        completedFiles += 1;
        emitProgress(relativePath, 100);
        await persistProgressAsync();
      });

      throwIfInstallCanceled(pack.packId, version, abortController.signal);
      await this.fileStore.promoteTemporaryVersionDirectoryAsync(temporaryDirectory, pack.packId, version);

      const installed = await this.installRegistry.upsert({
        packId: pack.packId,
        version,
        channel: 'download',
        ...(typeof params.activateOnInstall === 'boolean'
          ? { isActive: params.activateOnInstall }
          : {}),
      });

      await this.downloadIndexRepository.upsert(content, {
        status: 'installed',
        progress: null,
        error: null,
      });

      return installed;
    } catch (error) {
      if (
        isMushafPackInstallCanceledError(error) ||
        abortController.signal.aborted ||
        canceledInstallKeys.has(installKey)
      ) {
        await this.downloadIndexRepository.remove(content);
        throw new MushafPackInstallCanceledError(pack.packId, version);
      }

      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      activeInstallAbortControllers.delete(installKey);
      canceledInstallKeys.delete(installKey);
      try {
        await this.fileStore.deleteTemporaryVersionDirectoryAsync(temporaryDirectory);
      } catch (cleanupError) {
        this.logger?.warn(
          'Failed to clean up temporary QCF Madani V1 install directory',
          {
            packId: pack.packId,
            version,
          },
          cleanupError as Error
        );
      }
    }
  }

  async cancelDownloadablePackInstallAsync(packId: MushafPackId, version: string): Promise<void> {
    const normalizedVersion = asNonEmptyString(version);
    const installKey = getInstallCancelKey(packId, normalizedVersion);
    canceledInstallKeys.add(installKey);
    activeInstallAbortControllers.get(installKey)?.abort();

    await this.downloadIndexRepository.remove(toDownloadContent(packId, normalizedVersion));
  }

  async deleteInstalledVersionAsync(packId: MushafPackId, version: string): Promise<void> {
    const normalizedVersion = asNonEmptyString(version);
    const content = toDownloadContent(packId, normalizedVersion);
    const existing = await this.installRegistry.get(packId, normalizedVersion);

    await this.downloadIndexRepository.upsert(content, {
      status: 'deleting',
      progress: null,
      error: null,
    });

    try {
      await this.fileStore.deleteInstalledVersionAsync(packId, normalizedVersion);
      await this.installRegistry.remove(packId, normalizedVersion);

      if (existing?.isActive) {
        const fallback = await this.findFallbackInstallAsync(packId, normalizedVersion);
        if (fallback) {
          await this.installRegistry.setActive(packId, fallback.version);
        }
      }

      await this.downloadIndexRepository.remove(content);
    } catch (error) {
      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async setActiveInstalledVersionAsync(
    packId: MushafPackId,
    version: string
  ): Promise<MushafPackInstall> {
    const normalizedVersion = asNonEmptyString(version);
    const manifest = await this.fileStore.readInstalledManifestAsync(packId, normalizedVersion);
    if (!manifest) {
      throw new Error(`No installed mushaf files found for ${packId}@${normalizedVersion}`);
    }

    if (manifest.packId !== packId || manifest.version.trim() !== normalizedVersion) {
      throw new Error(`Installed mushaf manifest mismatch for ${packId}@${normalizedVersion}`);
    }

    const installed = await this.installRegistry.setActive(packId, normalizedVersion);
    await this.downloadIndexRepository.upsert(toDownloadContent(packId, normalizedVersion), {
      status: 'installed',
      progress: null,
      error: null,
    });
    return installed;
  }

  private async findFallbackInstallAsync(
    packId: MushafPackId,
    removedVersion: string
  ): Promise<MushafPackInstall | null> {
    const installs = await this.installRegistry.list();
    const matching = installs
      .filter((install) => install.packId === packId && install.version !== removedVersion)
      .sort((left, right) => right.installedAt - left.installedAt);

    for (const install of matching) {
      if (await this.fileStore.hasInstalledVersionAsync(install.packId, install.version)) {
        return install;
      }
    }

    return null;
  }
}
