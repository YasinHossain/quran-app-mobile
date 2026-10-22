import type { MushafPackId } from '@/types';

import type { MushafPackInstall, MushafPackInstallInput } from '@/src/domain/entities';

export interface IMushafPackInstallRegistry {
  list(): Promise<MushafPackInstall[]>;
  get(packId: MushafPackId, version: string): Promise<MushafPackInstall | null>;
  getActive(packId: MushafPackId): Promise<MushafPackInstall | null>;
  upsert(input: MushafPackInstallInput): Promise<MushafPackInstall>;
  setActive(packId: MushafPackId, version: string): Promise<MushafPackInstall>;
  remove(packId: MushafPackId, version: string): Promise<void>;
}
