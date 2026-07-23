import type {
  ReadyWordStudyPack,
  WordStudyInstalledPackRef,
  WordStudyPackActivationState,
  WordStudyPackCatalogEntry,
} from './WordStudyPack.types';

export type ValidatedInstalledWordStudyPack = Omit<ReadyWordStudyPack, 'recovery'>;

export interface WordStudyPackLifecycleBackend {
  readActivationStateAsync(): Promise<WordStudyPackActivationState | null>;
  writeActivationStateAsync(state: WordStudyPackActivationState): Promise<void>;
  validateInstalledPackAsync(
    ref: WordStudyInstalledPackRef
  ): Promise<ValidatedInstalledWordStudyPack>;
  installHostedPackAsync(
    entry: WordStudyPackCatalogEntry,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<ValidatedInstalledWordStudyPack>;
  clearActivationStateAsync(): Promise<void>;
  deleteInstalledPackAsync(ref: WordStudyInstalledPackRef): Promise<void>;
}

export class WordStudyPackNotInstalledError extends Error {
  constructor(message = 'Word Study Essentials is not downloaded') {
    super(message);
    this.name = 'WordStudyPackNotInstalledError';
  }
}

export class WordStudyPackLifecycle {
  private readyPromise: Promise<ReadyWordStudyPack> | null = null;

  constructor(private readonly backend: WordStudyPackLifecycleBackend) {}

  ensureReadyAsync(): Promise<ReadyWordStudyPack> {
    if (!this.readyPromise) {
      this.readyPromise = this.recoverOrInstallAsync().catch((error) => {
        this.readyPromise = null;
        throw error;
      });
    }
    return this.readyPromise;
  }

  async installUpdateAsync(
    entry: WordStudyPackCatalogEntry,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<ReadyWordStudyPack> {
    const currentBeforeInstall = await this.backend.readActivationStateAsync();
    if (
      currentBeforeInstall?.active.packId === entry.packId &&
      currentBeforeInstall.active.version === entry.version
    ) {
      if (
        currentBeforeInstall.active.manifest.databaseChecksumSha256.toLowerCase() !==
        entry.databaseChecksumSha256.toLowerCase()
      ) {
        throw new Error('Word-study pack versions are immutable; publish the update as a new version');
      }
      const installed = await this.backend.validateInstalledPackAsync(currentBeforeInstall.active);
      const ready = { ...installed, recovery: 'none' as const };
      this.readyPromise = Promise.resolve(ready);
      return ready;
    }
    const installed = await this.backend.installHostedPackAsync(entry, signal, onProgress);
    if (signal?.aborted) throw new Error('Word-study pack update was cancelled');
    const current = await this.backend.readActivationStateAsync();
    const nextState: WordStudyPackActivationState = {
      format: 'quran-word-study-activation-v1',
      active: this.toRef(installed),
      ...(current?.active ? { previous: current.active } : {}),
    };
    await this.backend.writeActivationStateAsync(nextState);
    const ready = { ...installed, recovery: 'none' as const };
    this.readyPromise = Promise.resolve(ready);
    return ready;
  }

  clearCachedReadyPack(): void {
    this.readyPromise = null;
  }

  async getInstalledAsync(): Promise<ReadyWordStudyPack | null> {
    const state = await this.backend.readActivationStateAsync();
    if (!state) return null;
    return this.ensureReadyAsync();
  }

  async uninstallAsync(): Promise<void> {
    this.readyPromise = null;
    const state = await this.backend.readActivationStateAsync();
    await this.backend.clearActivationStateAsync();
    if (!state) return;
    await this.backend.deleteInstalledPackAsync(state.active);
    if (state.previous) await this.backend.deleteInstalledPackAsync(state.previous);
  }

  private async recoverOrInstallAsync(): Promise<ReadyWordStudyPack> {
    const state = await this.backend.readActivationStateAsync();
    if (state) {
      try {
        return { ...(await this.backend.validateInstalledPackAsync(state.active)), recovery: 'none' };
      } catch (activeError) {
        if (state.previous) {
          try {
            const previous = await this.backend.validateInstalledPackAsync(state.previous);
            await this.backend.writeActivationStateAsync({
              format: 'quran-word-study-activation-v1',
              active: state.previous,
            });
            return { ...previous, recovery: 'rollback' };
          } catch {
            // Both downloaded generations are unusable.
          }
        }
        throw activeError;
      }
    }
    throw new WordStudyPackNotInstalledError();
  }

  private toRef(pack: ValidatedInstalledWordStudyPack): WordStudyInstalledPackRef {
    return { packId: pack.packId, version: pack.version, manifest: pack.manifest };
  }
}
