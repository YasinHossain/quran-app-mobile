import { HostedPackFileStore } from '@/src/core/infrastructure/hosted-pack/HostedPackFileStore';

export class TranslationPackFileStore {
  private readonly store = new HostedPackFileStore();

  async prepareTemporaryPackDirectoryAsync(
    translationId: number,
    version: string
  ): Promise<string> {
    return this.store.prepareTemporaryPackDirectoryAsync('translation-packs', translationId, version);
  }

  async deleteTemporaryPackDirectoryAsync(directoryUri: string): Promise<void> {
    await this.store.deleteTemporaryPackDirectoryAsync(directoryUri);
  }
}
