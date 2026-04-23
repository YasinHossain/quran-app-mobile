import { HostedPackFileStore } from '@/src/core/infrastructure/hosted-pack/HostedPackFileStore';

export class TafsirPackFileStore {
  private readonly store = new HostedPackFileStore();

  async prepareTemporaryPackDirectoryAsync(
    tafsirId: number,
    version: string
  ): Promise<string> {
    return this.store.prepareTemporaryPackDirectoryAsync('tafsir-packs', tafsirId, version);
  }

  async deleteTemporaryPackDirectoryAsync(directoryUri: string): Promise<void> {
    await this.store.deleteTemporaryPackDirectoryAsync(directoryUri);
  }
}
