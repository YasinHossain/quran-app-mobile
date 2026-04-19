import type { MushafPackChannel, MushafPackId } from '@/types';

export interface MushafPackInstall {
  packId: MushafPackId;
  version: string;
  channel: MushafPackChannel;
  isActive: boolean;
  installedAt: number;
  updatedAt: number;
}

export type MushafPackInstallInput = {
  packId: MushafPackId;
  version: string;
  channel: MushafPackChannel;
  isActive?: boolean;
};
