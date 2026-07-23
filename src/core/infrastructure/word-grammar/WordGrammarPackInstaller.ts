import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync } from 'expo-sqlite';

import type { DownloadableContent } from '@/src/core/domain/entities/DownloadIndexItem';
import type { DownloadIndexRepository } from '@/src/core/infrastructure/repositories/DownloadIndexRepository';

import { WordGrammarPackFileStore } from './WordGrammarPackFileStore';
import {
  WORD_GRAMMAR_PACK_APPLICATION_ID,
  WORD_GRAMMAR_PACK_SCHEMA_VERSION,
  assertCompatibleWordGrammarManifest,
  type ReadyWordGrammarPack,
  type WordGrammarInstalledPackRef,
  type WordGrammarPackCatalogEntry,
  type WordGrammarPackManifest,
} from './WordGrammarPack.types';

type PragmaRow = { value: number };
type CheckRow = { result: string };
type MetadataRow = { value: string };

function content(entry: WordGrammarPackCatalogEntry): DownloadableContent {
  return {
    kind: 'word-grammar-pack',
    packId: entry.packId,
    version: entry.version,
    sourceId: entry.sourceId,
  };
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256FileAsync(uri: string): Promise<string> {
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await new File(uri).bytes()));
}

export class WordGrammarPackInstaller {
  private readonly controllers = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();
  private readyPromise: Promise<ReadyWordGrammarPack> | null = null;

