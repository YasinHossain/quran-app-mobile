import React from 'react';
import { FlashList } from '@shopify/flash-list';
import { Alert, InteractionManager, Platform, Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAppTheme } from '@/providers/ThemeContext';
import { DeleteTafsirUseCase } from '@/src/core/application/use-cases/DeleteTafsir';
import {
  DownloadFullTafsirUseCase,
  requestTafsirDownloadCancel,
} from '@/src/core/application/use-cases/DownloadFullTafsir';
import { DownloadTafsirSurahUseCase } from '@/src/core/application/use-cases/DownloadTafsirSurah';
import type { DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import chaptersData from '../../../src/data/chapters.en.json';

import { ReorderableSelectionList } from './resource-panel/ReorderableSelectionList';
import { ResourceConfirmModal } from './resource-panel/ResourceConfirmModal';
import { ResourceDownloadAction } from './resource-panel/ResourceDownloadAction';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceTabs } from './resource-panel/ResourceTabs';
import { buildLanguages, filterResources, groupResources, type ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TAFSIR_SELECTIONS = 3;

const ESTIMATE_SAMPLE_CHAPTERS = [1, 2, 18, 36, 55, 78] as const;
const ESTIMATE_STORAGE_OVERHEAD_MULTIPLIER = 1.2;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const FALLBACK_TOTAL_VERSE_COUNT = 6236;

const TOTAL_VERSE_COUNT = (
  Array.isArray(chaptersData)
    ? chaptersData.reduce((total, chapter) => {
        const verses = typeof chapter?.verses_count === 'number' ? chapter.verses_count : 0;
        return total + Math.max(0, verses);
      }, 0)
    : 0
) || FALLBACK_TOTAL_VERSE_COUNT;

type DownloadSizeInfo = {
  mb: number | null;
  isExact: boolean;
};

type ApiEstimateTafsir = {
  resource_id?: number;
  text?: string;
};

type ApiEstimateResponse = {
  tafsirs?: ApiEstimateTafsir[];
};

type Row =
  | { type: 'tabs' }
  | { type: 'section'; language: string }
  | { type: 'resource'; item: ResourceRecord }
  | { type: 'empty'; text: string };

function findEnglishTafsirId(tafsirs: ResourceRecord[]): number | undefined {
  return tafsirs.find((t) => t.lang.toLowerCase() === 'english')?.id;
}

function utf8ByteLength(input: string): number {
  const encoded = encodeURIComponent(input);
  let bytes = 0;

  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes += 1;
      index += 2;
      continue;
    }
    bytes += 1;
  }

  return bytes;
}

async function estimateTafsirSizeMb(tafsirId: number): Promise<number> {
  const sampleResponses = await Promise.all(
    ESTIMATE_SAMPLE_CHAPTERS.map((chapterNumber) =>
      apiFetch<ApiEstimateResponse>(
        `/tafsirs/${tafsirId}/by_chapter/${chapterNumber}`,
        {
          per_page: '300',
          page: '1',
        },
        'Failed to estimate tafsir size'
      )
    )
  );

  let sampleByteCount = 0;
  let sampleVerseCount = 0;

  for (const response of sampleResponses) {
    for (const tafsir of response.tafsirs ?? []) {
      if (Number(tafsir.resource_id ?? tafsirId) !== tafsirId) continue;
      const html = String(tafsir.text ?? '').trim();
      sampleByteCount += utf8ByteLength(html);
      sampleVerseCount += 1;
    }
  }

  if (sampleVerseCount <= 0) {
    throw new Error('No sample tafsir verses available for size estimation');
  }

  const averageBytesPerVerse = sampleByteCount / sampleVerseCount;
  const estimatedStoredBytes =
    averageBytesPerVerse * TOTAL_VERSE_COUNT * ESTIMATE_STORAGE_OVERHEAD_MULTIPLIER;
  const estimatedMb = estimatedStoredBytes / BYTES_PER_MEGABYTE;

  return Math.max(0.1, Math.round(estimatedMb * 10) / 10);
}

