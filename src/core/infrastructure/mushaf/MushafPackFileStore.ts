import * as FileSystem from 'expo-file-system/legacy';

import type { MushafPackId, MushafPackManifest } from '@/types';

function getDocumentDirectory(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('FileSystem.documentDirectory is unavailable on this platform');
  }
  return dir;
}

function getCacheDirectory(): string {
  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('FileSystem.cacheDirectory is unavailable on this platform');
  }
  return dir;
}

function normalizePathSegment(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Path segment is required');
  }

  return encodeURIComponent(normalized);
}

function normalizeRelativePath(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');

  if (!normalized) {
    throw new Error('Relative path is required');
  }

  return normalized;
}

function buildDirectoryUri(baseUri: string, segments: string[]): string {
  return `${baseUri}${segments.map(normalizePathSegment).join('/')}/`;
}

export class MushafPackFileStore {
  getBaseDirectoryUri(): string {
    return `${getDocumentDirectory()}mushaf-packs/`;
  }

  getPackDirectoryUri(packId: MushafPackId): string {
    return buildDirectoryUri(this.getBaseDirectoryUri(), [packId]);
  }

  getInstalledVersionDirectoryUri(packId: MushafPackId, version: string): string {
    return buildDirectoryUri(this.getBaseDirectoryUri(), [packId, version]);
  }

  getInstalledFileUri(packId: MushafPackId, version: string, relativePath: string): string {
    return `${this.getInstalledVersionDirectoryUri(packId, version)}${normalizeRelativePath(relativePath)}`;
  }

  getManifestUri(packId: MushafPackId, version: string): string {
    return this.getInstalledFileUri(packId, version, 'manifest.json');
  }

  getTemporaryVersionDirectoryUri(packId: MushafPackId, version: string, token: string): string {
    return buildDirectoryUri(`${getCacheDirectory()}mushaf-packs/`, [packId, `${version}-${token}`]);
  }

  async prepareTemporaryVersionDirectoryAsync(
    packId: MushafPackId,
    version: string,
    token = `${Date.now()}`
  ): Promise<string> {
    const directoryUri = this.getTemporaryVersionDirectoryUri(packId, version, token);
    await FileSystem.deleteAsync(directoryUri, { idempotent: true });
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
    return directoryUri;
  }

  async deleteTemporaryVersionDirectoryAsync(directoryUri: string): Promise<void> {
    await FileSystem.deleteAsync(directoryUri, { idempotent: true });
  }

  async promoteTemporaryVersionDirectoryAsync(
    temporaryDirectoryUri: string,
    packId: MushafPackId,
    version: string
  ): Promise<string> {
    const destinationUri = this.getInstalledVersionDirectoryUri(packId, version);
    await FileSystem.makeDirectoryAsync(this.getPackDirectoryUri(packId), { intermediates: true });
    await FileSystem.deleteAsync(destinationUri, { idempotent: true });
    await FileSystem.moveAsync({
      from: temporaryDirectoryUri,
      to: destinationUri,
    });
    return destinationUri;
  }

  async hasInstalledVersionAsync(packId: MushafPackId, version: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(this.getManifestUri(packId, version));
    return Boolean(info.exists && !info.isDirectory);
  }

  async readInstalledManifestAsync(
    packId: MushafPackId,
    version: string
  ): Promise<MushafPackManifest | null> {
    const manifestUri = this.getManifestUri(packId, version);
    const info = await FileSystem.getInfoAsync(manifestUri);
    if (!info.exists || info.isDirectory) return null;

    const raw = await FileSystem.readAsStringAsync(manifestUri);
    return JSON.parse(raw) as MushafPackManifest;
  }

  async deleteInstalledVersionAsync(packId: MushafPackId, version: string): Promise<void> {
    await FileSystem.deleteAsync(this.getInstalledVersionDirectoryUri(packId, version), {
      idempotent: true,
    });
  }
}
