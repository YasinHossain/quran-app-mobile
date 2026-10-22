import { HostedPackFileStore } from '@/src/core/infrastructure/hosted-pack/HostedPackFileStore';

export class WordTranslationPackFileStore {
  private readonly store = new HostedPackFileStore();

  async prepareTemporaryPackDirectoryAsync(languageCode: string, version: string): Promise<string> {
    const resourceId = languageCode
      .trim()
      .toLowerCase()
      .split('')
      .reduce((total, char) => total + char.charCodeAt(0), 0);

    return this.store.prepareTemporaryPackDirectoryAsync(
      'word-translation-packs',
      resourceId,
      version
    );
  }

  async deleteTemporaryPackDirectoryAsync(directoryUri: string): Promise<void> {
    await this.store.deleteTemporaryPackDirectoryAsync(directoryUri);
  }
}
