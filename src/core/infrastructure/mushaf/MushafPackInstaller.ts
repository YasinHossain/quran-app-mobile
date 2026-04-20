import * as FileSystem from 'expo-file-system/legacy';

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
  getExactPackPageFontRelativePath,
} from './downloadablePacks';
import { MushafPackFileStore } from './MushafPackFileStore';

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
  code_v1?: string | null;
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
  words?: QcfApiWordResponse[] | null;
};

type QcfApiPageResponse = {
  verses?: QcfApiVerseResponse[] | null;
};

const PAGE_ADDRESSABLE_LOOKUP_FILE = 'page-data/lookup.json';
const PAGE_ADDRESSABLE_PAGES_DIRECTORY = 'page-data/pages';

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
  'text_qpc_hafs',
  'code_v1',
  'char_type_name',
] as const;

const QCF_V1_PAGE_FIELDS = ['chapter_id', 'hizb_number', 'rub_el_hizb_number', 'text_uthmani'] as const;

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
    codeV1: word.code_v1 ?? undefined,
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
    words: Array.isArray(verse.words) ? verse.words.map(mapQcfV1Word) : [],
  };
}

async function fetchJsonAsync<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-client': 'quran-app-mobile-qcf-v1-installer',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch ${url} (${response.status}): ${errorText.slice(0, 240)}`);
  }

  return (await response.json()) as T;
}

function buildQcfV1PageUrl(pageNumber: number): string {
  const baseUrl = QCF_MADANI_V1_PACK.pageDataApiBaseUrl;
  if (!baseUrl) {
    throw new Error('QCF Madani V1 page data API base URL is not configured');
  }

  const url = new URL(`${baseUrl}/${pageNumber}`);
  url.searchParams.set('words', 'true');
  url.searchParams.set('per_page', 'all');
  url.searchParams.set('filter_page_words', 'true');
  url.searchParams.set('word_fields', QCF_V1_PAGE_WORD_FIELDS.join(','));
  url.searchParams.set('fields', QCF_V1_PAGE_FIELDS.join(','));
  url.searchParams.set('mushaf', '1');
  return url.toString();
}

async function fetchQcfV1PageAsync(pageNumber: number): Promise<{
  pageNumber: number;
  lookup: MushafPackPayload['lookup'][string];
  verses: MushafVerse[];
}> {
  const response = await fetchJsonAsync<QcfApiPageResponse>(buildQcfV1PageUrl(pageNumber));
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
  onProgress?: ((progress: { percent: number | null }) => void) | undefined
): Promise<void> {
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

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error(`Failed to download ${url}`);
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

  async installHostedPackAsync(params: InstallHostedMushafPackParams): Promise<MushafPackInstall> {
    const entry = params.catalogEntry;
    const version = asNonEmptyString(entry.version);
    const content = toDownloadContent(entry.packId, version);

    const existing = await this.installRegistry.get(entry.packId, version);
    if (existing && (await this.fileStore.hasInstalledVersionAsync(entry.packId, version))) {
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

    try {
      await this.downloadIndexRepository.upsert(content, {
        status: 'downloading',
        progress: { kind: 'items', completed: 0, total: 1 },
        error: null,
      });

      const manifestUrl = resolveManifestUrl(entry);
      const temporaryManifestUri = `${temporaryDirectory}manifest.json`;
      await downloadFileAsync(manifestUrl, temporaryManifestUri);
      await verifyDownloadedFileAsync(temporaryManifestUri, {
        checksum: entry.manifestChecksum,
        sizeBytes: entry.manifestSizeBytes,
      });

      let manifest = JSON.parse(
        await FileSystem.readAsStringAsync(temporaryManifestUri)
      ) as MushafPackManifest;
      ensureManifestMatchesCatalog(entry, manifest);

      const files = mergeRemoteFileDescriptors(manifest, entry, manifestUrl);
      const totalFiles = Math.max(1, files.length + 1);
      let completedFiles = 1;

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

      for (const file of files) {
        const temporaryFileUri = `${temporaryDirectory}${normalizeRelativePath(file.file)}`;

        notifyProgress(file.file, 0);
        await downloadFileAsync(file.url, temporaryFileUri, (progress) => {
          notifyProgress(file.file, progress.percent);
        });
        await verifyDownloadedFileAsync(temporaryFileUri, {
          checksum: file.checksum,
          sizeBytes: file.sizeBytes,
        });

        completedFiles += 1;
        await this.downloadIndexRepository.upsert(content, {
          status: 'downloading',
          progress: { kind: 'items', completed: completedFiles, total: totalFiles },
          error: null,
        });
      }

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
      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
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
    const pack = QCF_MADANI_V1_PACK;
    const version = asNonEmptyString(pack.version);
    const content = toDownloadContent(pack.packId, version);

    const existing = await this.installRegistry.get(pack.packId, version);
    if (existing && (await this.fileStore.hasInstalledVersionAsync(pack.packId, version))) {
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
    const totalFiles = pageNumbers.length * 2 + 2;
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

    try {
      await this.downloadIndexRepository.upsert(content, {
        status: 'downloading',
        progress: { kind: 'items', completed: completedFiles, total: totalFiles },
        error: null,
      });

      const localPayload = buildPageAddressableLocalPayload();
      const pages = await runPromisePool(pageNumbers, 4, async (pageNumber) => {
        const relativePageFile = buildPageAddressablePageRelativePath(localPayload, pageNumber);

        emitProgress(relativePageFile, 0);
        const page = await fetchQcfV1PageAsync(pageNumber);
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

      const assetFiles = pageNumbers.map((pageNumber) => {
        const relativePath = getExactPackPageFontRelativePath(pack.packId, pageNumber);
        if (!relativePath) {
          throw new Error(`Missing local font path mapping for ${pack.packId} page ${pageNumber}`);
        }

        const fontBaseUrl = pack.pageFontBaseUrl;
        if (!fontBaseUrl) {
          throw new Error('QCF Madani V1 font base URL is not configured');
        }

        return {
          file: relativePath,
          url: `${fontBaseUrl}/p${pageNumber}.woff2`,
        };
      });

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
      await writeJsonFileAsync(`${temporaryDirectory}manifest.json`, manifest);
      completedFiles += 1;
      emitProgress('manifest.json', 100);
      await persistProgressAsync(true);

      await runPromisePool(assetFiles, 6, async (assetFile) => {
        const relativePath = normalizeRelativePath(assetFile.file);
        const assetUrl = assetFile.url?.trim();
        if (!assetUrl) {
          throw new Error(`Missing asset URL for ${relativePath}`);
        }

        const fileUri = `${temporaryDirectory}${relativePath}`;
        emitProgress(relativePath, 0);
        await downloadFileAsync(assetUrl, fileUri, (progress) => {
          emitProgress(relativePath, progress.percent);
        });
        completedFiles += 1;
        emitProgress(relativePath, 100);
        await persistProgressAsync();
      });

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
      await this.downloadIndexRepository.upsert(content, {
        status: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
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
