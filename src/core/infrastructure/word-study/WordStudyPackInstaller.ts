import * as FileSystem from 'expo-file-system/legacy';

import type { DownloadableContent } from '@/src/core/domain/entities/DownloadIndexItem';
import type { DownloadIndexRepository } from '@/src/core/infrastructure/repositories/DownloadIndexRepository';

import type { ExpoWordStudyDatabaseProvider } from './ExpoWordStudyDatabaseProvider';
import type { ReadyWordStudyPack, WordStudyPackCatalogEntry } from './WordStudyPack.types';
import type { WordStudyPackLifecycle } from './WordStudyPackLifecycle';

function content(entry: WordStudyPackCatalogEntry): DownloadableContent {
  return { kind: 'word-study-pack', packId: entry.packId, version: entry.version };
}

export class WordStudyPackInstaller {
  private readonly controllers = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly lifecycle: WordStudyPackLifecycle,
    private readonly databaseProvider: ExpoWordStudyDatabaseProvider,
    private readonly downloadIndex: DownloadIndexRepository
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  getInstalledAsync(): Promise<ReadyWordStudyPack | null> {
    return this.lifecycle.getInstalledAsync();
  }

  async installAsync(entry: WordStudyPackCatalogEntry): Promise<ReadyWordStudyPack> {
    const key = `${entry.packId}:${entry.version}`;
    if (this.controllers.has(key)) throw new Error('Word Study Essentials is already downloading');
    const controller = new AbortController();
    this.controllers.set(key, controller);
    const downloadContent = content(entry);
    await this.downloadIndex.upsert(downloadContent, {
      status: 'queued',
      progress: { kind: 'percent', percent: 0 },
      error: null,
    });

    try {
      const freeBytes = await FileSystem.getFreeDiskStorageAsync();
      if (freeBytes < entry.databaseSizeBytes + 5 * 1024 * 1024) {
        throw new Error(
          `Not enough storage for Word Study Essentials (${Math.ceil(entry.databaseSizeBytes / 1024 / 1024)} MB required)`
        );
      }
      await this.downloadIndex.upsert(downloadContent, { status: 'downloading' });
      const installed = await this.databaseProvider.installUpdateAsync(
        entry,
        controller.signal,
        (percent) => {
          void this.downloadIndex.upsert(downloadContent, {
            status: 'downloading',
            progress: { kind: 'percent', percent },
          });
        }
      );
      await this.downloadIndex.upsert(downloadContent, {
        status: 'installed',
        progress: { kind: 'percent', percent: 100 },
        error: null,
      });
      this.emitChange();
      return installed;
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
    }
  }

  cancel(packId: string, version: string): void {
    this.controllers.get(`${packId}:${version}`)?.abort();
  }

  async deleteAsync(packId: string, version: string): Promise<void> {
    this.cancel(packId, version);
    const downloadContent: DownloadableContent = {
      kind: 'word-study-pack',
      packId,
      version,
    };
    await this.downloadIndex.upsert(downloadContent, { status: 'deleting' });
    try {
      await this.databaseProvider.closeAsync();
      await this.lifecycle.uninstallAsync();
      await this.downloadIndex.remove(downloadContent);
      this.emitChange();
    } catch (error) {
      await this.downloadIndex.upsert(downloadContent, {
        status: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
