import React from 'react';

import { findMushafOption, MUSHAF_OPTIONS } from '@/data/mushaf/options';
import type { MushafPackInstall } from '@/src/core/domain/entities';
import { getDownloadKey, type DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import {
  getDownloadableMushafPackDefinition,
  type DownloadableMushafPackDefinition,
} from '@/src/core/infrastructure/mushaf/downloadablePacks';
import { getMushafPackCatalogUrl } from '@/src/core/infrastructure/mushaf/mushafPackCatalogConfig';
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
    return null;
  }

  if (progress.kind === 'percent') {
    return `${Math.round(progress.percent)}%`;
  }

  return null;
}

// Last install registry any instance loaded, so reopening the manager shows each pack's
// real action immediately instead of waiting for its own load.
let lastLoadedInstalls: MushafPackInstall[] | null = null;

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
  enabled = true,
}: {
  selectedPackId?: MushafPackId;
  enabled?: boolean;
}): {
  entries: MushafPackManagerEntry[];
  /** False until the installed packs are known, so callers don't show a wrong action. */
  isStatusKnown: boolean;
  errorMessage: string | null;
  installPack: (packId: MushafPackId) => Promise<void>;
  cancelPackInstall: (packId: MushafPackId) => Promise<void>;
  deletePack: (packId: MushafPackId) => Promise<void>;
  refresh: () => void;
} {
  const [installs, setInstalls] = React.useState<MushafPackInstall[] | null>(
    () => lastLoadedInstalls
  );
  const [registryErrorMessage, setRegistryErrorMessage] = React.useState<string | null>(null);
  const [busyInstallKeys, setBusyInstallKeys] = React.useState<Set<string>>(() => new Set());
  const busyInstallKeysRef = React.useRef<Set<string>>(new Set());
  const { items, itemsByKey, refresh: refreshDownloadIndex } = useDownloadIndexItems({
    enabled,
    pollIntervalMs: 1000,
    pollWhileEnabled: busyInstallKeys.size > 0,
    startFromLastLoad: true,
  });

  const loadInstalls = React.useCallback(async () => {
    try {
      const nextInstalls = await container.getMushafPackInstallRegistry().list();
      lastLoadedInstalls = nextInstalls;
      setInstalls(nextInstalls);
      setRegistryErrorMessage(null);
    } catch (error) {
      logger.warn('Failed to load mushaf pack installs', undefined, error as Error);
      setRegistryErrorMessage(
        error instanceof Error ? error.message : 'Failed to load mushaf pack installs.'
      );
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    void loadInstalls();
  }, [enabled, loadInstalls]);

  const mushafDownloadSignature = React.useMemo(() => {
    return items
      .filter((item) => item.content.kind === 'mushaf-pack')
      .map((item) => `${item.key}:${item.status}`)
      .join('|');
  }, [items]);

  React.useEffect(() => {
    if (!mushafDownloadSignature) return;
    void loadInstalls();
  }, [loadInstalls, mushafDownloadSignature]);

  const installsByKey = React.useMemo(() => {
    return new Map<string, MushafPackInstall>(
      (installs ?? []).map((install) => [buildInstallKey(install.packId, install.version), install])
    );
  }, [installs]);

  const activeDownloadInstallKey = React.useMemo(() => {
    const activeItem = items.find(
      (item) =>
        item.content.kind === 'mushaf-pack' &&
        (item.status === 'queued' ||
          item.status === 'downloading' ||
          item.status === 'deleting')
    );
    return activeItem?.content.kind === 'mushaf-pack'
      ? buildInstallKey(activeItem.content.packId, activeItem.content.version)
      : null;
  }, [items]);

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
      const isInstalled = install !== null;

      return {
        option,
        definition,
        install,
        downloadItem,
        isSelected: selectedPackId === option.packId,
        isInstalled,
        isBundled: false,
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
    const nextRef = new Set(busyInstallKeysRef.current);
    if (busy) {
      nextRef.add(installKey);
    } else {
      nextRef.delete(installKey);
    }
    busyInstallKeysRef.current = nextRef;

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
      const localActiveInstallKeys = busyInstallKeysRef.current;
      const hasAnotherLocalInstall =
        localActiveInstallKeys.size > 0 && !localActiveInstallKeys.has(installKey);

      if (
        hasAnotherLocalInstall ||
        (activeDownloadInstallKey !== null && activeDownloadInstallKey !== installKey)
      ) {
        throw new Error('Another mushaf pack install is already in progress.');
      }

      installer.clearPackInstallCancel(option.packId, option.version);
      setBusy(installKey, true);

      try {
        const catalogUrl = getMushafPackCatalogUrl();
        if (!catalogUrl) {
          throw new Error('Mushaf download host is not configured. API fallback is disabled.');
        }

        const catalogEntry = await container.getMushafPackCatalogClient().getPack(catalogUrl, {
          packId: option.packId,
          version: option.version,
        });
        if (!catalogEntry) {
          throw new Error(
            `${option.name} is not available on the configured download host. API fallback is disabled.`
          );
        }

        await installer.installHostedPackAsync({
          catalogEntry,
          activateOnInstall: true,
        });
      } finally {
        setBusy(installKey, false);
        await loadInstalls();
        refreshDownloadIndex();
      }
    },
    [activeDownloadInstallKey, loadInstalls, refreshDownloadIndex, setBusy]
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

  const cancelPackInstall = React.useCallback(
    async (packId: MushafPackId): Promise<void> => {
      const option = findMushafOption(packId);
      if (!option) {
        throw new Error(`Unknown mushaf pack: ${packId}`);
      }

      const installKey = buildInstallKey(option.packId, option.version);
      setBusy(installKey, false);

      try {
        await container
          .getMushafPackInstaller()
          .cancelDownloadablePackInstallAsync(option.packId, option.version);
      } finally {
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
    isStatusKnown: installs !== null || registryErrorMessage !== null,
    errorMessage: registryErrorMessage,
    installPack,
    cancelPackInstall,
    deletePack,
    refresh,
  };
}
