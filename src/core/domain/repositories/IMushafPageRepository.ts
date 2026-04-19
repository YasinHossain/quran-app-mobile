import type { MushafPackId, MushafPageData } from '@/types';

export type GetMushafPageParams = {
  packId: MushafPackId;
  pageNumber: number;
};

export interface IMushafPageRepository {
  getPage(params: GetMushafPageParams): Promise<MushafPageData>;
}
