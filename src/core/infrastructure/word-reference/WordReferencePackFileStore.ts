import * as FileSystem from 'expo-file-system/legacy';

import type {
  WordReferencePackManifest,
  WordReferencePackRegistry,
} from './WordReferencePack.types';

function requireDirectory(value: string | null, label: string): string {
  if (!value) throw new Error(`${label} is unavailable`);
  return value;
}

function segment(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('Dictionary pack path segment is required');
  return encodeURIComponent(normalized);
}

async function exists(uri: string, directory: boolean): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && info.isDirectory === directory;
}

export class WordReferencePackFileStore {
  getBaseDirectoryUri(): string {
    return `${requireDirectory(FileSystem.documentDirectory, 'Document directory')}word-reference-packs/`;
  }

  getVersionDirectoryUri(packId: string, version: string): string {
    return `${this.getBaseDirectoryUri()}${segment(packId)}/${segment(version)}/`;
  }

  getRegistryUri(): string {
    return `${this.getBaseDirectoryUri()}registry.json`;
  }

  async prepareStagingDirectoryAsync(packId: string, version: string): Promise<string> {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const uri = `${requireDirectory(FileSystem.cacheDirectory, 'Cache directory')}word-reference-packs/${segment(packId)}/${segment(version)}-${nonce}/`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    return uri;
  }

  async writeManifestAsync(directoryUri: string, manifest: WordReferencePackManifest): Promise<void> {
    await FileSystem.writeAsStringAsync(`${directoryUri}manifest.json`, JSON.stringify(manifest));
  }

  async readManifestAsync(directoryUri: string): Promise<WordReferencePackManifest> {
    return JSON.parse(
      await FileSystem.readAsStringAsync(`${directoryUri}manifest.json`)
    ) as WordReferencePackManifest;
  }

  async promoteStagingDirectoryAsync(staging: string, packId: string, version: string): Promise<string> {
    const destination = this.getVersionDirectoryUri(packId, version);
    const backup = `${destination.slice(0, -1)}.rollback/`;
    await FileSystem.makeDirectoryAsync(`${this.getBaseDirectoryUri()}${segment(packId)}/`, { intermediates: true });
    await FileSystem.deleteAsync(backup, { idempotent: true });
    if (await exists(destination, true)) await FileSystem.moveAsync({ from: destination, to: backup });
    try {
      await FileSystem.moveAsync({ from: staging, to: destination });
      await FileSystem.deleteAsync(backup, { idempotent: true });
      return destination;
    } catch (error) {
      if (!(await exists(destination, true)) && (await exists(backup, true))) {
        await FileSystem.moveAsync({ from: backup, to: destination });
      }
      throw error;
    }
  }

  async recoverPromotionAsync(packId: string, version: string): Promise<void> {
    const destination = this.getVersionDirectoryUri(packId, version);
    const backup = `${destination.slice(0, -1)}.rollback/`;
    const [hasDestination, hasBackup] = await Promise.all([exists(destination, true), exists(backup, true)]);
    if (!hasDestination && hasBackup) await FileSystem.moveAsync({ from: backup, to: destination });
    else if (hasDestination && hasBackup) await FileSystem.deleteAsync(backup, { idempotent: true });
  }

  async deleteVersionAsync(packId: string, version: string): Promise<void> {
    await FileSystem.deleteAsync(this.getVersionDirectoryUri(packId, version), { idempotent: true });
  }

  async deleteStagingAsync(uri: string): Promise<void> {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  async readRegistryAsync(): Promise<WordReferencePackRegistry> {
    await this.recoverRegistryAsync();
    if (!(await exists(this.getRegistryUri(), false))) {
      return { format: 'quran-word-reference-registry-v1', packs: {} };
    }
    try {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(this.getRegistryUri())) as WordReferencePackRegistry;
      return parsed.format === 'quran-word-reference-registry-v1' && parsed.packs
        ? parsed
        : { format: 'quran-word-reference-registry-v1', packs: {} };
    } catch {
      return { format: 'quran-word-reference-registry-v1', packs: {} };
    }
  }

  async writeRegistryAsync(registry: WordReferencePackRegistry): Promise<void> {
    const base = this.getBaseDirectoryUri();
    const current = this.getRegistryUri();
    const next = `${base}registry.next.json`;
    const backup = `${base}registry.rollback.json`;
    await FileSystem.makeDirectoryAsync(base, { intermediates: true });
    await FileSystem.deleteAsync(next, { idempotent: true });
    await FileSystem.writeAsStringAsync(next, JSON.stringify(registry));
    await FileSystem.deleteAsync(backup, { idempotent: true });
    if (await exists(current, false)) await FileSystem.moveAsync({ from: current, to: backup });
    try {
      await FileSystem.moveAsync({ from: next, to: current });
      await FileSystem.deleteAsync(backup, { idempotent: true });
    } catch (error) {
      if (!(await exists(current, false)) && (await exists(backup, false))) {
        await FileSystem.moveAsync({ from: backup, to: current });
      }
      throw error;
    }
  }

  private async recoverRegistryAsync(): Promise<void> {
    const current = this.getRegistryUri();
    const backup = `${this.getBaseDirectoryUri()}registry.rollback.json`;
    const [hasCurrent, hasBackup] = await Promise.all([exists(current, false), exists(backup, false)]);
    if (!hasCurrent && hasBackup) await FileSystem.moveAsync({ from: backup, to: current });
    else if (hasCurrent && hasBackup) await FileSystem.deleteAsync(backup, { idempotent: true });
  }
}
