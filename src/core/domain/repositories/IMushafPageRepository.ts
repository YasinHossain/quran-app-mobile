import type { MushafPackId, MushafPageData } from '@/types';

export type GetMushafPageParams = {
  packId: MushafPackId;
  pageNumber: number;
};

export type FindMushafVersePageParams = {
  packId: MushafPackId;
  verseKey: string;
};

export interface IMushafPageRepository {
  getPage(params: GetMushafPageParams): Promise<MushafPageData>;
  findPageForVerse(params: FindMushafVersePageParams): Promise<number | null>;
}
