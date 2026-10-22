import type { DownloadIndexItemWithKey } from '@/src/domain/entities';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';

export class ListDownloadIndexItemsUseCase {
  constructor(private readonly downloadIndexRepository: IDownloadIndexRepository) {}

  async execute(): Promise<DownloadIndexItemWithKey[]> {
    return this.downloadIndexRepository.list();
  }
}

