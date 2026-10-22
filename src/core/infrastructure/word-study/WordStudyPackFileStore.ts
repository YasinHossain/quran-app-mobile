import * as FileSystem from 'expo-file-system/legacy';

import type {
  WordStudyPackActivationState,
  WordStudyPackManifest,
} from './WordStudyPack.types';

function documentDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error('Document directory is unavailable');
  return FileSystem.documentDirectory;
}

function cacheDirectory(): string {
  if (!FileSystem.cacheDirectory) throw new Error('Cache directory is unavailable');
  return FileSystem.cacheDirectory;
}

function segment(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('Word-study pack path segment is required');
  return encodeURIComponent(normalized);
}

async function fileExistsAsync(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory;
}

async function directoryExistsAsync(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && info.isDirectory;
}

export class WordStudyPackFileStore {
  getBaseDirectoryUri(): string {
    return `${documentDirectory()}word-study-packs/`;
  }

  getVersionDirectoryUri(packId: string, version: string): string {
    return `${this.getBaseDirectoryUri()}${segment(packId)}/${segment(version)}/`;
  }

  getDatabaseUri(packId: string, version: string, databaseFile: string): string {
    return `${this.getVersionDirectoryUri(packId, version)}${segment(databaseFile)}`;
  }

  getActivationStateUri(): string {
    return `${this.getBaseDirectoryUri()}active.json`;
  }

  async prepareStagingDirectoryAsync(packId: string, version: string): Promise<string> {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const uri = `${cacheDirectory()}word-study-packs/${segment(packId)}/${segment(version)}-${nonce}/`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    return uri;
  }

  async deleteStagingDirectoryAsync(uri: string): Promise<void> {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  async deleteVersionAsync(packId: string, version: string): Promise<void> {
    await FileSystem.deleteAsync(this.getVersionDirectoryUri(packId, version), {
      idempotent: true,
    });
  }

  async writeManifestAsync(directoryUri: string, manifest: WordStudyPackManifest): Promise<void> {
    await FileSystem.writeAsStringAsync(`${directoryUri}manifest.json`, JSON.stringify(manifest));
  }

  async readManifestAsync(directoryUri: string): Promise<WordStudyPackManifest> {
    const raw = await FileSystem.readAsStringAsync(`${directoryUri}manifest.json`);
    return JSON.parse(raw) as WordStudyPackManifest;
  }

  async recoverInterruptedPromotionAsync(packId: string, version: string): Promise<void> {
    const destination = this.getVersionDirectoryUri(packId, version);
    const backup = `${destination.slice(0, -1)}.rollback/`;
    const [hasDestination, hasBackup] = await Promise.all([
      directoryExistsAsync(destination),
      directoryExistsAsync(backup),
    ]);
    if (!hasDestination && hasBackup) {
      await FileSystem.moveAsync({ from: backup, to: destination });
    } else if (hasDestination && hasBackup) {
      await FileSystem.deleteAsync(backup, { idempotent: true });
    }
  }

  async promoteStagingDirectoryAsync(
    stagingDirectoryUri: string,
    packId: string,
    version: string
  ): Promise<string> {
    const destination = this.getVersionDirectoryUri(packId, version);
    const backup = `${destination.slice(0, -1)}.rollback/`;
    await FileSystem.makeDirectoryAsync(`${this.getBaseDirectoryUri()}${segment(packId)}/`, {
      intermediates: true,
    });
    await FileSystem.deleteAsync(backup, { idempotent: true });
    const destinationExists = await directoryExistsAsync(destination);
    if (destinationExists) await FileSystem.moveAsync({ from: destination, to: backup });
    try {
      await FileSystem.moveAsync({ from: stagingDirectoryUri, to: destination });
      await FileSystem.deleteAsync(backup, { idempotent: true });
      return destination;
    } catch (error) {
      if (!(await directoryExistsAsync(destination)) && (await directoryExistsAsync(backup))) {
        await FileSystem.moveAsync({ from: backup, to: destination });
      }
      throw error;
    }
  }

  async readActivationStateAsync(): Promise<WordStudyPackActivationState | null> {
    await this.recoverActivationStateAsync();
    const uri = this.getActivationStateUri();
    if (!(await fileExistsAsync(uri))) return null;
    let state: WordStudyPackActivationState;
    try {
      state = JSON.parse(await FileSystem.readAsStringAsync(uri)) as WordStudyPackActivationState;
    } catch {
      return null;
    }
    if (state.format !== 'quran-word-study-activation-v1' || !state.active) return null;
    return state;
  }

  async writeActivationStateAsync(state: WordStudyPackActivationState): Promise<void> {
    const base = this.getBaseDirectoryUri();
    const active = this.getActivationStateUri();
    const next = `${base}active.next.json`;
    const backup = `${base}active.rollback.json`;
    await FileSystem.makeDirectoryAsync(base, { intermediates: true });
    await FileSystem.deleteAsync(next, { idempotent: true });
    await FileSystem.writeAsStringAsync(next, JSON.stringify(state));
    await FileSystem.deleteAsync(backup, { idempotent: true });
    if (await fileExistsAsync(active)) await FileSystem.moveAsync({ from: active, to: backup });
    try {
      await FileSystem.moveAsync({ from: next, to: active });
      await FileSystem.deleteAsync(backup, { idempotent: true });
    } catch (error) {
      if (!(await fileExistsAsync(active)) && (await fileExistsAsync(backup))) {
        await FileSystem.moveAsync({ from: backup, to: active });
      }
      throw error;
    }
  }

  async clearActivationStateAsync(): Promise<void> {
    const base = this.getBaseDirectoryUri();
    await Promise.all([
      FileSystem.deleteAsync(this.getActivationStateUri(), { idempotent: true }),
      FileSystem.deleteAsync(`${base}active.next.json`, { idempotent: true }),
      FileSystem.deleteAsync(`${base}active.rollback.json`, { idempotent: true }),
    ]);
  }

  private async recoverActivationStateAsync(): Promise<void> {
    const active = this.getActivationStateUri();
    const backup = `${this.getBaseDirectoryUri()}active.rollback.json`;
    const [hasActive, hasBackup] = await Promise.all([
      fileExistsAsync(active),
      fileExistsAsync(backup),
    ]);
    if (!hasActive && hasBackup) {
      await FileSystem.moveAsync({ from: backup, to: active });
    } else if (hasActive && hasBackup) {
      await FileSystem.deleteAsync(backup, { idempotent: true });
    }
  }
}
