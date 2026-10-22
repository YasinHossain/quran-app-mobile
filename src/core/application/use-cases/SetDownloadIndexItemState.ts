import type {
  DownloadIndexItemPatch,
  DownloadIndexItemWithKey,
  DownloadableContent,
} from '@/src/domain/entities';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';

export class SetDownloadIndexItemStateUseCase {
  constructor(private readonly downloadIndexRepository: IDownloadIndexRepository) {}

  async execute(
    content: DownloadableContent,
    patch: DownloadIndexItemPatch
  ): Promise<DownloadIndexItemWithKey> {
    return this.downloadIndexRepository.upsert(content, patch);
  }
}

