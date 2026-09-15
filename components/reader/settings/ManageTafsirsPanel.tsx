import React from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { DeleteTafsirUseCase } from '@/src/core/application/use-cases/DeleteTafsir';
import {
  DownloadFullTafsirUseCase,
  requestTafsirDownloadCancel,
} from '@/src/core/application/use-cases/DownloadFullTafsir';
import { DownloadTafsirSurahUseCase } from '@/src/core/application/use-cases/DownloadTafsirSurah';
import type { DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { getBundledTafsirDownloadSizeBytes } from '@/src/core/infrastructure/offline-packs/bundledDownloadMetadata';

import {
  ReorderableSelectionList,
  configureSelectionLayoutAnimation,
} from './resource-panel/ReorderableSelectionList';
import { ResourceConfirmModal } from './resource-panel/ResourceConfirmModal';
import { ResourceDownloadAction } from './resource-panel/ResourceDownloadAction';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceTabs } from './resource-panel/ResourceTabs';
import { buildLanguages, filterResources, groupResources, type ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TAFSIR_SELECTIONS = 3;

const BYTES_PER_MEGABYTE = 1024 * 1024;

type Row =
  | { type: 'tabs' }
  | { type: 'section'; language: string }
  | { type: 'resource'; item: ResourceRecord }
  | { type: 'empty'; text: string };

function findEnglishTafsirId(tafsirs: ResourceRecord[]): number | undefined {
  return tafsirs.find((t) => t.lang.toLowerCase() === 'english')?.id;
}

function formatDownloadSizeLabel(sizeBytes: number | null): string {
  return sizeBytes
    ? `Download size: ${Math.max(0.1, sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
    : 'Download size unavailable';
}

const TafsirResourceRow = React.memo(function TafsirResourceRow({
  tafsir,
  downloadItem,
  isSelected,
  isBusy,
  isDark,
  tintColor,
  onToggle,
  onPressDownload,
  onPressDelete,
  onCancelDownload,
}: {
  tafsir: ResourceRecord;
  downloadItem: DownloadIndexItemWithKey | undefined;
  isSelected: boolean;
  isBusy: boolean;
  isDark: boolean;
  tintColor: string;
  onToggle: (id: number) => void;
  onPressDownload: (tafsir: ResourceRecord) => void;
  onPressDelete: (tafsir: ResourceRecord) => void;
  onCancelDownload: (tafsirId: number) => void;
}): React.JSX.Element {
  const status = downloadItem?.status ?? (isBusy ? 'queued' : undefined);
  const isDownloading = status === 'queued' || status === 'downloading';
  const isDeleting = status === 'deleting';
  const isInstalled = status === 'installed';

  const canDownload = !isBusy && !isDownloading && !isDeleting && !isInstalled;
  const canDelete = !isBusy && !isDownloading && !isDeleting && isInstalled;
  const canCancel = isDownloading;

  const trailingPress = isDownloading
    ? () => {
        if (canCancel) onCancelDownload(tafsir.id);
      }
    : isInstalled
      ? () => {
          if (canDelete) onPressDelete(tafsir);
        }
      : () => {
          if (canDownload) onPressDownload(tafsir);
        };

  const trailingLabel = isDownloading
    ? `Cancel ${tafsir.name} download`
    : isInstalled
      ? `Delete ${tafsir.name} offline download`
      : `Download ${tafsir.name} for offline use`;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
      <ResourceItem
        item={tafsir}
        isSelected={isSelected}
        onToggle={onToggle}
        trailingAction={
          <ResourceDownloadAction
            status={status}
            progress={downloadItem?.progress ?? (isBusy ? { kind: 'items', completed: 0, total: 1 } : undefined)}
            isSelected={isSelected}
            isDark={isDark}
            tintColor={tintColor}
          />
        }
        onTrailingPress={trailingPress}
        trailingAccessibilityLabel={trailingLabel}
        trailingDisabled={
          isDeleting || (isDownloading ? !canCancel : isInstalled ? !canDelete : !canDownload)
        }
      />
    </View>
  );
});

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
  languageSort?: (a: string, b: string) => number;
  isActive?: boolean;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { t } = useUiTranslation();
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [showLimitWarning, setShowLimitWarning] = React.useState(false);
  const [busyTafsirIds, setBusyTafsirIds] = React.useState<Set<number>>(() => new Set());
  const [downloadTarget, setDownloadTarget] = React.useState<ResourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ResourceRecord | null>(null);
  const selectionRef = React.useRef(orderedSelection);
  React.useLayoutEffect(() => {
    selectionRef.current = orderedSelection;
  }, [orderedSelection]);

  const selectedIds = React.useMemo(() => new Set<number>(orderedSelection ?? []), [orderedSelection]);
  const {
    itemsByKey,
    isLoading: isDownloadIndexLoading,
    errorMessage: downloadIndexErrorMessage,
    refresh: refreshIndex,
  } = useDownloadIndexItems({
    enabled: isActive,
    pollIntervalMs: 800,
    pollWhileEnabled: busyTafsirIds.size > 0,
  });

  const getTafsirDownloadItem = React.useCallback(
    (tafsirId: number) => itemsByKey.get(getDownloadKey({ kind: 'tafsir', tafsirId })),
    [itemsByKey]
  );

  const isTafsirDownloaded = React.useCallback(
    (tafsirId: number): boolean => getTafsirDownloadItem(tafsirId)?.status === 'installed',
    [getTafsirDownloadItem]
  );

  const promptDownloadRequired = React.useCallback((tafsir: ResourceRecord) => {
    setDownloadTarget(tafsir);
  }, []);

  // SettingsProvider reconciles installed selections after verifying its index.
  // Opening a picker must never rewrite preferences from its local loading state.

  const languages = React.useMemo(
    () => buildLanguages(tafsirs, languageSort),
    [languageSort, tafsirs]
  );

  React.useEffect(() => {
    if (languages.includes(activeFilter)) return;
    setActiveFilter('All');
  }, [activeFilter, languages]);

  const filteredTafsirs = React.useMemo(() => filterResources(tafsirs, searchTerm), [tafsirs, searchTerm]);
  const groupedTafsirs = React.useMemo(() => groupResources(filteredTafsirs), [filteredTafsirs]);

  const resourcesToRender = React.useMemo(() => {
    return activeFilter === 'All' ? filteredTafsirs : groupedTafsirs[activeFilter] ?? [];
  }, [activeFilter, filteredTafsirs, groupedTafsirs]);

  const sectionsToRender = React.useMemo(() => {
    const languageOrder = new Map(languages.map((lang, idx) => [lang, idx]));
    const entries = Object.entries(groupedTafsirs).sort(
      ([a], [b]) =>
        (languageOrder.get(a) ?? Number.POSITIVE_INFINITY) - (languageOrder.get(b) ?? Number.POSITIVE_INFINITY)
    );
    return entries.map(([language, items]) => ({ language, items }));
  }, [groupedTafsirs, languages]);

  const setBusy = React.useCallback((tafsirId: number, busy: boolean) => {
    setBusyTafsirIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(tafsirId);
      else next.delete(tafsirId);
      return next;
    });
  }, []);

  const downloadTafsir = React.useCallback(
    async (tafsirId: number): Promise<void> => {
      if (busyTafsirIds.has(tafsirId)) return;
      setBusy(tafsirId, true);

      try {
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
        const installed = await container.getDownloadIndexRepository().get({
          kind: 'tafsir', tafsirId,
        });
        const currentSelection = selectionRef.current ?? [];
        if (
          installed?.status === 'installed' &&
          !currentSelection.includes(tafsirId) &&
          currentSelection.length < MAX_TAFSIR_SELECTIONS
        ) {
          onChangeSelection([...currentSelection, tafsirId]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Download failed', message);
        logger.warn('Download tafsir failed', { tafsirId, message }, error as Error);
      } finally {
        setBusy(tafsirId, false);
        refreshIndex();
      }
    },
    [busyTafsirIds, onChangeSelection, refreshIndex, setBusy]
  );

  const deleteTafsir = React.useCallback(
    async (tafsirId: number): Promise<void> => {
      if (busyTafsirIds.has(tafsirId)) return;
      setBusy(tafsirId, true);

      try {
        const useCase = new DeleteTafsirUseCase(
          container.getDownloadIndexRepository(),
          container.getTafsirOfflineStore(),
          logger
        );
        await useCase.execute(tafsirId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Delete failed', message);
        logger.warn('Delete tafsir failed', { tafsirId, message }, error as Error);
      } finally {
        setBusy(tafsirId, false);
        refreshIndex();
      }
    },
    [busyTafsirIds, refreshIndex, setBusy]
  );

  const handlePressDownload = React.useCallback(
    (tafsir: ResourceRecord) => {
      if (busyTafsirIds.has(tafsir.id)) return;
      setDownloadTarget(tafsir);
    },
    [busyTafsirIds]
  );

  const handleConfirmDownload = React.useCallback(() => {
    if (!downloadTarget) return;
    const tafsirId = downloadTarget.id;
    setDownloadTarget(null);
    void downloadTafsir(tafsirId);
  }, [downloadTarget, downloadTafsir]);

  const handlePressDelete = React.useCallback((tafsir: ResourceRecord) => {
    setDeleteTarget(tafsir);
  }, []);

  const handleCancelDownload = React.useCallback((tafsirId: number) => {
    requestTafsirDownloadCancel(tafsirId);
  }, []);

  const handleConfirmDelete = React.useCallback(() => {
    if (!deleteTarget) return;
    const tafsirId = deleteTarget.id;
    setDeleteTarget(null);
    void deleteTafsir(tafsirId);
  }, [deleteTarget, deleteTafsir]);

  const handleToggle = React.useCallback(
    (id: number): boolean => {
      const current = orderedSelection ?? [];
      if (current.includes(id)) {
        configureSelectionLayoutAnimation();
        onChangeSelection(current.filter((x) => x !== id));
        setShowLimitWarning(false);
        return true;
      }

      const tafsir = tafsirs.find((item) => item.id === id);
      if (isDownloadIndexLoading) {
        Alert.alert(
          'Checking downloads',
          'Please try again in a moment while offline downloads are loaded.'
        );
        setShowLimitWarning(false);
        return false;
      }

      if (downloadIndexErrorMessage) {
        Alert.alert('Offline downloads unavailable', downloadIndexErrorMessage);
        setShowLimitWarning(false);
        return false;
      }

      if (!isTafsirDownloaded(id)) {
        if (tafsir) {
          promptDownloadRequired(tafsir);
        } else {
          Alert.alert(
            'Download tafsir first',
            'This tafsir must be downloaded before it can be selected for reading.'
          );
        }
        setShowLimitWarning(false);
        return false;
      }

      if (current.length >= MAX_TAFSIR_SELECTIONS) {
        setShowLimitWarning(true);
        return false;
      }

      configureSelectionLayoutAnimation();
      onChangeSelection([...current, id]);
      setShowLimitWarning(false);
      return true;
    },
    [
      downloadIndexErrorMessage,
      isDownloadIndexLoading,
      isTafsirDownloaded,
      onChangeSelection,
      orderedSelection,
      promptDownloadRequired,
      tafsirs,
    ]
  );

  const handleReset = React.useCallback(() => {
    const englishId = findEnglishTafsirId(tafsirs);
    const englishTafsir = tafsirs.find((tafsir) => tafsir.id === englishId);
    if (!englishTafsir) return;

    if (isDownloadIndexLoading) {
      Alert.alert(
        'Checking downloads',
        'Please try again in a moment while offline downloads are loaded.'
      );
      return;
    }

    if (downloadIndexErrorMessage) {
      Alert.alert('Offline downloads unavailable', downloadIndexErrorMessage);
      return;
    }

    if (!isTafsirDownloaded(englishTafsir.id)) {
      promptDownloadRequired(englishTafsir);
      return;
    }

    configureSelectionLayoutAnimation();
    onChangeSelection([englishTafsir.id]);
    setShowLimitWarning(false);
  }, [
    downloadIndexErrorMessage,
    isDownloadIndexLoading,
    isTafsirDownloaded,
    onChangeSelection,
    promptDownloadRequired,
    tafsirs,
  ]);

  const rows = React.useMemo<Row[]>(() => {
    const base: Row[] = [{ type: 'tabs' }];

    if (resourcesToRender.length === 0) {
      base.push({
        type: 'empty',
        text: tafsirs.length === 0 && isLoading
          ? 'Loading tafsir resources...'
          : 'No tafsir resources found for the selected filter.',
      });
      return base;
    }

    if (activeFilter === 'All') {
      sectionsToRender.forEach(({ language, items }) => {
        base.push({ type: 'section', language });
        items.forEach((item) => base.push({ type: 'resource', item }));
      });
      return base;
    }

    base.push({ type: 'section', language: activeFilter });
    resourcesToRender.forEach((item) => base.push({ type: 'resource', item }));
    return base;
  }, [activeFilter, isLoading, resourcesToRender, sectionsToRender, tafsirs.length]);

  // Pass an element, not a changing component type: download updates and typing
  // must preserve the search input, selection drag state, and header layout.
  const listHeader = React.useMemo((): React.JSX.Element => {
    return (
      <View className="p-4 gap-4">
        <HeaderSearchInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder={t('manage_tafsirs_search_placeholder', { fallback: 'Search tafsirs or languages...' })}
        />

        <ReorderableSelectionList
          variant="tafsir"
          orderedSelection={orderedSelection ?? []}
          resources={tafsirs}
          onRemove={(id) => handleToggle(id)}
          onReorder={onChangeSelection}
          onReset={handleReset}
          maxSelections={MAX_TAFSIR_SELECTIONS}
          emptyText="No tafsirs selected"
          onDragStateChange={setIsReordering}
        />
      </View>
    );
  }, [handleReset, handleToggle, onChangeSelection, orderedSelection, searchTerm, tafsirs, t]);

  const renderItem = React.useCallback(
    ({ item }: { item: Row }): React.JSX.Element | null => {
      if (item.type === 'tabs') {
        return (
          <View
            className="py-2"
            style={{ backgroundColor: palette.background }}
          >
            <View className="px-4">
              <ResourceTabs
                languages={languages}
                activeFilter={activeFilter}
                onTabPress={setActiveFilter}
              />
            </View>
          </View>
        );
      }

      if (item.type === 'section') {
        return (
          <View className="px-4 pt-4 pb-2">
            <Text className="text-lg font-semibold" style={{ color: palette.text }}>
              {item.language}
            </Text>
          </View>
        );
      }

      if (item.type === 'empty') {
        return (
          <View className="px-4 py-8 items-center">
            <Text className="text-sm text-center" style={{ color: palette.muted }}>
              {item.text}
            </Text>
          </View>
        );
      }

      const tafsir = item.item;
      const downloadItem = getTafsirDownloadItem(tafsir.id);

      return (
        <TafsirResourceRow
          tafsir={tafsir}
          downloadItem={downloadItem}
          isSelected={selectedIds.has(tafsir.id)}
          isBusy={busyTafsirIds.has(tafsir.id)}
          isDark={isDark}
          tintColor={palette.tint}
          onToggle={handleToggle}
          onPressDownload={handlePressDownload}
          onPressDelete={handlePressDelete}
          onCancelDownload={handleCancelDownload}
        />
      );
    },
    [
      activeFilter,
      busyTafsirIds,
      handleCancelDownload,
      handlePressDelete,
      handlePressDownload,
      handleToggle,
      getTafsirDownloadItem,
      isDark,
      languages,
      palette.tint,
      palette.background,
      palette.muted,
      palette.text,
      selectedIds,
    ]
  );

  if (errorMessage && tafsirs.length === 0) {
    return (
      <View className="flex-1 p-4 gap-3">
        <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
        {onRefresh ? (
          <Pressable
            onPress={onRefresh}
            className="self-start rounded-lg border px-4 py-2"
            style={({ pressed }) => ({
              backgroundColor: palette.interactive,
              borderColor: palette.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text className="text-sm font-semibold" style={{ color: palette.text }}>
              Retry
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (isLoading && tafsirs.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="text-sm" style={{ color: palette.muted }}>
          Loading tafsirs...
        </Text>
      </View>
    );
  }

  const downloadSizeLabel = formatDownloadSizeLabel(
    downloadTarget ? getBundledTafsirDownloadSizeBytes(downloadTarget.id) : null
  );

  return (
    <View className="flex-1">
      {showLimitWarning ? (
        <View className="mx-4 mt-3 mb-1 flex-row items-center rounded-lg border border-error dark:border-error-dark bg-error/90 px-3 py-2">
          <Text className="text-sm text-on-accent dark:text-on-accent-dark">
            Maximum {MAX_TAFSIR_SELECTIONS} tafsirs can be selected
          </Text>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(row) => {
          if (row.type === 'tabs') return 'tabs';
          if (row.type === 'section') return `section:${row.language}`;
          if (row.type === 'empty') return 'empty';
          return `resource:${row.item.id}`;
        }}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={false}
        scrollEnabled={!isReordering}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <ResourceConfirmModal
        visible={downloadTarget !== null}
        title="Download tafsir?"
        resourceName={downloadTarget?.name ?? null}
        detailLabel={downloadSizeLabel}
        description="This downloads the tafsir for offline reading."
        confirmLabel="Download"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDownload}
        onClose={() => setDownloadTarget(null)}
      />

      <ResourceConfirmModal
        visible={deleteTarget !== null}
        title="Delete download?"
        resourceName={deleteTarget?.name ?? null}
        description="This removes downloaded tafsir for offline use."
        confirmLabel="Delete"
        confirmTone="danger"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </View>
  );
}
