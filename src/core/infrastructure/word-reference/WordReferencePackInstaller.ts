import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync } from 'expo-sqlite';

import type { DownloadableContent } from '@/src/core/domain/entities/DownloadIndexItem';
import type { DownloadIndexRepository } from '@/src/core/infrastructure/repositories/DownloadIndexRepository';

import { WordReferencePackFileStore } from './WordReferencePackFileStore';
import {
  WORD_REFERENCE_PACK_APPLICATION_ID,
  WORD_REFERENCE_PACK_SCHEMA_VERSION,
  assertCompatibleWordReferenceManifest,
  type ReadyWordReferencePack,
  type WordReferenceInstalledPackRef,
  type WordReferencePackCatalogEntry,
  type WordReferencePackManifest,
} from './WordReferencePack.types';
import {
  activateWordReferencePack,
  removeWordReferencePackVersion,
  rollbackWordReferencePack,
} from './WordReferencePackRegistry';

type PragmaRow = { value: number };
type CheckRow = { result: string };
type MetadataRow = { value: string };

function content(entry: WordReferencePackCatalogEntry): DownloadableContent {
  return {
    kind: 'word-reference-pack',
    packId: entry.packId,
    version: entry.version,
    sourceId: entry.sourceId,
    languageCode: entry.languageCode,
  };
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256FileAsync(uri: string): Promise<string> {
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await new File(uri).bytes()));
}

export class WordReferencePackInstaller {
  private readonly controllers = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();
  private readonly readyByPackId = new Map<string, Promise<ReadyWordReferencePack>>();

