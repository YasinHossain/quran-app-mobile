import React from 'react';

import { findMushafOption, MUSHAF_OPTIONS } from '@/data/mushaf/options';
import type { MushafPackInstall } from '@/src/core/domain/entities';
import { getDownloadKey, type DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import {
  getDownloadableMushafPackDefinition,
  type DownloadableMushafPackDefinition,
} from '@/src/core/infrastructure/mushaf/downloadablePacks';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { useDownloadIndexItems } from './useDownloadIndexItems';

import type { MushafOption, MushafPackId } from '@/types';

export interface MushafPackManagerEntry {
  option: MushafOption;
  definition: DownloadableMushafPackDefinition | null;
  install: MushafPackInstall | null;
  downloadItem: DownloadIndexItemWithKey | undefined;
  isSelected: boolean;
  isInstalled: boolean;
  isBundled: boolean;
  isBusy: boolean;
  isInstallImplemented: boolean;
  isComingSoon: boolean;
  statusLabel: string;
  progressLabel: string | null;
  errorMessage: string | null;
}

function formatItemsProgress(downloadItem: DownloadIndexItemWithKey | undefined): string | null {
  const progress = downloadItem?.progress;
  if (!progress) return null;

  if (progress.kind === 'items') {
    return `${progress.completed} / ${progress.total} items`;
  }

  if (progress.kind === 'percent') {
    return `${Math.round(progress.percent)}%`;
  }

  return null;
}

function buildInstallKey(packId: MushafPackId, version: string): string {
  return `${packId}@${version}`;
}

function getStatusLabel(args: {
  option: MushafOption;
  isSelected: boolean;
  isInstalled: boolean;
  downloadItem: DownloadIndexItemWithKey | undefined;
  definition: DownloadableMushafPackDefinition | null;
}): string {
  const { option, isSelected, isInstalled, downloadItem, definition } = args;

  if (option.isBundledDefault) {
    return isSelected ? 'Bundled default' : 'Bundled';
  }

  switch (downloadItem?.status) {
    case 'queued':
      return 'Queued';
    case 'downloading':
      return 'Installing';
    case 'deleting':
      return 'Deleting';
    case 'failed':
      return 'Install failed';
    case 'installed':
      return isSelected ? 'Selected' : 'Installed';
    default:
      break;
  }

  if (isInstalled) {
    return isSelected ? 'Selected' : 'Installed';
  }

  if (!definition) {
    return 'Not installed';
  }

  return definition.support === 'installable' ? 'Download required' : 'Coming soon';
}

export function useMushafPackManager({
  selectedPackId,
}: {
  selectedPackId: MushafPackId;
}): {
  entries: MushafPackManagerEntry[];
  isLoading: boolean;
  errorMessage: string | null;
  installPack: (packId: MushafPackId) => Promise<void>;
  deletePack: (packId: MushafPackId) => Promise<void>;
  refresh: () => void;
} {
  const [installs, setInstalls] = React.useState<MushafPackInstall[]>([]);
  const [isRegistryLoading, setIsRegistryLoading] = React.useState(true);
  const [registryErrorMessage, setRegistryErrorMessage] = React.useState<string | null>(null);
  const [busyInstallKeys, setBusyInstallKeys] = React.useState<Set<string>>(() => new Set());
  const { items, itemsByKey, isLoading: isDownloadIndexLoading, refresh: refreshDownloadIndex } =
    useDownloadIndexItems({
      enabled: true,
      pollIntervalMs: 1000,
    });

  const loadInstalls = React.useCallback(async () => {
    setIsRegistryLoading(true);

    try {
      const nextInstalls = await container.getMushafPackInstallRegistry().list();
      setInstalls(nextInstalls);
      setRegistryErrorMessage(null);
    } catch (error) {
      logger.warn('Failed to load mushaf pack installs', undefined, error as Error);
      setRegistryErrorMessage(
        error instanceof Error ? error.message : 'Failed to load mushaf pack installs.'
      );
    } finally {
      setIsRegistryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadInstalls();
  }, [loadInstalls]);

  const mushafDownloadSignature = React.useMemo(() => {
    return items
      .filter((item) => item.content.kind === 'mushaf-pack')
      .map((item) => `${item.key}:${item.status}:${item.updatedAt}`)
      .join('|');
  }, [items]);

  React.useEffect(() => {
    if (!mushafDownloadSignature) return;
    void loadInstalls();
  }, [loadInstalls, mushafDownloadSignature]);

  const installsByKey = React.useMemo(() => {
    return new Map<string, MushafPackInstall>(
      installs.map((install) => [buildInstallKey(install.packId, install.version), install])
    );
  }, [installs]);

  const entries = React.useMemo<MushafPackManagerEntry[]>(() => {
    return MUSHAF_OPTIONS.map((option) => {
      const definition = getDownloadableMushafPackDefinition(option.packId);
      const install = installsByKey.get(buildInstallKey(option.packId, option.version)) ?? null;
      const downloadItem = itemsByKey.get(
        getDownloadKey({
          kind: 'mushaf-pack',
          packId: option.packId,
          version: option.version,
        })
      );
      const busyKey = buildInstallKey(option.packId, option.version);
      const isInstalled = option.channel === 'bundled' || install !== null;

      return {
        option,
        definition,
        install,
        downloadItem,
        isSelected: selectedPackId === option.packId,
        isInstalled,
        isBundled: option.channel === 'bundled',
        isBusy:
          busyInstallKeys.has(busyKey) ||
          downloadItem?.status === 'queued' ||
          downloadItem?.status === 'downloading' ||
          downloadItem?.status === 'deleting',
        isInstallImplemented: definition?.support === 'installable',
        isComingSoon: option.requiresDownload === true && definition?.support !== 'installable',
        statusLabel: getStatusLabel({
          option,
          isSelected: selectedPackId === option.packId,
          isInstalled,
          downloadItem,
          definition,
        }),
        progressLabel: formatItemsProgress(downloadItem),
        errorMessage: downloadItem?.status === 'failed' ? downloadItem.error ?? null : null,
      };
    });
  }, [busyInstallKeys, installsByKey, itemsByKey, selectedPackId]);

  const setBusy = React.useCallback((installKey: string, busy: boolean) => {
    setBusyInstallKeys((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(installKey);
      } else {
        next.delete(installKey);
      }
      return next;
    });
  }, []);

  const installPack = React.useCallback(
    async (packId: MushafPackId): Promise<void> => {
      const option = findMushafOption(packId);
      if (!option) {
        throw new Error(`Unknown mushaf pack: ${packId}`);
      }

      const installKey = buildInstallKey(option.packId, option.version);
      const installer = container.getMushafPackInstaller();

      setBusy(installKey, true);

      try {
        if (packId === 'qcf-madani-v1') {
          await installer.installQcfMadaniV1PackAsync({ activateOnInstall: true });
        } else {
          throw new Error('This mushaf download is not implemented yet.');
        }
      } finally {
        setBusy(installKey, false);
        await loadInstalls();
        refreshDownloadIndex();
      }
    },
    [loadInstalls, refreshDownloadIndex, setBusy]
  );

  const deletePack = React.useCallback(
    async (packId: MushafPackId): Promise<void> => {
      const option = findMushafOption(packId);
      if (!option) {
        throw new Error(`Unknown mushaf pack: ${packId}`);
      }

      const installKey = buildInstallKey(option.packId, option.version);
      setBusy(installKey, true);

      try {
        await container
          .getMushafPackInstaller()
          .deleteInstalledVersionAsync(option.packId, option.version);
      } finally {
        setBusy(installKey, false);
        await loadInstalls();
        refreshDownloadIndex();
      }
    },
    [loadInstalls, refreshDownloadIndex, setBusy]
  );

  const refresh = React.useCallback(() => {
    refreshDownloadIndex();
    void loadInstalls();
  }, [loadInstalls, refreshDownloadIndex]);

  return {
    entries,
    isLoading: isRegistryLoading || isDownloadIndexLoading,
    errorMessage: registryErrorMessage,
    installPack,
    deletePack,
    refresh,
  };
}
