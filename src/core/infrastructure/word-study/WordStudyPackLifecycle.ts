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
  installBundledPackAsync(): Promise<ValidatedInstalledWordStudyPack>;
  installHostedPackAsync(
    entry: WordStudyPackCatalogEntry,
    signal?: AbortSignal
  ): Promise<ValidatedInstalledWordStudyPack>;
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
    signal?: AbortSignal
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
    const installed = await this.backend.installHostedPackAsync(entry, signal);
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
            // Both installed generations are unusable; reinstall the trusted bundled generation.
          }
        }
        const bundled = await this.backend.installBundledPackAsync();
        await this.backend.writeActivationStateAsync({
          format: 'quran-word-study-activation-v1',
          active: this.toRef(bundled),
        });
        return { ...bundled, recovery: 'bundled-reinstall' };
      }
    }

    const bundled = await this.backend.installBundledPackAsync();
    await this.backend.writeActivationStateAsync({
      format: 'quran-word-study-activation-v1',
      active: this.toRef(bundled),
    });
    return { ...bundled, recovery: 'bundled-install' };
  }

  private toRef(pack: ValidatedInstalledWordStudyPack): WordStudyInstalledPackRef {
    return { packId: pack.packId, version: pack.version, manifest: pack.manifest };
  }
}