async function resolveTafsirDownloadSizeInfo(tafsirId: number): Promise<DownloadSizeInfo> {
  const packAvailability = await container.getTafsirPackRepository().getPackAvailability(tafsirId);
  if (packAvailability && packAvailability.sizeBytes > 0) {
    const mb = Math.max(0.1, Math.round((packAvailability.sizeBytes / BYTES_PER_MEGABYTE) * 10) / 10);
    return { mb, isExact: true };
  }

  const estimatedMb = await estimateTafsirSizeMb(tafsirId);
  return {
    mb: estimatedMb,
    isExact: false,
  };
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
  const status = downloadItem?.status;
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
    <View className="px-4 py-1">
      <ResourceItem
        item={tafsir}
        isSelected={isSelected}
        onToggle={onToggle}
        trailingAction={
          <ResourceDownloadAction
            status={status}
            progress={downloadItem?.progress}
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
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [showLimitWarning, setShowLimitWarning] = React.useState(false);
  const [busyTafsirIds, setBusyTafsirIds] = React.useState<Set<number>>(() => new Set());
  const [downloadTarget, setDownloadTarget] = React.useState<ResourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ResourceRecord | null>(null);
  const [downloadSizeInfoById, setDownloadSizeInfoById] = React.useState<
    Record<number, DownloadSizeInfo | null | undefined>
  >({});
  const [estimatingTafsirIds, setEstimatingTafsirIds] = React.useState<Set<number>>(() => new Set());

  const selectedIds = React.useMemo(() => new Set<number>(orderedSelection ?? []), [orderedSelection]);
  const {
    itemsByKey,
    isLoading: isDownloadIndexLoading,
    errorMessage: downloadIndexErrorMessage,
    refresh: refreshIndex,
  } = useDownloadIndexItems({
    enabled: isActive,
    pollIntervalMs: 800,
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
    Alert.alert(
      'Download tafsir first',
      `${tafsir.name} must be downloaded before it can be selected for reading.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => setDownloadTarget(tafsir),
        },
      ]
    );
  }, []);

  React.useEffect(() => {
    if (!isActive || isDownloadIndexLoading) return;
    if (downloadIndexErrorMessage) return;
    const current = orderedSelection ?? [];
    if (current.length === 0) return;

    const installedSelection = current.filter(isTafsirDownloaded);
    if (installedSelection.length === current.length) return;

    onChangeSelection(installedSelection);
    setShowLimitWarning(false);
  }, [
    isActive,
    downloadIndexErrorMessage,
    isDownloadIndexLoading,
    isTafsirDownloaded,
    onChangeSelection,
    orderedSelection,
  ]);

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Download failed', message);
        logger.warn('Download tafsir failed', { tafsirId, message }, error as Error);
      } finally {
        setBusy(tafsirId, false);
        refreshIndex();
      }
    },
    [busyTafsirIds, refreshIndex, setBusy]
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

  const ensureDownloadSizeInfo = React.useCallback(
    async (tafsirId: number): Promise<void> => {
      if (downloadSizeInfoById[tafsirId] !== undefined) return;
      if (estimatingTafsirIds.has(tafsirId)) return;

      setEstimatingTafsirIds((prev) => {
        const next = new Set(prev);
        next.add(tafsirId);
        return next;
      });

      try {
        const sizeInfo = await resolveTafsirDownloadSizeInfo(tafsirId);
        setDownloadSizeInfoById((prev) => ({ ...prev, [tafsirId]: sizeInfo }));
      } catch (error) {
        logger.warn('Failed to resolve tafsir download size', { tafsirId }, error as Error);
        setDownloadSizeInfoById((prev) => ({ ...prev, [tafsirId]: null }));
      } finally {
        setEstimatingTafsirIds((prev) => {
          const next = new Set(prev);
          next.delete(tafsirId);
          return next;
        });
      }
    },
    [downloadSizeInfoById, estimatingTafsirIds]
  );

  const handlePressDownload = React.useCallback(
    (tafsir: ResourceRecord) => {
      if (busyTafsirIds.has(tafsir.id)) return;
      setDownloadTarget(tafsir);
    },
    [busyTafsirIds]
  );

  React.useEffect(() => {
    if (!downloadTarget) return;

    let cancelled = false;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      void ensureDownloadSizeInfo(downloadTarget.id);
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
    };
  }, [downloadTarget, ensureDownloadSizeInfo]);

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

    resourcesToRender.forEach((item) => base.push({ type: 'resource', item }));
    return base;
  }, [activeFilter, isLoading, resourcesToRender, sectionsToRender, tafsirs.length]);

  const getRowType = React.useCallback((row: Row): string => row.type, []);

  const overrideRowLayout = React.useCallback((layout: { span?: number }, row: Row): void => {
    const sizedLayout = layout as { span?: number; size?: number };

    if (row.type === 'resource') {
      sizedLayout.size = 58;
      return;
    }

    if (row.type === 'section') {
      sizedLayout.size = 48;
      return;
    }

    if (row.type === 'tabs') {
      sizedLayout.size = 56;
      return;
    }

    sizedLayout.size = 90;
  }, []);

  const renderHeader = React.useCallback((): React.JSX.Element => {
    return (
      <View className="p-4 gap-4">
        <HeaderSearchInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search tafsirs or languages..."
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
  }, [handleReset, handleToggle, onChangeSelection, orderedSelection, searchTerm, tafsirs]);

  const renderItem = React.useCallback(
    ({
      item,
      target,
    }: {
      item: Row;
      target: 'Cell' | 'StickyHeader' | 'Measurement';
    }): React.JSX.Element | null => {
      if (item.type === 'tabs') {
        return (
          <View
            className="py-2 border-b bg-background dark:bg-background-dark border-border dark:border-border-dark"
            style={
              target === 'StickyHeader'
                ? { zIndex: 10, elevation: 8 }
                : undefined
            }
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
            <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
              {item.language}
            </Text>
          </View>
        );
      }

      if (item.type === 'empty') {
        return (
          <View className="px-4 py-8 items-center">
            <Text className="text-sm text-muted dark:text-muted-dark text-center">{item.text}</Text>
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
            className="self-start rounded-lg bg-interactive dark:bg-interactive-dark border border-border dark:border-border-dark px-4 py-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (isLoading && tafsirs.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsirs...</Text>
      </View>
    );
  }

  const downloadSizeInfo = downloadTarget ? downloadSizeInfoById[downloadTarget.id] : undefined;
  const isEstimatingDownloadSize =
    downloadTarget !== null &&
    (downloadSizeInfo === undefined || estimatingTafsirIds.has(downloadTarget.id));
  const downloadEstimateLabel = isEstimatingDownloadSize
    ? 'Estimating size...'
    : downloadSizeInfo && typeof downloadSizeInfo.mb === 'number'
      ? downloadSizeInfo.isExact
        ? `Download size: ${downloadSizeInfo.mb.toFixed(1)} MB`
        : `Estimated size: ~${downloadSizeInfo.mb.toFixed(1)} MB`
      : 'Download size unavailable';

  return (
    <View className="flex-1">
      {showLimitWarning ? (
        <View className="mx-4 mt-3 mb-1 flex-row items-center rounded-lg border border-error dark:border-error-dark bg-error/90 px-3 py-2">
          <Text className="text-sm text-on-accent dark:text-on-accent-dark">
            Maximum {MAX_TAFSIR_SELECTIONS} tafsirs can be selected
          </Text>
        </View>
      ) : null}

      <FlashList
        data={rows}
        keyExtractor={(row) => {
          if (row.type === 'tabs') return 'tabs';
          if (row.type === 'section') return `section:${row.language}`;
          if (row.type === 'empty') return 'empty';
          return `resource:${row.item.id}`;
        }}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        drawDistance={Platform.OS === 'android' ? 350 : 250}
        getItemType={getRowType}
        overrideItemLayout={overrideRowLayout}
        overrideProps={{ initialDrawBatchSize: 8, scrollEventThrottle: 16 }}
        scrollEnabled={!isReordering}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <ResourceConfirmModal
        visible={downloadTarget !== null}
        title="Download tafsir?"
        resourceName={downloadTarget?.name ?? null}
        detailLabel={downloadEstimateLabel}
        isDetailLoading={isEstimatingDownloadSize}
        description="This downloads the tafsir for offline reading."
        confirmLabel="Download"
        mutedColor={palette.muted}
        tintColor={palette.tint}
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
        tintColor={palette.tint}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </View>
  );
}