  constructor(
    private readonly fileStore: WordReferencePackFileStore,
    private readonly downloadIndex: DownloadIndexRepository
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  async listInstalledAsync(): Promise<ReadyWordReferencePack[]> {
    const registry = await this.fileStore.readRegistryAsync();
    const installed: ReadyWordReferencePack[] = [];
    for (const packId of Object.keys(registry.packs).sort()) {
      try {
        installed.push(await this.resolveAsync(packId));
      } catch {
        // A corrupt slot remains represented in Downloads and can be deleted or replaced.
      }
    }
    return installed;
  }

  async resolveAsync(packId: string): Promise<ReadyWordReferencePack> {
    const cached = this.readyByPackId.get(packId);
    if (cached) return cached;
    const resolving = this.resolveUncachedAsync(packId).catch((error) => {
      this.readyByPackId.delete(packId);
      throw error;
    });
    this.readyByPackId.set(packId, resolving);
    return resolving;
  }

  private async resolveUncachedAsync(packId: string): Promise<ReadyWordReferencePack> {
    const registry = await this.fileStore.readRegistryAsync();
    const slot = registry.packs[packId];
    if (!slot) throw new Error(`Dictionary pack ${packId} is not installed`);
    try {
      return { ...(await this.validateRefAsync(slot.active, false)), recovery: 'none' };
    } catch (activeError) {
      if (!slot.previous) throw activeError;
      const previous = await this.validateRefAsync(slot.previous, false);
      await this.fileStore.writeRegistryAsync(rollbackWordReferencePack(registry, packId));
      return { ...previous, recovery: 'rollback' };
    }
  }

  async installAsync(entry: WordReferencePackCatalogEntry): Promise<ReadyWordReferencePack> {
    const key = `${entry.packId}:${entry.version}`;
    if (this.controllers.has(key)) throw new Error('This dictionary pack is already downloading');
    const controller = new AbortController();
    this.controllers.set(key, controller);
    const downloadContent = content(entry);
    await this.downloadIndex.upsert(downloadContent, { status: 'queued', progress: { kind: 'percent', percent: 0 }, error: null });
    const staging = await this.fileStore.prepareStagingDirectoryAsync(entry.packId, entry.version);
    try {
      const freeBytes = await FileSystem.getFreeDiskStorageAsync();
      if (freeBytes < entry.databaseSizeBytes + 5 * 1024 * 1024) {
        throw new Error(`Not enough storage for this dictionary (${Math.ceil(entry.databaseSizeBytes / 1024 / 1024)} MB required)`);
      }
      await this.downloadIndex.upsert(downloadContent, { status: 'downloading' });
      const manifestResponse = await fetch(entry.manifestUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!manifestResponse.ok) throw new Error(`Dictionary manifest download failed (${manifestResponse.status})`);
      const manifest = assertCompatibleWordReferenceManifest((await manifestResponse.json()) as WordReferencePackManifest);
      if (
        manifest.source.packId !== entry.packId ||
        manifest.source.version !== entry.version ||
        manifest.databaseSizeBytes !== entry.databaseSizeBytes ||
        manifest.databaseChecksumSha256.toLowerCase() !== entry.databaseChecksumSha256.toLowerCase()
      ) {
        throw new Error('Dictionary catalog and manifest do not match');
      }
      await this.fileStore.writeManifestAsync(staging, manifest);
      const databaseUri = `${staging}${manifest.databaseFile}`;
      const download = FileSystem.createDownloadResumable(entry.databaseUrl, databaseUri, {}, (progress) => {
        const expected = progress.totalBytesExpectedToWrite;
        const percent = expected > 0 ? Math.max(0, Math.min(99, Math.round((progress.totalBytesWritten / expected) * 100))) : 0;
        void this.downloadIndex.upsert(downloadContent, { status: 'downloading', progress: { kind: 'percent', percent } });
      });
      const cancel = (): void => { void download.cancelAsync().catch(() => undefined); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        const result = await download.downloadAsync();
        if (!result?.uri) throw new Error('Dictionary download was canceled');
      } finally {
        controller.signal.removeEventListener('abort', cancel);
      }
      if (controller.signal.aborted) throw new Error('Dictionary download was canceled');
      const validated = await this.validateDirectoryAsync(entry.packId, entry.version, staging, manifest, true);
      const destination = await this.fileStore.promoteStagingDirectoryAsync(staging, entry.packId, entry.version);
      const registry = await this.fileStore.readRegistryAsync();
      const ref: WordReferenceInstalledPackRef = { packId: entry.packId, version: entry.version, manifest };
      const next = activateWordReferencePack(registry, ref);
      await this.fileStore.writeRegistryAsync(next);
      const ready: ReadyWordReferencePack = {
        ...validated,
        databaseDirectoryUri: destination,
        databaseUri: `${destination}${manifest.databaseFile}`,
        recovery: 'none',
      };
      this.readyByPackId.set(entry.packId, Promise.resolve(ready));
      await this.downloadIndex.upsert(downloadContent, { status: 'installed', progress: { kind: 'percent', percent: 100 }, error: null });
      this.emitChange();
      return ready;
    } catch (error) {
      if (controller.signal.aborted) {
        await this.downloadIndex.remove(downloadContent);
      } else {
        await this.downloadIndex.upsert(downloadContent, {
          status: 'failed',
          progress: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    } finally {
      this.controllers.delete(key);
      await this.fileStore.deleteStagingAsync(staging);
    }
  }

  cancel(packId: string, version: string): void {
    this.controllers.get(`${packId}:${version}`)?.abort();
  }

  async deleteAsync(packId: string, version: string): Promise<void> {
    this.cancel(packId, version);
    this.readyByPackId.delete(packId);
    const registry = await this.fileStore.readRegistryAsync();
    const slot = registry.packs[packId];
    const refs = [slot?.active, slot?.previous].filter((ref): ref is WordReferenceInstalledPackRef => Boolean(ref));
    const matching = refs.find((ref) => ref.version === version);
    if (matching) {
      await this.fileStore.writeRegistryAsync(
        removeWordReferencePackVersion(registry, packId, version)
      );
      await this.fileStore.deleteVersionAsync(packId, version);
      await this.downloadIndex.remove({
        kind: 'word-reference-pack',
        packId,
        version,
        sourceId: matching.manifest.source.sourceId,
        languageCode: matching.manifest.source.languageCode,
      });
      this.emitChange();
    }
  }

  private async validateRefAsync(ref: WordReferenceInstalledPackRef, verifyChecksum: boolean) {
    await this.fileStore.recoverPromotionAsync(ref.packId, ref.version);
    const directory = this.fileStore.getVersionDirectoryUri(ref.packId, ref.version);
    const manifest = assertCompatibleWordReferenceManifest(await this.fileStore.readManifestAsync(directory));
    return this.validateDirectoryAsync(ref.packId, ref.version, directory, manifest, verifyChecksum);
  }

  private async validateDirectoryAsync(
    packId: string,
    version: string,
    directory: string,
    manifest: WordReferencePackManifest,
    verifyChecksum: boolean
  ): Promise<Omit<ReadyWordReferencePack, 'recovery'>> {
    const databaseUri = `${directory}${manifest.databaseFile}`;
    const info = await FileSystem.getInfoAsync(databaseUri);
    if (!info.exists || info.isDirectory || info.size !== manifest.databaseSizeBytes) {
      throw new Error('Dictionary database size does not match its manifest');
    }
    if (verifyChecksum && (await sha256FileAsync(databaseUri)).toLowerCase() !== manifest.databaseChecksumSha256.toLowerCase()) {
      throw new Error('Dictionary database checksum does not match its manifest');
    }
    const db = await openDatabaseAsync(manifest.databaseFile, { useNewConnection: true }, directory);
    try {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA foreign_keys=ON;');
      const [applicationId, schemaVersion, integrity, logicalChecksum] = await Promise.all([
        db.getFirstAsync<PragmaRow>('SELECT application_id AS value FROM pragma_application_id;'),
        db.getFirstAsync<PragmaRow>('SELECT user_version AS value FROM pragma_user_version;'),
        db.getFirstAsync<CheckRow>('SELECT quick_check AS result FROM pragma_quick_check;'),
        db.getFirstAsync<MetadataRow>("SELECT value FROM compiler_metadata WHERE key='logical_checksum_sha256' LIMIT 1;"),
      ]);
      if (applicationId?.value !== WORD_REFERENCE_PACK_APPLICATION_ID || schemaVersion?.value !== WORD_REFERENCE_PACK_SCHEMA_VERSION) {
        throw new Error('Dictionary database schema is incompatible');
      }
      if (integrity?.result !== 'ok' || logicalChecksum?.value !== manifest.logicalChecksumSha256) {
        throw new Error('Dictionary database integrity validation failed');
      }
    } finally {
      await db.closeAsync();
    }
    return { packId, version, manifest, databaseDirectoryUri: directory, databaseUri };
  }
}