  constructor(
    private readonly fileStore: WordGrammarPackFileStore,
    private readonly downloadIndex: DownloadIndexRepository
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  async getInstalledAsync(): Promise<ReadyWordGrammarPack | null> {
    const registry = await this.fileStore.readRegistryAsync();
    if (!registry.active) return null;
    return this.resolveAsync();
  }

  async resolveAsync(): Promise<ReadyWordGrammarPack> {
    if (!this.readyPromise) {
      this.readyPromise = this.resolveUncachedAsync().catch((error) => {
        this.readyPromise = null;
        throw error;
      });
    }
    return this.readyPromise;
  }

  private async resolveUncachedAsync(): Promise<ReadyWordGrammarPack> {
    const registry = await this.fileStore.readRegistryAsync();
    if (!registry.active) throw new Error('Arabic grammar pack is not installed');
    return this.validateRefAsync(registry.active, false);
  }

  async installAsync(entry: WordGrammarPackCatalogEntry): Promise<ReadyWordGrammarPack> {
    const key = `${entry.packId}:${entry.version}`;
    if (this.controllers.has(key)) throw new Error('This grammar pack is already downloading');
    const controller = new AbortController();
    this.controllers.set(key, controller);
    const downloadContent = content(entry);
    await this.downloadIndex.upsert(downloadContent, {
      status: 'queued',
      progress: { kind: 'percent', percent: 0 },
      error: null,
    });
    const staging = await this.fileStore.prepareStagingDirectoryAsync(entry.packId, entry.version);
    try {
      const freeBytes = await FileSystem.getFreeDiskStorageAsync();
      if (freeBytes < entry.databaseSizeBytes + 5 * 1024 * 1024) {
        throw new Error(`Not enough storage for Arabic grammar (${Math.ceil(entry.databaseSizeBytes / 1024 / 1024)} MB required)`);
      }
      await this.downloadIndex.upsert(downloadContent, { status: 'downloading' });
      const manifestResponse = await fetch(entry.manifestUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!manifestResponse.ok) {
        throw new Error(`Grammar manifest download failed (${manifestResponse.status})`);
      }
      const manifest = assertCompatibleWordGrammarManifest(
        (await manifestResponse.json()) as WordGrammarPackManifest
      );
      if (
        manifest.source.sourceId !== entry.sourceId ||
        manifest.source.version !== entry.version ||
        manifest.databaseSizeBytes !== entry.databaseSizeBytes ||
        manifest.databaseChecksumSha256.toLowerCase() !== entry.databaseChecksumSha256.toLowerCase()
      ) {
        throw new Error('Grammar catalog and manifest do not match');
      }
      await this.fileStore.writeManifestAsync(staging, manifest);
      const databaseUri = `${staging}${manifest.databaseFile}`;
      const download = FileSystem.createDownloadResumable(
        entry.databaseUrl,
        databaseUri,
        {},
        (progress) => {
          const expected = progress.totalBytesExpectedToWrite;
          const percent = expected > 0
            ? Math.max(0, Math.min(99, Math.round((progress.totalBytesWritten / expected) * 100)))
            : 0;
          void this.downloadIndex.upsert(downloadContent, {
            status: 'downloading',
            progress: { kind: 'percent', percent },
          });
        }
      );
      const cancel = (): void => {
        void download.cancelAsync().catch(() => undefined);
      };
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        const result = await download.downloadAsync();
        if (!result?.uri) throw new Error('Grammar download was canceled');
      } finally {
        controller.signal.removeEventListener('abort', cancel);
      }
      if (controller.signal.aborted) throw new Error('Grammar download was canceled');
      await this.validateDirectoryAsync(entry.packId, entry.version, staging, manifest, true);
      const destination = await this.fileStore.promoteStagingDirectoryAsync(
        staging,
        entry.packId,
        entry.version
      );
      const ref: WordGrammarInstalledPackRef = {
        packId: entry.packId,
        version: entry.version,
        manifest,
      };
      await this.fileStore.writeRegistryAsync({
        format: 'quran-word-grammar-registry-v1',
        active: ref,
      });
      const ready: ReadyWordGrammarPack = {
        ...ref,
        databaseDirectoryUri: destination,
        databaseUri: `${destination}${manifest.databaseFile}`,
      };
      this.readyPromise = Promise.resolve(ready);
      await this.downloadIndex.upsert(downloadContent, {
        status: 'installed',
        progress: { kind: 'percent', percent: 100 },
        error: null,
      });
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

  async deleteAsync(packId: string, version: string, sourceId: string): Promise<void> {
    this.cancel(packId, version);
    this.readyPromise = null;
    const downloadContent: DownloadableContent = {
      kind: 'word-grammar-pack',
      packId,
      version,
      sourceId,
    };
    await this.downloadIndex.upsert(downloadContent, { status: 'deleting' });
    const registry = await this.fileStore.readRegistryAsync();
    if (registry.active?.packId === packId && registry.active.version === version) {
      await this.fileStore.writeRegistryAsync({ format: 'quran-word-grammar-registry-v1' });
    }
    await this.fileStore.deleteVersionAsync(packId, version);
    await this.downloadIndex.remove(downloadContent);
    this.emitChange();
  }

  private async validateRefAsync(
    ref: WordGrammarInstalledPackRef,
    verifyChecksum: boolean
  ): Promise<ReadyWordGrammarPack> {
    const directory = this.fileStore.getVersionDirectoryUri(ref.packId, ref.version);
    const manifest = assertCompatibleWordGrammarManifest(
      await this.fileStore.readManifestAsync(directory)
    );
    if (manifest.databaseChecksumSha256 !== ref.manifest.databaseChecksumSha256) {
      throw new Error('Installed grammar manifest does not match its registry');
    }
    return this.validateDirectoryAsync(ref.packId, ref.version, directory, manifest, verifyChecksum);
  }

  private async validateDirectoryAsync(
    packId: string,
    version: string,
    directory: string,
    manifest: WordGrammarPackManifest,
    verifyChecksum: boolean
  ): Promise<ReadyWordGrammarPack> {
    const databaseUri = `${directory}${manifest.databaseFile}`;
    const info = await FileSystem.getInfoAsync(databaseUri);
    if (!info.exists || info.isDirectory || info.size !== manifest.databaseSizeBytes) {
      throw new Error('Grammar database size does not match its manifest');
    }
    if (
      verifyChecksum &&
      (await sha256FileAsync(databaseUri)).toLowerCase() !==
        manifest.databaseChecksumSha256.toLowerCase()
    ) {
      throw new Error('Grammar database checksum does not match its manifest');
    }
    const db = await openDatabaseAsync(manifest.databaseFile, { useNewConnection: true }, directory);
    try {
      await db.execAsync('PRAGMA query_only=ON;');
      const [applicationId, schemaVersion, integrity, logicalChecksum] = await Promise.all([
        db.getFirstAsync<PragmaRow>('SELECT application_id AS value FROM pragma_application_id'),
        db.getFirstAsync<PragmaRow>('SELECT user_version AS value FROM pragma_user_version'),
        db.getFirstAsync<CheckRow>('SELECT quick_check AS result FROM pragma_quick_check'),
        db.getFirstAsync<MetadataRow>(
          "SELECT value FROM compiler_metadata WHERE key='logical_checksum_sha256' LIMIT 1"
        ),
      ]);
      if (
        applicationId?.value !== WORD_GRAMMAR_PACK_APPLICATION_ID ||
        schemaVersion?.value !== WORD_GRAMMAR_PACK_SCHEMA_VERSION ||
        integrity?.result !== 'ok' ||
        logicalChecksum?.value !== manifest.logicalChecksumSha256
      ) {
        throw new Error('Grammar database integrity validation failed');
      }
    } finally {
      await db.closeAsync();
    }
    return {
      packId,
      version,
      manifest,
      databaseDirectoryUri: directory,
      databaseUri,
    };
  }
}
