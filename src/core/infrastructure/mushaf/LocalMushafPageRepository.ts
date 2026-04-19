import * as FileSystem from 'expo-file-system/legacy';

import type { IMushafPageRepository } from '@/src/core/domain/repositories/IMushafPageRepository';
import type {
  MushafPackId,
  MushafPackManifest,
  MushafPackPayload,
  MushafPageData,
  MushafPageRendererAssets,
  MushafResolvedPackVersion,
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
  payload: MushafPackPayload;
  pack: MushafResolvedPackVersion;
};

const payloadCache = new Map<string, Promise<MushafPackPayload>>();

function getPayloadCacheKey(packId: MushafPackId, version: string): string {
  return `${packId}@${version}`;
}

function normalizePageNumber(pageNumber: number): number {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new MushafInvalidPageNumberError(pageNumber);
  }

  return pageNumber;
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

    if (normalizedPageNumber > resolvedPack.pack.totalPages) {
      throw new MushafPageNotFoundError(packId, resolvedPack.pack.version, normalizedPageNumber);
    }

    const lookup = resolvedPack.payload.lookup[String(normalizedPageNumber)];
    const verses = resolvedPack.payload.pages[String(normalizedPageNumber)] ?? [];

    if (!lookup) {
      throw new MushafPageNotFoundError(packId, resolvedPack.pack.version, normalizedPageNumber);
    }

    return {
      pack: resolvedPack.pack,
      pageNumber: normalizedPageNumber,
      lookup,
      verses,
      pageLines: mapVersesToPageLines(normalizedPageNumber, verses),
      rendererAssets: buildRendererAssets(
        resolvedPack.manifest,
        this.fileStore,
        normalizedPageNumber
      ),
    };
  }

  private async resolvePackDataAsync(packId: MushafPackId): Promise<ResolvedPackData> {
    const activeInstall = await this.installRegistry.getActive(packId);
    if (activeInstall) {
      if (activeInstall.channel === 'bundled') {
        const bundledPack = getBundledMushafPack(packId);
        if (!bundledPack) {
          throw new Error(`Bundled mushaf assets are missing for ${packId}`);
        }

        return {
          manifest: bundledPack.manifest,
          payload: ensurePayloadMatchesManifest(bundledPack.manifest, bundledPack.payload),
          pack: toResolvedPack(bundledPack.manifest),
        };
      }

      const manifest = await this.fileStore.readInstalledManifestAsync(packId, activeInstall.version);
      if (!manifest) {
        throw new MushafPackNotInstalledError(packId);
      }

      return {
        manifest,
        payload: await this.readInstalledPayloadAsync(packId, activeInstall.version, manifest),
        pack: toResolvedPack(manifest),
      };
    }

    const bundledPack = getBundledMushafPack(packId);
    if (!bundledPack) {
      throw new MushafPackNotInstalledError(packId);
    }

    return {
      manifest: bundledPack.manifest,
      payload: ensurePayloadMatchesManifest(bundledPack.manifest, bundledPack.payload),
      pack: toResolvedPack(bundledPack.manifest),
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
}
