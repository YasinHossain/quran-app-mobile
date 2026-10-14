import React from 'react';
import { FlashList } from '@shopify/flash-list';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAppTheme } from '@/providers/ThemeContext';
import type { DownloadIndexItemWithKey, DownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import { ReorderableSelectionList } from './ReorderableSelectionList';
import { ResourceConfirmModal } from './ResourceConfirmModal';
import { ResourceDownloadAction } from './ResourceDownloadAction';
import { ResourceItem } from './ResourceItem';
import { ResourceTabs } from './ResourceTabs';
import { buildLanguages, filterResources, groupResources, type ResourceRecord } from './resourcePanel.utils';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const SELECTION_COMMIT_DEBOUNCE_MS = 48;

export interface ResourceSelectionPanelCopy {
  /** Lowercase singular noun used in log messages, e.g. "translation". */
  resourceNoun: string;
  searchPlaceholder: string;
  emptySelectionText: string;
  removeAccessibilityLabel: string;
  loadingText: string;
  emptyFilterText: string;
  downloadTitle: string;
  downloadDescription: string;
  deleteDescription: string;
  /** Shown when an online-selectable resource is picked before it is downloaded. */
  notDownloadedTitle?: string;
  notDownloadedDescription?: string;
}

export interface ResourceSelectionPanelConfig {
  maxSelections: number;
  languageSort: (a: string, b: string) => number;
  getDownloadKey: (id: number) => DownloadKey;
  getDownloadSizeBytes: (id: number) => number | null;
  /** Resolves true when the resource ended up installed and may be auto-selected. */
  downloadResource: (id: number) => Promise<boolean>;
  deleteResource: (id: number) => Promise<void>;
  cancelDownload: (id: number) => void;
  getResetSelection: (resources: ResourceRecord[]) => number[];
  /**
   * Translations can be read online, so an undownloaded pick offers "Continue online".
   * Tafsirs must be installed first, so a pick waits for a verified download index.
   */
  allowsOnlineSelection: boolean;
  /** Drop saved ids missing from the loaded catalog once (when the provider does not reconcile them). */
  pruneUnavailableSelections: boolean;
  copy: ResourceSelectionPanelCopy;
}

function normalizeOrderedSelection(
  ids: number[],
  maxSelections: number,
  validIds?: Set<number>
): number[] {
  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const raw of ids ?? []) {
    if (!Number.isFinite(raw)) continue;
    const id = Math.trunc(raw);
    if (id <= 0) continue;
    if (validIds && !validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= maxSelections) break;
  }

  return normalized;
}

function areSelectionsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function formatDownloadSizeLabel(sizeBytes: number | null): string {
  return sizeBytes
    ? `Download size: ${Math.max(0.1, sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
    : 'Download size unavailable';
}

type Row =
  | { type: 'tabs' }
  | { type: 'section'; language: string }
  | { type: 'resource'; item: ResourceRecord }
  | { type: 'empty'; text: string };

const ResourceRow = React.memo(function ResourceRow({
  resource,
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
  resource: ResourceRecord;
  downloadItem: DownloadIndexItemWithKey | undefined;
  isSelected: boolean;
  isBusy: boolean;
  isDark: boolean;
  tintColor: string;
  onToggle: (id: number) => void;
  onPressDownload: (resource: ResourceRecord) => void;
  onPressDelete: (resource: ResourceRecord) => void;
  onCancelDownload: (id: number) => void;
}): React.JSX.Element {
  const status = downloadItem?.status ?? (isBusy ? 'queued' : undefined);
  const isDownloading = status === 'queued' || status === 'downloading';
  const isDeleting = status === 'deleting';
  const isInstalled = status === 'installed';

  const canDownload = !isBusy && !isDownloading && !isDeleting && !isInstalled;
  const canDelete = !isBusy && !isDownloading && !isDeleting && isInstalled;
  const canCancel = isDownloading;
  const actionIcon = (
    <ResourceDownloadAction
      status={status}
      progress={downloadItem?.progress ?? (isBusy ? { kind: 'items', completed: 0, total: 1 } : undefined)}
      isSelected={isSelected}
      isDark={isDark}
      tintColor={tintColor}
    />
  );

  const trailingPress = isDownloading
    ? () => {
        if (canCancel) onCancelDownload(resource.id);
      }
    : isInstalled
      ? () => {
          if (canDelete) onPressDelete(resource);
        }
      : () => {
          if (canDownload) onPressDownload(resource);
        };

  const trailingLabel = isDownloading
    ? `Cancel ${resource.name} download`
    : isInstalled
      ? `Delete ${resource.name} offline download`
      : `Download ${resource.name} for offline use`;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
      <ResourceItem
        item={resource}
        isSelected={isSelected}
        onToggle={onToggle}
        trailingAction={actionIcon}
        onTrailingPress={trailingPress}
        trailingAccessibilityLabel={trailingLabel}
        trailingDisabled={
          isDeleting || (isDownloading ? !canCancel : isInstalled ? !canDelete : !canDownload)
        }
      />
    </View>
  );
});

const ResourcePanelHeader = React.memo(function ResourcePanelHeader({
  searchTerm,
  onChangeSearchTerm,
  searchPlaceholder,
  orderedSelection,
  resources,
  onRemove,
  onReorder,
  onReset,
  onDragStateChange,
  maxSelections,
  emptySelectionText,
  removeAccessibilityLabel,
}: {
  searchTerm: string;
  onChangeSearchTerm: (value: string) => void;
  searchPlaceholder: string;
  orderedSelection: number[];
  resources: ResourceRecord[];
  onRemove: (id: number) => void;
  onReorder: (ids: number[]) => void;
  onReset: () => void;
  onDragStateChange: (dragging: boolean) => void;
  maxSelections: number;
  emptySelectionText: string;
  removeAccessibilityLabel: string;
}): React.JSX.Element {
  return (
    <View className="p-4 gap-4">
      <HeaderSearchInput
        value={searchTerm}
        onChangeText={onChangeSearchTerm}
        placeholder={searchPlaceholder}
      />

      <ReorderableSelectionList
        orderedSelection={orderedSelection}
        resources={resources}
        onRemove={onRemove}
        onReorder={onReorder}
        onReset={onReset}
        maxSelections={maxSelections}
        emptyText={emptySelectionText}
        removeAccessibilityLabel={removeAccessibilityLabel}
        onDragStateChange={onDragStateChange}
      />
    </View>
  );
});

/**
 * Shared "manage resources" panel (search, My Selections, language tabs, offline
 * download/delete/cancel). Selection changes update the panel immediately and are
 * committed to settings shortly after in a transition, so taps never wait for the reader.
 */
export function ResourceSelectionPanel({
  resources,
  orderedSelection,
  onChangeSelection,
  isLoading,
  errorMessage,
  onRefresh,
  isActive = true,
  config,
}: {
  resources: ResourceRecord[];
  orderedSelection: number[];
  onChangeSelection: (ids: number[]) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
  /** False while the panel is mounted offscreen; it stays fully rendered but does not poll. */
  isActive?: boolean;
  config: ResourceSelectionPanelConfig;
}): React.JSX.Element {
  const {
    maxSelections,
    languageSort,
    getDownloadKey,
    getDownloadSizeBytes,
    allowsOnlineSelection,
    pruneUnavailableSelections,
    copy,
  } = config;
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [busyIds, setBusyIds] = React.useState<Set<number>>(() => new Set());
  const [downloadTarget, setDownloadTarget] = React.useState<ResourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ResourceRecord | null>(null);
  const [selectionTarget, setSelectionTarget] = React.useState<ResourceRecord | null>(null);
  const [localOrderedSelection, setLocalOrderedSelection] = React.useState<number[]>(() =>
    normalizeOrderedSelection(orderedSelection ?? [], maxSelections)
  );
  const hasPrunedSelectionRef = React.useRef(false);
  const latestSelectionRef = React.useRef(localOrderedSelection);
  const commitTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRevisionRef = React.useRef(0);
  const orderedSelectionRef = React.useRef(orderedSelection);

  React.useEffect(() => {
    orderedSelectionRef.current = orderedSelection;
    if (commitTimeoutRef.current !== null) return;

    const normalized = normalizeOrderedSelection(orderedSelection ?? [], maxSelections);
    if (areSelectionsEqual(normalized, latestSelectionRef.current)) return;

    latestSelectionRef.current = normalized;
    setLocalOrderedSelection(normalized);
  }, [maxSelections, orderedSelection]);

  React.useEffect(() => {
    latestSelectionRef.current = localOrderedSelection;
  }, [localOrderedSelection]);

  const selectedIds = React.useMemo(
    () => new Set<number>(localOrderedSelection ?? []),
    [localOrderedSelection]
  );
  const availableIds = React.useMemo(
    () => new Set<number>((resources ?? []).map((resource) => resource.id)),
    [resources]
  );
  // Loaded while the panel is still offscreen so download and selection states
  // are already correct when it slides in; only polling waits for it to be visible.
  const {
    itemsByKey,
    isLoading: isDownloadIndexLoading,
    errorMessage: downloadIndexErrorMessage,
    refresh: refreshIndex,
  } = useDownloadIndexItems({
    pollIntervalMs: isActive ? 800 : 0,
    pollWhileEnabled: busyIds.size > 0,
    startFromLastLoad: true,
  });

  const getDownloadItem = React.useCallback(
    (id: number) => itemsByKey.get(getDownloadKey(id)),
    [getDownloadKey, itemsByKey]
  );

  const scheduleSelectionCommit = React.useCallback(
    (nextIds: number[]) => {
      latestSelectionRef.current = nextIds;
      commitRevisionRef.current += 1;
      const scheduledRevision = commitRevisionRef.current;

      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }

      commitTimeoutRef.current = setTimeout(() => {
        commitTimeoutRef.current = null;
        const idsToCommit = [...latestSelectionRef.current];

        if (scheduledRevision !== commitRevisionRef.current) return;
        if (areSelectionsEqual(idsToCommit, orderedSelectionRef.current)) return;

        React.startTransition(() => {
          onChangeSelection(idsToCommit);
        });
      }, SELECTION_COMMIT_DEBOUNCE_MS);
    },
    [onChangeSelection]
  );

  const applySelection = React.useCallback(
    (nextIds: number[]) => {
      setLocalOrderedSelection(nextIds);
      scheduleSelectionCommit(nextIds);
    },
    [scheduleSelectionCommit]
  );

  React.useEffect(
    () => () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
      }
      const finalSelection = latestSelectionRef.current;
      if (!areSelectionsEqual(finalSelection, orderedSelectionRef.current)) {
        React.startTransition(() => onChangeSelection([...finalSelection]));
      }
    },
    [onChangeSelection]
  );

  React.useEffect(() => {
    if (!pruneUnavailableSelections) return;
    if (hasPrunedSelectionRef.current) return;
    if (resources.length === 0) return;
    hasPrunedSelectionRef.current = true;

    const normalized = normalizeOrderedSelection(latestSelectionRef.current, maxSelections, availableIds);
    if (areSelectionsEqual(normalized, latestSelectionRef.current)) return;

    applySelection(normalized);
  }, [applySelection, availableIds, maxSelections, pruneUnavailableSelections, resources.length]);

  const setBusy = React.useCallback((id: number, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const downloadResource = React.useCallback(
    async (id: number): Promise<void> => {
      if (busyIds.has(id)) return;
      setBusy(id, true);

      try {
        const installed = await config.downloadResource(id);
        const current = latestSelectionRef.current ?? [];
        if (installed && !current.includes(id) && current.length < maxSelections) {
          applySelection([...current, id]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Download failed', message);
        logger.warn(`Download ${copy.resourceNoun} failed`, { id, message }, error as Error);
      } finally {
        setBusy(id, false);
        void refreshIndex();
      }
    },
    [applySelection, busyIds, config, copy.resourceNoun, maxSelections, refreshIndex, setBusy]
  );

  const deleteResource = React.useCallback(
    async (id: number): Promise<void> => {
      if (busyIds.has(id)) return;
      setBusy(id, true);

      try {
        await config.deleteResource(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Delete failed', message);
        logger.warn(`Delete ${copy.resourceNoun} failed`, { id, message }, error as Error);
      } finally {
        setBusy(id, false);
        void refreshIndex();
      }
    },
    [busyIds, config, copy.resourceNoun, refreshIndex, setBusy]
  );

  const handlePressDownload = React.useCallback(
    (resource: ResourceRecord) => {
      if (busyIds.has(resource.id)) return;
      setDownloadTarget(resource);
    },
    [busyIds]
  );

  const handleConfirmDownload = React.useCallback(() => {
    if (!downloadTarget) return;
    const id = downloadTarget.id;
    setDownloadTarget(null);
    void downloadResource(id);
  }, [downloadTarget, downloadResource]);

  const handlePressDelete = React.useCallback((resource: ResourceRecord) => {
    setDeleteTarget(resource);
  }, []);

  const handleCancelDownload = config.cancelDownload;

  const handleConfirmDelete = React.useCallback(() => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    void deleteResource(id);
  }, [deleteTarget, deleteResource]);

  const allLanguages = React.useMemo(
    () => buildLanguages(resources, languageSort),
    [languageSort, resources]
  );

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredResources = React.useMemo(
    () => filterResources(resources, searchTerm),
    [resources, searchTerm]
  );

  const languages = React.useMemo(() => {
    if (!normalizedSearchTerm) return allLanguages;
    const filteredLanguages = buildLanguages(filteredResources, languageSort);
    return filteredLanguages.length > 1 ? filteredLanguages : allLanguages;
  }, [allLanguages, filteredResources, languageSort, normalizedSearchTerm]);

  React.useEffect(() => {
    if (languages.includes(activeFilter)) return;
    setActiveFilter('All');
  }, [activeFilter, languages]);

  const groupedResources = React.useMemo(
    () => groupResources(filteredResources),
    [filteredResources]
  );

  const resourcesToRender = React.useMemo(() => {
    return activeFilter === 'All' ? filteredResources : groupedResources[activeFilter] ?? [];
  }, [activeFilter, filteredResources, groupedResources]);

  const sectionsToRender = React.useMemo(() => {
    const languageOrder = new Map(languages.map((language, index) => [language, index]));
    const entries = Object.entries(groupedResources).sort(([a], [b]) => {
      const orderA = languageOrder.get(a) ?? Number.POSITIVE_INFINITY;
      const orderB = languageOrder.get(b) ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return languageSort(a, b);
    });

    return entries.map(([language, items]) => ({ language, items }));
  }, [groupedResources, languageSort, languages]);

  /** Download-required resources can only be picked once the index confirms they are installed. */
  const ensureInstalledBeforeSelect = React.useCallback(
    (resource: ResourceRecord | undefined, id: number): boolean => {
      if (isDownloadIndexLoading) {
        Alert.alert(
          'Checking downloads',
          'Please try again in a moment while offline downloads are loaded.'
        );
        return false;
      }
      if (downloadIndexErrorMessage) {
        Alert.alert('Offline downloads unavailable', downloadIndexErrorMessage);
        return false;
      }
      if (getDownloadItem(id)?.status === 'installed') return true;
      if (resource) setDownloadTarget(resource);
      return false;
    },
    [downloadIndexErrorMessage, getDownloadItem, isDownloadIndexLoading]
  );

  const handleToggle = React.useCallback(
    (id: number): boolean => {
      const current = latestSelectionRef.current ?? [];
      if (current.includes(id)) {
        applySelection(current.filter((x) => x !== id));
        return true;
      }

      if (current.length >= maxSelections) return false;

      const resource = resources.find((item) => item.id === id);
      if (allowsOnlineSelection) {
        if (getDownloadItem(id)?.status !== 'installed') {
          if (resource) setSelectionTarget(resource);
          return false;
        }
      } else if (!ensureInstalledBeforeSelect(resource, id)) {
        return false;
      }

      applySelection([...current, id]);
      return true;
    },
    [
      allowsOnlineSelection,
      applySelection,
      ensureInstalledBeforeSelect,
      getDownloadItem,
      maxSelections,
      resources,
    ]
  );

  const commitOnlineSelection = React.useCallback(() => {
    if (!selectionTarget) return;
    const current = latestSelectionRef.current ?? [];
    if (current.length >= maxSelections || current.includes(selectionTarget.id)) {
      setSelectionTarget(null);
      return;
    }
    applySelection([...current, selectionTarget.id]);
    setSelectionTarget(null);
  }, [applySelection, maxSelections, selectionTarget]);

  const downloadAndSelect = React.useCallback(() => {
    if (!selectionTarget) return;
    const id = selectionTarget.id;
    setSelectionTarget(null);
    void downloadResource(id);
  }, [downloadResource, selectionTarget]);

  const handleReset = React.useCallback(() => {
    const next = config.getResetSelection(resources);
    if (next.length === 0) return;
    if (!allowsOnlineSelection) {
      const missingId = next.find((id) => getDownloadItem(id)?.status !== 'installed');
      if (
        missingId !== undefined &&
        !ensureInstalledBeforeSelect(resources.find((item) => item.id === missingId), missingId)
      ) {
        return;
      }
    }
    applySelection(next);
  }, [allowsOnlineSelection, applySelection, config, ensureInstalledBeforeSelect, getDownloadItem, resources]);

  const rows = React.useMemo<Row[]>(() => {
    const base: Row[] = [{ type: 'tabs' }];

    if (resourcesToRender.length === 0) {
      base.push({ type: 'empty', text: copy.emptyFilterText });
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
  }, [activeFilter, copy.emptyFilterText, resourcesToRender, sectionsToRender]);

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

  const handleReorderSelection = React.useCallback(
    (ids: number[]) => {
      applySelection(normalizeOrderedSelection(ids, maxSelections, availableIds));
    },
    [applySelection, availableIds, maxSelections]
  );

  const headerComponent = React.useMemo(
    () => (
      <ResourcePanelHeader
        searchTerm={searchTerm}
        onChangeSearchTerm={setSearchTerm}
        searchPlaceholder={copy.searchPlaceholder}
        orderedSelection={localOrderedSelection}
        resources={resources}
        onRemove={handleToggle}
        onReorder={handleReorderSelection}
        onReset={handleReset}
        onDragStateChange={setIsReordering}
        maxSelections={maxSelections}
        emptySelectionText={copy.emptySelectionText}
        removeAccessibilityLabel={copy.removeAccessibilityLabel}
      />
    ),
    [
      copy.emptySelectionText,
      copy.removeAccessibilityLabel,
      copy.searchPlaceholder,
      handleReorderSelection,
      handleReset,
      handleToggle,
      localOrderedSelection,
      maxSelections,
      resources,
      searchTerm,
    ]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: Row }): React.JSX.Element | null => {
      if (item.type === 'tabs') {
        return (
          <View
            className="py-2"
            style={[
              { backgroundColor: palette.background, zIndex: 10 },
              Platform.OS === 'android'
                ? { shadowColor: isDark ? '#FFFFFF' : '#000000', elevation: isDark ? 2 : 1 }
                : {
                    shadowColor: isDark ? '#FFFFFF' : '#000000',
                    shadowOpacity: isDark ? 0.08 : 0.06,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                  },
            ]}
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

      const resource = item.item;
    
      return (
        <ResourceRow
          resource={resource}
          downloadItem={getDownloadItem(resource.id)}
          isSelected={selectedIds.has(resource.id)}
          isBusy={busyIds.has(resource.id)}
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
      busyIds,
      getDownloadItem,
      handleCancelDownload,
      handlePressDelete,
      handlePressDownload,
      handleToggle,
      isDark,
      languages,
      palette.tint,
      palette.background,
      palette.muted,
      palette.text,
      selectedIds,
    ]
  );

  if (errorMessage && resources.length === 0) {
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

  if (isLoading && resources.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="text-sm" style={{ color: palette.muted }}>
          {copy.loadingText}
        </Text>
      </View>
    );
  }

  const downloadSizeLabel = formatDownloadSizeLabel(
    downloadTarget ? getDownloadSizeBytes(downloadTarget.id) : null
  );
  const selectionDownloadSizeLabel = formatDownloadSizeLabel(
    selectionTarget ? getDownloadSizeBytes(selectionTarget.id) : null
  );

  return (
    <View className="flex-1">
      <FlashList
        data={rows}
        keyExtractor={(row) => {
          if (row.type === 'tabs') return 'tabs';
          if (row.type === 'section') return `section:${row.language}`;
          if (row.type === 'empty') return 'empty';
          return `resource:${row.item.id}`;
        }}
        renderItem={renderItem}
        ListHeaderComponent={headerComponent}
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        drawDistance={Platform.OS === 'android' ? 200 : 250}
        getItemType={getRowType}
        overrideItemLayout={overrideRowLayout}
        overrideProps={{ initialDrawBatchSize: 4, scrollEventThrottle: 16 }}
        scrollEnabled={!isReordering}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <ResourceConfirmModal
        visible={downloadTarget !== null}
        title={copy.downloadTitle}
        resourceName={downloadTarget?.name ?? null}
        detailLabel={downloadSizeLabel}
        description={copy.downloadDescription}
        confirmLabel="Download"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDownload}
        onClose={() => setDownloadTarget(null)}
      />

      <ResourceConfirmModal
        visible={deleteTarget !== null}
        title="Delete download?"
        resourceName={deleteTarget?.name ?? null}
        description={copy.deleteDescription}
        confirmLabel="Delete"
        confirmTone="danger"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {allowsOnlineSelection ? (
        <ResourceConfirmModal
          visible={selectionTarget !== null}
          title={copy.notDownloadedTitle ?? ''}
          resourceName={selectionTarget?.name ?? null}
          detailLabel={selectionDownloadSizeLabel}
          description={copy.notDownloadedDescription ?? ''}
          confirmLabel="Download"
          showCancelAction={false}
          secondaryLabel="Continue online"
          mutedColor={palette.muted}
          onConfirm={downloadAndSelect}
          onSecondary={commitOnlineSelection}
          onClose={() => setSelectionTarget(null)}
        />
      ) : null}
    </View>
  );
}
