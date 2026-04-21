import * as FileSystem from 'expo-file-system/legacy';

import type {
  FindMushafVersePageParams,
  IMushafPageRepository,
} from '@/src/core/domain/repositories/IMushafPageRepository';
import type {
  MushafPackId,
  MushafPackManifest,
  MushafPackPageAddressableLocalPayload,
  MushafPackPageLookupPayload,
  MushafPackPagePayload,
  MushafPackPayload,
  MushafPageData,
  MushafPageRendererAssets,
  MushafResolvedPackVersion,
  MushafVerse,
} from '@/types';

import type { IMushafPackInstallRegistry } from '@/src/core/domain/repositories/IMushafPackInstallRegistry';

import { getBundledMushafPack } from './bundledPacks';
import {
  getDownloadableMushafPackDefinition,
  getExactPackPageFontFamily,
  getExactPackPageFontRelativePath,
} from './downloadablePacks';
import { MushafPackFileStore } from './MushafPackFileStore';
import { mapVersesToPageLines } from './mushafPageMapping';

type ResolvedPackData = {
  manifest: MushafPackManifest;
  pack: MushafResolvedPackVersion;
  lookup: Record<string, MushafPackPageLookupPayload['lookup'][string]>;
  readVerses: (pageNumber: number) => Promise<MushafVerse[]>;
};

const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;
const RESOLVED_PAGE_DATA_CACHE_MAX_ENTRIES = 16;
const resolvedPackCache = new Map<string, Promise<ResolvedPackData>>();
const payloadCache = new Map<string, Promise<MushafPackPayload>>();
const lookupCache = new Map<string, Promise<MushafPackPageLookupPayload>>();
const pageDataCache = new Map<string, Promise<MushafPageData>>();
const resolvedPageDataCache = new Map<string, MushafPageData>();
const activePageCacheVersionByPackId = new Map<MushafPackId, string>();
let activePageCacheIdentity: string | null = null;

type ParsedVerseKey = {
  surahId: number;
  verseNumber: number;
};

function getPayloadCacheKey(packId: MushafPackId, version: string): string {
  return `${packId}@${version}`;
}

function getPackVersionCacheIdentity(packId: MushafPackId, version: string): string {
  return `${packId}@${version.trim()}`;
}

function getPageDataCacheKey(packId: MushafPackId, version: string, pageNumber: number): string {
  return `${packId}|${version}|${pageNumber}`;
}

function touchCacheEntry<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);
}

function readResolvedPageDataCache(cacheKey: string): MushafPageData | null {
  const cached = resolvedPageDataCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  touchCacheEntry(resolvedPageDataCache, cacheKey, cached);
  return cached;
}

function writeResolvedPageDataCache(cacheKey: string, pageData: MushafPageData): void {
  touchCacheEntry(resolvedPageDataCache, cacheKey, pageData);

  while (resolvedPageDataCache.size > RESOLVED_PAGE_DATA_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = resolvedPageDataCache.keys().next().value;
    if (!oldestCacheKey) {
      break;
    }

    resolvedPageDataCache.delete(oldestCacheKey);
  }
}

function shouldUseActivePageCaches(packId: MushafPackId, version: string): boolean {
  return (
    activePageCacheIdentity === null ||
    activePageCacheIdentity === getPackVersionCacheIdentity(packId, version)
  );
}

function logMushafQcfDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][LocalMushafPageRepository] ${event}`, details);
}

function normalizePageNumber(pageNumber: number): number {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new MushafInvalidPageNumberError(pageNumber);
  }

  return pageNumber;
}

function parseVerseKey(value: string): ParsedVerseKey | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [surahRaw, verseRaw] = trimmed.split(':');
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);

  if (!Number.isInteger(surahId) || surahId <= 0) {
    return null;
  }

  if (!Number.isInteger(verseNumber) || verseNumber <= 0) {
    return null;
  }

  return { surahId, verseNumber };
}

function compareVerseKeys(left: ParsedVerseKey, right: ParsedVerseKey): number {
  if (left.surahId !== right.surahId) {
    return left.surahId - right.surahId;
  }

  return left.verseNumber - right.verseNumber;
}

function isVerseWithinLookupRange(
  verse: ParsedVerseKey,
  lookup: MushafPackPageLookupPayload['lookup'][string]
): boolean {
  const firstVerse = parseVerseKey(lookup.firstVerseKey ?? lookup.from);
  const lastVerse = parseVerseKey(lookup.lastVerseKey ?? lookup.to);
  if (!firstVerse || !lastVerse) {
    return false;
  }

  return compareVerseKeys(verse, firstVerse) >= 0 && compareVerseKeys(verse, lastVerse) <= 0;
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

function ensureLookupPayloadMatchesManifest(
  manifest: MushafPackManifest,
  payload: MushafPackPageLookupPayload
): MushafPackPageLookupPayload {
  if (payload.packId !== manifest.packId) {
    throw new Error(
      `Installed mushaf lookup packId mismatch: expected ${manifest.packId}, received ${payload.packId}`
    );
  }

  if (payload.version.trim() !== manifest.version.trim()) {
    throw new Error(
      `Installed mushaf lookup version mismatch: expected ${manifest.version}, received ${payload.version}`
    );
  }

  return payload;
}

function ensurePagePayloadMatchesManifest(
  manifest: MushafPackManifest,
  payload: MushafPackPagePayload,
  pageNumber: number
): MushafPackPagePayload {
  if (payload.packId !== manifest.packId) {
    throw new Error(
      `Installed mushaf page packId mismatch: expected ${manifest.packId}, received ${payload.packId}`
    );
  }

  if (payload.version.trim() !== manifest.version.trim()) {
    throw new Error(
      `Installed mushaf page version mismatch: expected ${manifest.version}, received ${payload.version}`
    );
  }

  if (payload.pageNumber !== pageNumber) {
    throw new Error(
      `Installed mushaf page number mismatch: expected ${pageNumber}, received ${payload.pageNumber}`
    );
  }

  return payload;
}

function toResolvedPack(manifest: MushafPackManifest): MushafResolvedPackVersion {
  return {
    packId: manifest.packId,
    version: manifest.version,
    channel: manifest.channel,
    renderer: manifest.renderer,
    script: manifest.script,
    lines: manifest.lines,
    totalPages: manifest.totalPages,
    isBundled: manifest.bundled,
  };
}

function manifestIncludesAsset(manifest: MushafPackManifest, relativePath: string): boolean {
  return Boolean(
    manifest.assetFiles?.some((asset) => asset.file.trim().replace(/\\/g, '/') === relativePath)
  );
}

function buildRendererAssets(
  manifest: MushafPackManifest,
  fileStore: MushafPackFileStore,
  pageNumber: number
): MushafPageRendererAssets | undefined {
  if (manifest.channel !== 'download' || manifest.renderer !== 'webview') {
    return undefined;
  }

  const packDefinition = getDownloadableMushafPackDefinition(manifest.packId);
  const packDirectoryUri = fileStore.getInstalledVersionDirectoryUri(manifest.packId, manifest.version);

  if (!packDefinition?.qcfVersion) {
    return {
      packDirectoryUri,
    };
  }

  const fontRelativePath = getExactPackPageFontRelativePath(manifest.packId, pageNumber);
  const pageFontFileUri =
    fontRelativePath && manifestIncludesAsset(manifest, fontRelativePath)
      ? fileStore.getInstalledFileUri(manifest.packId, manifest.version, fontRelativePath)
      : undefined;

  return {
    packDirectoryUri,
    pageFontFileUri,
    ...(pageFontFileUri
      ? {
          pageFontFamily: getExactPackPageFontFamily(pageNumber, packDefinition.qcfVersion),
        }
      : {}),
    qcfVersion: packDefinition.qcfVersion,
  };
}

async function parseJsonFileAsync<T>(fileUri: string): Promise<T> {
  const raw = await FileSystem.readAsStringAsync(fileUri);
  return JSON.parse(raw) as T;
}

export class MushafPackNotInstalledError extends Error {
  readonly code = 'PACK_NOT_INSTALLED';

  constructor(readonly packId: MushafPackId) {
    super(`The mushaf pack "${packId}" is not installed locally.`);
    this.name = 'MushafPackNotInstalledError';
  }
}

export class MushafInvalidPageNumberError extends Error {
  readonly code = 'INVALID_PAGE_NUMBER';

  constructor(readonly pageNumber: number) {
    super(`Invalid mushaf page number: ${pageNumber}`);
    this.name = 'MushafInvalidPageNumberError';
  }
}

export class MushafPageNotFoundError extends Error {
  readonly code = 'PAGE_NOT_FOUND';

  constructor(
    readonly packId: MushafPackId,
    readonly version: string,
    readonly pageNumber: number
  ) {
    super(`Mushaf page ${pageNumber} was not found in ${packId}@${version}.`);
    this.name = 'MushafPageNotFoundError';
  }
}

export class LocalMushafPageRepository implements IMushafPageRepository {
  constructor(
    private readonly installRegistry: IMushafPackInstallRegistry,
    private readonly fileStore: MushafPackFileStore
  ) {}

  async getPage({
    packId,
    pageNumber,
  }: {
    packId: MushafPackId;
    pageNumber: number;
  }): Promise<MushafPageData> {
    const normalizedPageNumber = normalizePageNumber(pageNumber);
    const resolvedPack = await this.resolvePackDataAsync(packId);

    return this.getPageFromResolvedPackAsync(resolvedPack, normalizedPageNumber);
  }

  async findPageForVerse({
    packId,
    verseKey,
  }: FindMushafVersePageParams): Promise<number | null> {
    const parsedVerseKey = parseVerseKey(verseKey);
    if (!parsedVerseKey) {
      return null;
    }

    const resolvedPack = await this.resolvePackDataAsync(packId);

    for (let pageNumber = 1; pageNumber <= resolvedPack.pack.totalPages; pageNumber += 1) {
      const lookup = resolvedPack.lookup[String(pageNumber)];
      if (!lookup) {
        continue;
      }

      if (isVerseWithinLookupRange(parsedVerseKey, lookup)) {
        return pageNumber;
      }
    }

    return null;
  }

  setActivePageCacheIdentity(params: { packId: MushafPackId; version: string }): void {
    const nextIdentity = getPackVersionCacheIdentity(params.packId, params.version);
    if (activePageCacheIdentity === nextIdentity) {
      return;
    }

    const previousIdentity = activePageCacheIdentity;
    activePageCacheIdentity = nextIdentity;
    pageDataCache.clear();
    resolvedPageDataCache.clear();

    logMushafQcfDev('page-cache-identity-reset', {
      nextIdentity,
      previousIdentity,
    });
  }

  peekCachedPage(params: {
    packId: MushafPackId;
    pageNumber: number;
    expectedVersion?: string;
  }): MushafPageData | null {
    if (!Number.isInteger(params.pageNumber) || params.pageNumber < 1) {
      return null;
    }

    const candidateVersions = new Set<string>();
    const expectedVersion = params.expectedVersion?.trim();
    if (expectedVersion) {
      candidateVersions.add(expectedVersion);
    }

    const activeVersion = activePageCacheVersionByPackId.get(params.packId);
    if (activeVersion) {
      candidateVersions.add(activeVersion);
    }

    for (const candidateVersion of candidateVersions) {
      if (!shouldUseActivePageCaches(params.packId, candidateVersion)) {
        continue;
      }

      const cached = readResolvedPageDataCache(
        getPageDataCacheKey(params.packId, candidateVersion, params.pageNumber)
      );
      if (cached) {
        return cached;
      }
    }

    return null;
  }

  async prefetchPages(params: {
    packId: MushafPackId;
    pageNumbers: number[];
    expectedVersion?: string;
  }): Promise<void> {
    const normalizedPageNumbers = Array.from(
      new Set(
        params.pageNumbers
          .filter((candidate) => Number.isInteger(candidate) && candidate > 0)
          .map((candidate) => normalizePageNumber(candidate))
      )
    );

    if (normalizedPageNumbers.length === 0) {
      return;
    }

    const resolvedPack = await this.resolvePackDataAsync(params.packId);
    if (
      params.expectedVersion &&
      resolvedPack.pack.version.trim() !== params.expectedVersion.trim()
    ) {
      logMushafQcfDev('prefetch-skipped-version-mismatch', {
        expectedVersion: params.expectedVersion,
        packId: params.packId,
        resolvedVersion: resolvedPack.pack.version,
      });
      return;
    }

    const pageNumbers = normalizedPageNumbers.filter(
      (candidate) => candidate <= resolvedPack.pack.totalPages
    );
    if (pageNumbers.length === 0) {
      return;
    }

    logMushafQcfDev('prefetch-start', {
      packId: params.packId,
      pageNumbers,
      version: resolvedPack.pack.version,
    });

    await Promise.all(
      pageNumbers.map(async (candidate) => {
        try {
          await this.getPageFromResolvedPackAsync(resolvedPack, candidate);
        } catch (error) {
          logMushafQcfDev('prefetch-error', {
            error: error instanceof Error ? error.message : String(error),
            packId: params.packId,
            pageNumber: candidate,
            version: resolvedPack.pack.version,
          });
        }
      })
    );
  }

  private async getPageFromResolvedPackAsync(
    resolvedPack: ResolvedPackData,
    pageNumber: number
  ): Promise<MushafPageData> {
    this.prunePackCachesForVersionChange(resolvedPack.pack.packId, resolvedPack.pack.version);
    const usePageCaches = shouldUseActivePageCaches(
      resolvedPack.pack.packId,
      resolvedPack.pack.version
    );

    if (pageNumber > resolvedPack.pack.totalPages) {
      throw new MushafPageNotFoundError(
        resolvedPack.pack.packId,
        resolvedPack.pack.version,
        pageNumber
      );
    }

    const cacheKey = getPageDataCacheKey(
      resolvedPack.pack.packId,
      resolvedPack.pack.version,
      pageNumber
    );
    const resolvedSnapshot = usePageCaches ? readResolvedPageDataCache(cacheKey) : null;
    if (resolvedSnapshot) {
      logMushafQcfDev('page-cache-hit', {
        cacheKey,
        kind: 'resolved',
        packId: resolvedPack.pack.packId,
        pageNumber,
        version: resolvedPack.pack.version,
      });
      return resolvedSnapshot;
    }

    const existing = usePageCaches ? pageDataCache.get(cacheKey) : undefined;
    if (existing) {
      logMushafQcfDev('page-cache-hit', {
        cacheKey,
        kind: 'in-flight',
        packId: resolvedPack.pack.packId,
        pageNumber,
        version: resolvedPack.pack.version,
      });
      return existing;
    }

    const loadPromise = Promise.resolve().then(async () => {
      const lookup = resolvedPack.lookup[String(pageNumber)];

      if (!lookup) {
        throw new MushafPageNotFoundError(
          resolvedPack.pack.packId,
          resolvedPack.pack.version,
          pageNumber
        );
      }

      const verses = await resolvedPack.readVerses(pageNumber);

      const pageData: MushafPageData = {
        pack: resolvedPack.pack,
        pageNumber,
        lookup,
        verses,
        pageLines: mapVersesToPageLines(pageNumber, verses),
        rendererAssets: buildRendererAssets(resolvedPack.manifest, this.fileStore, pageNumber),
      };

      if (
        usePageCaches &&
        shouldUseActivePageCaches(resolvedPack.pack.packId, resolvedPack.pack.version)
      ) {
        writeResolvedPageDataCache(cacheKey, pageData);
      }

      return pageData;
    });

    if (usePageCaches) {
      pageDataCache.set(cacheKey, loadPromise);
    }

    try {
      return await loadPromise;
    } finally {
      pageDataCache.delete(cacheKey);
    }
  }

  private async resolvePackDataAsync(packId: MushafPackId): Promise<ResolvedPackData> {
    const activeInstall = await this.installRegistry.getActive(packId);
    if (activeInstall) {
      if (activeInstall.channel === 'bundled') {
        return this.resolveBundledPackDataAsync(packId);
      }

      return this.resolveInstalledPackDataAsync(packId, activeInstall.version);
    }

    return this.resolveBundledPackDataAsync(packId);
  }

  private finalizeResolvedPackData(packId: MushafPackId, resolvedPackData: ResolvedPackData): ResolvedPackData {
    this.prunePackCachesForVersionChange(packId, resolvedPackData.pack.version);
    return resolvedPackData;
  }

  private prunePackCachesForVersionChange(packId: MushafPackId, activeVersion: string): void {
    const previousVersion = activePageCacheVersionByPackId.get(packId);
    if (previousVersion === activeVersion) {
      return;
    }

    activePageCacheVersionByPackId.set(packId, activeVersion);

    for (const cacheKey of pageDataCache.keys()) {
      const [cachedPackId, cachedVersion] = cacheKey.split('|');
      if (cachedPackId !== packId || cachedVersion === activeVersion) {
        continue;
      }

      pageDataCache.delete(cacheKey);
    }

    for (const cacheKey of resolvedPageDataCache.keys()) {
      const [cachedPackId, cachedVersion] = cacheKey.split('|');
      if (cachedPackId !== packId || cachedVersion === activeVersion) {
        continue;
      }

      resolvedPageDataCache.delete(cacheKey);
    }

    for (const cacheKey of resolvedPackCache.keys()) {
      const [cachedPackId, cachedVersion] = cacheKey.split('@');
      if (cachedPackId !== packId || cachedVersion === activeVersion) {
        continue;
      }

      resolvedPackCache.delete(cacheKey);
    }

    for (const cacheKey of payloadCache.keys()) {
      const [cachedPackId, cachedVersion] = cacheKey.split('@');
      if (cachedPackId !== packId || cachedVersion === activeVersion) {
        continue;
      }

      payloadCache.delete(cacheKey);
    }

    for (const cacheKey of lookupCache.keys()) {
      const [cachedPackId, cachedVersion] = cacheKey.split('@');
      if (cachedPackId !== packId || cachedVersion === activeVersion) {
        continue;
      }

      lookupCache.delete(cacheKey);
    }

    logMushafQcfDev('page-cache-pruned-pack-version-change', {
      activeVersion,
      packId,
      previousVersion: previousVersion ?? null,
    });
  }

  private async resolveBundledPackDataAsync(packId: MushafPackId): Promise<ResolvedPackData> {
    const bundledPack = getBundledMushafPack(packId);
    if (!bundledPack) {
      throw new MushafPackNotInstalledError(packId);
    }

    const version = bundledPack.manifest.version.trim();
    this.prunePackCachesForVersionChange(packId, version);

    const cacheKey = getPayloadCacheKey(packId, version);
    const existing = resolvedPackCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const loadPromise = Promise.resolve().then(() => {
      const payload = ensurePayloadMatchesManifest(bundledPack.manifest, bundledPack.payload);

      return this.finalizeResolvedPackData(packId, {
        manifest: bundledPack.manifest,
        pack: toResolvedPack(bundledPack.manifest),
        lookup: payload.lookup,
        readVerses: async (pageNumber) => payload.pages[String(pageNumber)] ?? [],
      });
    });

    resolvedPackCache.set(cacheKey, loadPromise);

    try {
      return await loadPromise;
    } catch (error) {
      resolvedPackCache.delete(cacheKey);
      throw error;
    }
  }

  private async resolveInstalledPackDataAsync(
    packId: MushafPackId,
    version: string
  ): Promise<ResolvedPackData> {
    const normalizedVersion = version.trim();
    this.prunePackCachesForVersionChange(packId, normalizedVersion);

    const cacheKey = getPayloadCacheKey(packId, normalizedVersion);
    const existing = resolvedPackCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const loadPromise = (async () => {
      const manifest = await this.fileStore.readInstalledManifestAsync(packId, normalizedVersion);
      if (!manifest) {
        throw new MushafPackNotInstalledError(packId);
      }

      return this.finalizeResolvedPackData(
        packId,
        await this.buildInstalledResolvedPackDataAsync(packId, normalizedVersion, manifest)
      );
    })();

    resolvedPackCache.set(cacheKey, loadPromise);

    try {
      return await loadPromise;
    } catch (error) {
      resolvedPackCache.delete(cacheKey);
      throw error;
    }
  }

  private async buildInstalledResolvedPackDataAsync(
    packId: MushafPackId,
    version: string,
    manifest: MushafPackManifest
  ): Promise<ResolvedPackData> {
    if (manifest.localPayload?.format === 'page-json-v1') {
      const lookupPayload = await this.readInstalledLookupPayloadAsync(
        packId,
        version,
        manifest,
        manifest.localPayload
      );

      return {
        manifest,
        pack: toResolvedPack(manifest),
        lookup: lookupPayload.lookup,
        readVerses: async (pageNumber) =>
          this.readInstalledPageVersesAsync(
            packId,
            version,
            manifest,
            manifest.localPayload as MushafPackPageAddressableLocalPayload,
            pageNumber
          ),
      };
    }

    const payload = await this.readInstalledPayloadAsync(packId, version, manifest);
    return {
      manifest,
      pack: toResolvedPack(manifest),
      lookup: payload.lookup,
      readVerses: async (pageNumber) => payload.pages[String(pageNumber)] ?? [],
    };
  }

  private async readInstalledPayloadAsync(
    packId: MushafPackId,
    version: string,
    manifest: MushafPackManifest
  ): Promise<MushafPackPayload> {
    const normalizedPayloadFile = manifest.payloadFile.trim();
    if (!normalizedPayloadFile.toLowerCase().endsWith('.json')) {
      throw new Error(`Unsupported mushaf payload format for ${packId}@${version}: ${manifest.payloadFile}`);
    }

    const cacheKey = getPayloadCacheKey(packId, version);
    const existing = payloadCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const loadPromise = (async () => {
      const fileUri = this.fileStore.getInstalledFileUri(packId, version, manifest.payloadFile);
      return ensurePayloadMatchesManifest(manifest, await parseJsonFileAsync<MushafPackPayload>(fileUri));
    })();

    payloadCache.set(cacheKey, loadPromise);

    try {
      return await loadPromise;
    } catch (error) {
      payloadCache.delete(cacheKey);
      throw error;
    }
  }

  private async readInstalledLookupPayloadAsync(
    packId: MushafPackId,
    version: string,
    manifest: MushafPackManifest,
    localPayload: MushafPackPageAddressableLocalPayload
  ): Promise<MushafPackPageLookupPayload> {
    const cacheKey = getPayloadCacheKey(packId, version);
    const existing = lookupCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const loadPromise = (async () => {
      const fileUri = this.fileStore.getInstalledLookupFileUri(packId, version, localPayload);
      return ensureLookupPayloadMatchesManifest(
        manifest,
        await parseJsonFileAsync<MushafPackPageLookupPayload>(fileUri)
      );
    })();

    lookupCache.set(cacheKey, loadPromise);

    try {
      return await loadPromise;
    } catch (error) {
      lookupCache.delete(cacheKey);
      throw error;
    }
  }

  private async readInstalledPageVersesAsync(
    packId: MushafPackId,
    version: string,
    manifest: MushafPackManifest,
    localPayload: MushafPackPageAddressableLocalPayload,
    pageNumber: number
  ): Promise<MushafVerse[]> {
    const fileUri = this.fileStore.getInstalledPageFileUri(packId, version, localPayload, pageNumber);
    const payload = ensurePagePayloadMatchesManifest(
      manifest,
      await parseJsonFileAsync<MushafPackPagePayload>(fileUri),
      pageNumber
    );
    return payload.verses;
  }
}
