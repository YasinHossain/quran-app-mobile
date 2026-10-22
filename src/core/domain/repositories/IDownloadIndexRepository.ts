import type {
  DownloadIndexItemPatch,
  DownloadIndexItemWithKey,
  DownloadableContent,
} from '@/src/domain/entities';

export interface IDownloadIndexRepository {
  list(): Promise<DownloadIndexItemWithKey[]>;
  get(content: DownloadableContent): Promise<DownloadIndexItemWithKey | null>;
  upsert(
    content: DownloadableContent,
    patch: DownloadIndexItemPatch
  ): Promise<DownloadIndexItemWithKey>;
  remove(content: DownloadableContent): Promise<void>;
  clearErrors(content?: DownloadableContent): Promise<void>;
}

