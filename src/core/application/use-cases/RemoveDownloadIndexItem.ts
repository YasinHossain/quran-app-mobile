import type { DownloadableContent } from '@/src/domain/entities';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';

export class RemoveDownloadIndexItemUseCase {
  constructor(private readonly downloadIndexRepository: IDownloadIndexRepository) {}

  async execute(content: DownloadableContent): Promise<void> {
    return this.downloadIndexRepository.remove(content);
  }
}

