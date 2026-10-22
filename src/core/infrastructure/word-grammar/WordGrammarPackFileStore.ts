import * as FileSystem from 'expo-file-system/legacy';

import type {
  WordGrammarPackManifest,
  WordGrammarPackRegistry,
} from './WordGrammarPack.types';

function requireDirectory(value: string | null, label: string): string {
  if (!value) throw new Error(`${label} is unavailable`);
  return value;
}

function segment(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('Grammar pack path segment is required');
  return encodeURIComponent(normalized);
}

async function exists(uri: string, directory: boolean): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && info.isDirectory === directory;
}

export class WordGrammarPackFileStore {
  getBaseDirectoryUri(): string {
    return `${requireDirectory(FileSystem.documentDirectory, 'Document directory')}word-grammar-packs/`;
  }

  getVersionDirectoryUri(packId: string, version: string): string {
    return `${this.getBaseDirectoryUri()}${segment(packId)}/${segment(version)}/`;
  }

  getRegistryUri(): string {
    return `${this.getBaseDirectoryUri()}registry.json`;
  }

  async prepareStagingDirectoryAsync(packId: string, version: string): Promise<string> {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const uri = `${requireDirectory(FileSystem.cacheDirectory, 'Cache directory')}word-grammar-packs/${segment(packId)}/${segment(version)}-${nonce}/`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    return uri;
  }

  async writeManifestAsync(directory: string, manifest: WordGrammarPackManifest): Promise<void> {
    await FileSystem.writeAsStringAsync(`${directory}manifest.json`, JSON.stringify(manifest));
  }

  async readManifestAsync(directory: string): Promise<WordGrammarPackManifest> {
    return JSON.parse(
      await FileSystem.readAsStringAsync(`${directory}manifest.json`)
    ) as WordGrammarPackManifest;
  }

  async promoteStagingDirectoryAsync(staging: string, packId: string, version: string): Promise<string> {
    const destination = this.getVersionDirectoryUri(packId, version);
    const backup = `${destination.slice(0, -1)}.rollback/`;
    await FileSystem.makeDirectoryAsync(`${this.getBaseDirectoryUri()}${segment(packId)}/`, {
      intermediates: true,
    });
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

  async deleteVersionAsync(packId: string, version: string): Promise<void> {
    await FileSystem.deleteAsync(this.getVersionDirectoryUri(packId, version), { idempotent: true });
  }

  async deleteStagingAsync(uri: string): Promise<void> {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  async readRegistryAsync(): Promise<WordGrammarPackRegistry> {
    const uri = this.getRegistryUri();
    if (!(await exists(uri, false))) return { format: 'quran-word-grammar-registry-v1' };
    try {
      const parsed = JSON.parse(
        await FileSystem.readAsStringAsync(uri)
      ) as WordGrammarPackRegistry;
      return parsed.format === 'quran-word-grammar-registry-v1'
        ? parsed
        : { format: 'quran-word-grammar-registry-v1' };
    } catch {
      return { format: 'quran-word-grammar-registry-v1' };
    }
  }

  async writeRegistryAsync(registry: WordGrammarPackRegistry): Promise<void> {
    const base = this.getBaseDirectoryUri();
    const current = this.getRegistryUri();
    const next = `${base}registry.next.json`;
    await FileSystem.makeDirectoryAsync(base, { intermediates: true });
    await FileSystem.writeAsStringAsync(next, JSON.stringify(registry));
    if (await exists(current, false)) await FileSystem.deleteAsync(current, { idempotent: true });
    await FileSystem.moveAsync({ from: next, to: current });
  }
}
