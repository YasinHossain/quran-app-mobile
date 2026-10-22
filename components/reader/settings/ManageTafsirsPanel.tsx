import React from 'react';

import { useUiTranslation } from '@/providers/UiLanguageContext';
import { DeleteTafsirUseCase } from '@/src/core/application/use-cases/DeleteTafsir';
import {
  DownloadFullTafsirUseCase,
  requestTafsirDownloadCancel,
} from '@/src/core/application/use-cases/DownloadFullTafsir';
import { DownloadTafsirSurahUseCase } from '@/src/core/application/use-cases/DownloadTafsirSurah';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { getBundledTafsirDownloadSizeBytes } from '@/src/core/infrastructure/offline-packs/bundledDownloadMetadata';

import {
  ResourceSelectionPanel,
  type ResourceSelectionPanelConfig,
} from './resource-panel/ResourceSelectionPanel';
import type { ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TAFSIR_SELECTIONS = 3;

async function downloadTafsir(tafsirId: number): Promise<boolean> {
  const downloadTafsirSurahUseCase = new DownloadTafsirSurahUseCase(
    container.getDownloadIndexRepository(),
    container.getTafsirDownloadRepository(),
    container.getTafsirOfflineStore(),
    logger
  );
  const useCase = new DownloadFullTafsirUseCase(
    container.getDownloadIndexRepository(),
    downloadTafsirSurahUseCase,
    container.getTafsirOfflineStore(),
    logger,
    container.getTafsirPackRepository()
  );

  await useCase.execute(tafsirId);
  const installed = await container.getDownloadIndexRepository().get({ kind: 'tafsir', tafsirId });
  return installed?.status === 'installed';
}

async function deleteTafsir(tafsirId: number): Promise<void> {
  const useCase = new DeleteTafsirUseCase(
    container.getDownloadIndexRepository(),
    container.getTafsirOfflineStore(),
    logger
  );
  await useCase.execute(tafsirId);
}

const TAFSIR_PANEL_BEHAVIOR = {
  maxSelections: MAX_TAFSIR_SELECTIONS,
  getDownloadKey: (tafsirId: number) => getDownloadKey({ kind: 'tafsir', tafsirId }),
  getDownloadSizeBytes: getBundledTafsirDownloadSizeBytes,
  downloadResource: downloadTafsir,
  deleteResource: deleteTafsir,
  cancelDownload: requestTafsirDownloadCancel,
  getResetSelection: (tafsirs: ResourceRecord[]) => {
    const englishId = tafsirs.find((tafsir) => tafsir.lang.toLowerCase() === 'english')?.id;
    return englishId === undefined ? [] : [englishId];
  },
  // Tafsir is read from installed packs only.
  allowsOnlineSelection: false,
  // SettingsProvider reconciles saved tafsir ids against its verified index.
  pruneUnavailableSelections: false,
} satisfies Omit<ResourceSelectionPanelConfig, 'copy' | 'languageSort'>;

export function ManageTafsirsPanel({
  tafsirs,
  orderedSelection,
  onChangeSelection,
  isLoading,
  errorMessage,
  onRefresh,
  languageSort,
  isActive = true,
}: {
  tafsirs: ResourceRecord[];
  orderedSelection: number[];
  onChangeSelection: (ids: number[]) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
  languageSort: (a: string, b: string) => number;
  isActive?: boolean;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  const config = React.useMemo<ResourceSelectionPanelConfig>(
    () => ({
      ...TAFSIR_PANEL_BEHAVIOR,
      languageSort,
      copy: {
        resourceNoun: 'tafsir',
        searchPlaceholder: t('manage_tafsirs_search_placeholder', {
          fallback: 'Search tafsirs or languages...',
        }),
        emptySelectionText: 'No tafsirs selected',
        removeAccessibilityLabel: 'Remove tafsir',
        loadingText: 'Loading tafsirs...',
        emptyFilterText: 'No tafsir resources found for the selected filter.',
        downloadTitle: 'Download tafsir?',
      },
    }),
    [languageSort, t]
  );

  return (
    <ResourceSelectionPanel
      resources={tafsirs}
      orderedSelection={orderedSelection}
      onChangeSelection={onChangeSelection}
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRefresh={onRefresh}
      isActive={isActive}
      config={config}
    />
  );
}
