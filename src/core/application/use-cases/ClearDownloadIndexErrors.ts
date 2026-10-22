import type { DownloadableContent } from '@/src/domain/entities';
import type { IDownloadIndexRepository } from '@/src/domain/repositories/IDownloadIndexRepository';

export class ClearDownloadIndexErrorsUseCase {
  constructor(private readonly downloadIndexRepository: IDownloadIndexRepository) {}

  async execute(content?: DownloadableContent): Promise<void> {
    return this.downloadIndexRepository.clearErrors(content);
  }
}

