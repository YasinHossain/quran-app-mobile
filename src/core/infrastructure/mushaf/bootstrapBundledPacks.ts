import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import type { DownloadableContent } from '@/src/core/domain/entities/DownloadIndexItem';

import { listBundledMushafPacks } from './bundledPacks';

async function ensureBundledPackDownloadIndexAsync(content: DownloadableContent): Promise<void> {
  const downloadIndexRepository = container.getDownloadIndexRepository();
  const existing = await downloadIndexRepository.get(content);

  if (existing?.status === 'installed' && existing.error === undefined) {
    return;
  }

  await downloadIndexRepository.upsert(content, {
    status: 'installed',
    progress: null,
    error: null,
  });
}

export async function bootstrapBundledMushafPacksAsync(): Promise<void> {
  const installRegistry = container.getMushafPackInstallRegistry();

  for (const pack of listBundledMushafPacks()) {
    try {
      const existing = await installRegistry.get(pack.manifest.packId, pack.manifest.version);
      const active = await installRegistry.getActive(pack.manifest.packId);

      if (!existing || existing.channel !== pack.manifest.channel) {
        await installRegistry.upsert({
          packId: pack.manifest.packId,
          version: pack.manifest.version,
          channel: pack.manifest.channel,
          isActive: true,
        });
      } else if (!existing.isActive || active?.version !== pack.manifest.version) {
        await installRegistry.setActive(pack.manifest.packId, pack.manifest.version);
      }

      await ensureBundledPackDownloadIndexAsync({
        kind: 'mushaf-pack',
        packId: pack.manifest.packId,
        version: pack.manifest.version,
      });
    } catch (error) {
      logger.error(
        'Failed to bootstrap bundled mushaf pack',
        {
          packId: pack.manifest.packId,
          version: pack.manifest.version,
        },
        error as Error
      );
    }
  }
}
