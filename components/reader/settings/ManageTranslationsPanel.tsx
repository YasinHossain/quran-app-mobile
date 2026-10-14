import React from 'react';

import { useUiTranslation } from '@/providers/UiLanguageContext';
import { DeleteTranslationUseCase } from '@/src/core/application/use-cases/DeleteTranslation';
import {
  DownloadTranslationUseCase,
  requestTranslationDownloadCancel,
} from '@/src/core/application/use-cases/DownloadTranslation';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { getBundledTranslationDownloadSizeBytes } from '@/src/core/infrastructure/offline-packs/bundledDownloadMetadata';

import {
  ResourceSelectionPanel,
  type ResourceSelectionPanelConfig,
} from './resource-panel/ResourceSelectionPanel';
import type { ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TRANSLATION_SELECTIONS = 5;

const DEFAULT_SAHEEH_ID = 20;

function isSaheehName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('saheeh international') || lower.includes('sahih international');
}

function translationLanguageSort(a: string, b: string): number {
  if (a === 'English') return -1;
  if (b === 'English') return 1;
  if (a === 'Bengali') return -1;
  if (b === 'Bengali') return 1;
  return a.localeCompare(b);
}

async function downloadTranslation(translationId: number): Promise<boolean> {
  const useCase = new DownloadTranslationUseCase(
    container.getDownloadIndexRepository(),
    container.getTranslationOfflineStore(),
    container.getTranslationDownloadRepository(),
    logger,
    container.getTranslationPackRepository()
  );
  await useCase.execute(translationId);
  return true;
}

async function deleteTranslation(translationId: number): Promise<void> {
  const useCase = new DeleteTranslationUseCase(
    container.getDownloadIndexRepository(),
    container.getTranslationOfflineStore(),
    logger
  );
  await useCase.execute(translationId);
}

const TRANSLATION_PANEL_BEHAVIOR = {
  maxSelections: MAX_TRANSLATION_SELECTIONS,
  languageSort: translationLanguageSort,
  getDownloadKey: (translationId: number) => getDownloadKey({ kind: 'translation', translationId }),
  getDownloadSizeBytes: getBundledTranslationDownloadSizeBytes,
  downloadResource: downloadTranslation,
  deleteResource: deleteTranslation,
  cancelDownload: requestTranslationDownloadCancel,
  getResetSelection: (translations: ResourceRecord[]) => [
    translations.find((translation) => isSaheehName(translation.name))?.id ?? DEFAULT_SAHEEH_ID,
  ],
  allowsOnlineSelection: true,
  pruneUnavailableSelections: true,
} satisfies Omit<ResourceSelectionPanelConfig, 'copy'>;

export function ManageTranslationsPanel({
  translations,
  orderedSelection,
  onChangeSelection,
  isLoading,
  errorMessage,
  onRefresh,
  isActive = true,
}: {
  translations: ResourceRecord[];
  orderedSelection: number[];
  onChangeSelection: (ids: number[]) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
  isActive?: boolean;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  const config = React.useMemo<ResourceSelectionPanelConfig>(
    () => ({
      ...TRANSLATION_PANEL_BEHAVIOR,
      copy: {
        resourceNoun: 'translation',
        searchPlaceholder: t('manage_translations_search_placeholder', {
          fallback: 'Search translations or languages...',
        }),
        emptySelectionText: 'No translations selected',
        removeAccessibilityLabel: 'Remove translation',
        loadingText: 'Loading translations...',
        emptyFilterText: 'No translation resources found for the selected filter.',
        downloadTitle: 'Download translation?',
        downloadDescription: 'This downloads the translation for offline reading.',
        deleteDescription: 'This removes downloaded verses for offline use.',
        notDownloadedTitle: 'Translation not downloaded',
        notDownloadedDescription:
          'Download it for offline reading, or continue online for in-app reading only. The Verse Spotlight widget cannot use online-only translations.',
      },
    }),
    [t]
  );

  return (
    <ResourceSelectionPanel
      resources={translations}
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
