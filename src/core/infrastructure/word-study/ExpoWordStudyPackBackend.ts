import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync } from 'expo-sqlite';

import type {
  ValidatedInstalledWordStudyPack,
  WordStudyPackLifecycleBackend,
} from './WordStudyPackLifecycle';
import { WordStudyPackFileStore } from './WordStudyPackFileStore';
import {
  WORD_STUDY_PACK_APPLICATION_ID,
  WORD_STUDY_PACK_SCHEMA_VERSION,
  assertCompatibleWordStudyManifest,
  type WordStudyInstalledPackRef,
  type WordStudyPackActivationState,
  type WordStudyPackCatalogEntry,
  type WordStudyPackManifest,
} from './WordStudyPack.types';

type PragmaRow = { value: number };
type IntegrityRow = { result: string };
type MetadataRow = { value: string };

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256FileAsync(uri: string): Promise<string> {
  const bytes = await new File(uri).bytes();
  return bytesToHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
}

function assertCatalogMatchesManifest(
  entry: WordStudyPackCatalogEntry,
  manifest: WordStudyPackManifest
): void {
  if (entry.schemaVersion !== manifest.schemaVersion) {
    throw new Error('Word-study catalog and manifest schema versions do not match');
  }
  if (entry.databaseSizeBytes !== manifest.databaseSizeBytes) {
    throw new Error('Word-study catalog and manifest database sizes do not match');
  }
  if (
    entry.databaseChecksumSha256.toLowerCase() !==
    manifest.databaseChecksumSha256.toLowerCase()
  ) {
    throw new Error('Word-study catalog and manifest checksums do not match');
  }
}

export class ExpoWordStudyPackBackend implements WordStudyPackLifecycleBackend {
  constructor(private readonly fileStore = new WordStudyPackFileStore()) {}

  readActivationStateAsync(): Promise<WordStudyPackActivationState | null> {
    return this.fileStore.readActivationStateAsync();
  }

  writeActivationStateAsync(state: WordStudyPackActivationState): Promise<void> {
    return this.fileStore.writeActivationStateAsync(state);
  }

  clearActivationStateAsync(): Promise<void> {
    return this.fileStore.clearActivationStateAsync();
  }

  deleteInstalledPackAsync(ref: WordStudyInstalledPackRef): Promise<void> {
    return this.fileStore.deleteVersionAsync(ref.packId, ref.version);
  }

  async validateInstalledPackAsync(
    ref: WordStudyInstalledPackRef
  ): Promise<ValidatedInstalledWordStudyPack> {
    await this.fileStore.recoverInterruptedPromotionAsync(ref.packId, ref.version);
    const directoryUri = this.fileStore.getVersionDirectoryUri(ref.packId, ref.version);
    const installedManifest = assertCompatibleWordStudyManifest(
      await this.fileStore.readManifestAsync(directoryUri)
    );
    if (
      installedManifest.databaseChecksumSha256.toLowerCase() !==
      ref.manifest.databaseChecksumSha256.toLowerCase()
    ) {
      throw new Error('Installed word-study manifest does not match its activation record');
    }
    return this.validateDirectoryAsync(
      ref.packId,
      ref.version,
      directoryUri,
      installedManifest,
      false
    );
  }

  async installHostedPackAsync(
    entry: WordStudyPackCatalogEntry,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<ValidatedInstalledWordStudyPack> {
    if (signal?.aborted) throw new Error('Word-study pack update was cancelled');
    const staging = await this.fileStore.prepareStagingDirectoryAsync(entry.packId, entry.version);
    try {
      const manifestResponse = await fetch(entry.manifestUrl, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!manifestResponse.ok) {
        throw new Error(`Word-study manifest download failed (${manifestResponse.status})`);
      }
      const manifest = assertCompatibleWordStudyManifest(
        (await manifestResponse.json()) as WordStudyPackManifest
      );
      assertCatalogMatchesManifest(entry, manifest);
      await this.fileStore.writeManifestAsync(staging, manifest);
      if (signal?.aborted) throw new Error('Word-study pack update was cancelled');
      const download = FileSystem.createDownloadResumable(
        entry.databaseUrl,
        `${staging}${manifest.databaseFile}`,
        {},
        (progress) => {
          const expected = progress.totalBytesExpectedToWrite;
          if (expected > 0) {
            onProgress?.(
              Math.max(0, Math.min(99, Math.round((progress.totalBytesWritten / expected) * 100)))
            );
          }
        }
      );
      const cancel = (): void => {
        void download.cancelAsync().catch(() => undefined);
      };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const result = await download.downloadAsync();
        if (!result?.uri) throw new Error('Word Study Essentials download was canceled');
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
      if (signal?.aborted) throw new Error('Word-study pack update was cancelled');
      await this.validateDirectoryAsync(entry.packId, entry.version, staging, manifest, true);
      const destination = await this.fileStore.promoteStagingDirectoryAsync(
        staging,
        entry.packId,
        entry.version
      );
      return this.validateDirectoryAsync(entry.packId, entry.version, destination, manifest, false);
    } finally {
      await this.fileStore.deleteStagingDirectoryAsync(staging);
    }
  }

  private async validateDirectoryAsync(
    packId: string,
    version: string,
    directoryUri: string,
    manifest: WordStudyPackManifest,
    verifyChecksum: boolean
  ): Promise<ValidatedInstalledWordStudyPack> {
    assertCompatibleWordStudyManifest(manifest);
    const databaseUri = `${directoryUri}${manifest.databaseFile}`;
    const info = await FileSystem.getInfoAsync(databaseUri);
    if (!info.exists || info.isDirectory) throw new Error('Word-study database is missing');
    if (info.size !== manifest.databaseSizeBytes) {
      throw new Error('Word-study database size does not match its manifest');
    }
    if (verifyChecksum) {
      const checksum = await sha256FileAsync(databaseUri);
      if (checksum.toLowerCase() !== manifest.databaseChecksumSha256.toLowerCase()) {
        throw new Error('Word-study database checksum does not match its manifest');
      }
    }

    const db = await openDatabaseAsync(
      manifest.databaseFile,
      { useNewConnection: true },
      directoryUri
    );
    try {
      await db.execAsync('PRAGMA query_only=ON;');
      const [applicationId, schemaVersion, integrity, logicalChecksum] = await Promise.all([
        db.getFirstAsync<PragmaRow>('SELECT application_id AS value FROM pragma_application_id;'),
        db.getFirstAsync<PragmaRow>('SELECT user_version AS value FROM pragma_user_version;'),
        db.getFirstAsync<IntegrityRow>('SELECT quick_check AS result FROM pragma_quick_check;'),
        db.getFirstAsync<MetadataRow>(
          "SELECT value FROM compiler_metadata WHERE key = 'logical_checksum_sha256' LIMIT 1;"
        ),
      ]);
      if (applicationId?.value !== WORD_STUDY_PACK_APPLICATION_ID) {
        throw new Error('Word-study database application ID is incompatible');
      }
      if (
        schemaVersion?.value !== WORD_STUDY_PACK_SCHEMA_VERSION ||
        schemaVersion.value !== manifest.schemaVersion
      ) {
        throw new Error('Word-study database schema is incompatible');
      }
      if (integrity?.result !== 'ok') throw new Error('Word-study database integrity check failed');
      if (logicalChecksum?.value !== manifest.logicalChecksumSha256) {
        throw new Error('Word-study logical checksum does not match its manifest');
      }
    } finally {
      await db.closeAsync();
    }

    return {
      packId,
      version,
      manifest,
      databaseDirectoryUri: directoryUri,
      databaseUri,
    };
  }
}
