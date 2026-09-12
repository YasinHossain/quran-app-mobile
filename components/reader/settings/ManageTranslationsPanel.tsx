import React from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { DeleteTranslationUseCase } from '@/src/core/application/use-cases/DeleteTranslation';
import {
  DownloadTranslationUseCase,
  requestTranslationDownloadCancel,
} from '@/src/core/application/use-cases/DownloadTranslation';
import type { DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { getBundledTranslationDownloadSizeBytes } from '@/src/core/infrastructure/offline-packs/bundledDownloadMetadata';

import { ReorderableSelectionList } from './resource-panel/ReorderableSelectionList';
import { ResourceConfirmModal } from './resource-panel/ResourceConfirmModal';
import { ResourceDownloadAction } from './resource-panel/ResourceDownloadAction';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceTabs } from './resource-panel/ResourceTabs';
import { buildLanguages, filterResources, groupResources, type ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TRANSLATION_SELECTIONS = 5;

const DEFAULT_SAHEEH_ID = 20;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const SELECTION_COMMIT_DEBOUNCE_MS = 48;

function isSaheehName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('saheeh international') || lower.includes('sahih international');
}

function findSaheehId(translations: ResourceRecord[]): number | undefined {
  return translations.find((t) => isSaheehName(t.name))?.id;
}

function translationLanguageSort(a: string, b: string): number {
  if (a === 'English') return -1;
  if (b === 'English') return 1;
  if (a === 'Bengali') return -1;
  if (b === 'Bengali') return 1;
  return a.localeCompare(b);
}

function normalizeOrderedSelection(
  ids: number[],
  options?: { validIds?: Set<number> }
): number[] {
  const validIds = options?.validIds;
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
    if (normalized.length >= MAX_TRANSLATION_SELECTIONS) break;
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

const TranslationResourceRow = React.memo(function TranslationResourceRow({
  translation,
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
  translation: ResourceRecord;
  downloadItem: DownloadIndexItemWithKey | undefined;
  isSelected: boolean;
  isBusy: boolean;
  isDark: boolean;
  tintColor: string;
  onToggle: (id: number) => void;
  onPressDownload: (translation: ResourceRecord) => void;
  onPressDelete: (translation: ResourceRecord) => void;
  onCancelDownload: (translationId: number) => void;
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
        if (canCancel) onCancelDownload(translation.id);
      }
    : isInstalled
      ? () => {
          if (canDelete) onPressDelete(translation);
        }
      : () => {
          if (canDownload) onPressDownload(translation);
        };

  const trailingLabel = isDownloading
    ? `Cancel ${translation.name} download`
    : isInstalled
      ? `Delete ${translation.name} offline download`
      : `Download ${translation.name} for offline use`;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
      <ResourceItem
        item={translation}
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

const TranslationPanelHeader = React.memo(function TranslationPanelHeader({
  searchTerm,
  onChangeSearchTerm,
  orderedSelection,
  translations,
  onRemove,
  onReorder,
  onReset,
  onDragStateChange,
}: {
  searchTerm: string;
  onChangeSearchTerm: (value: string) => void;
  orderedSelection: number[];
  translations: ResourceRecord[];
  onRemove: (id: number) => void;
  onReorder: (ids: number[]) => void;
  onReset: () => void;
  onDragStateChange: (dragging: boolean) => void;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  return (
    <View className="p-4 gap-4">
      <HeaderSearchInput
        value={searchTerm}
        onChangeText={onChangeSearchTerm}
        placeholder={t('manage_translations_search_placeholder', { fallback: 'Search translations or languages...' })}
      />

      <ReorderableSelectionList
        variant="translation"
        orderedSelection={orderedSelection}
        resources={translations}
        onRemove={onRemove}
        onReorder={onReorder}
        onReset={onReset}
        maxSelections={MAX_TRANSLATION_SELECTIONS}
        emptyText="No translations selected"
        removeAccessibilityLabel="Remove translation"
        onDragStateChange={onDragStateChange}
      />
    </View>
  );
});

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
  const { resolvedTheme, isDark } = useAppTheme();
  const { settings } = useSettings();
  const palette = Colors[resolvedTheme];
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [busyTranslationIds, setBusyTranslationIds] = React.useState<Set<number>>(() => new Set());
  const [downloadTarget, setDownloadTarget] = React.useState<ResourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ResourceRecord | null>(null);
  const [selectionTarget, setSelectionTarget] = React.useState<ResourceRecord | null>(null);
  const [localOrderedSelection, setLocalOrderedSelection] = React.useState<number[]>(() =>
    normalizeOrderedSelection(orderedSelection ?? [])
  );
  const hasPrunedSelectionRef = React.useRef(false);
  const latestSelectionRef = React.useRef(localOrderedSelection);
  const commitTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRevisionRef = React.useRef(0);
  const orderedSelectionRef = React.useRef(orderedSelection);

  React.useEffect(() => {
    orderedSelectionRef.current = orderedSelection;
    if (commitTimeoutRef.current !== null) return;

    const normalized = normalizeOrderedSelection(orderedSelection ?? []);
    if (areSelectionsEqual(normalized, latestSelectionRef.current)) return;

    latestSelectionRef.current = normalized;
    setLocalOrderedSelection(normalized);
  }, [orderedSelection]);

  React.useEffect(() => {
    latestSelectionRef.current = localOrderedSelection;
  }, [localOrderedSelection]);

  const selectedIds = React.useMemo(
    () => new Set<number>(localOrderedSelection ?? []),
    [localOrderedSelection]
  );
  const availableTranslationIds = React.useMemo(
    () => new Set<number>((translations ?? []).map((translation) => translation.id)),
    [translations]
  );
  const { itemsByKey, refresh: refreshIndex } = useDownloadIndexItems({
    enabled: isActive,
    pollIntervalMs: 800,
    pollWhileEnabled: busyTranslationIds.size > 0,
  });

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
    if (hasPrunedSelectionRef.current) return;
    if (translations.length === 0) return;
    hasPrunedSelectionRef.current = true;

    const normalized = normalizeOrderedSelection(latestSelectionRef.current, {
      validIds: availableTranslationIds,
    });

    if (areSelectionsEqual(normalized, latestSelectionRef.current)) return;

    setLocalOrderedSelection(normalized);
    latestSelectionRef.current = normalized;
    scheduleSelectionCommit(normalized);
  }, [availableTranslationIds, scheduleSelectionCommit, translations.length]);

  const setBusy = React.useCallback((translationId: number, busy: boolean) => {
    setBusyTranslationIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(translationId);
      else next.delete(translationId);
      return next;
    });
  }, []);

  const downloadTranslation = React.useCallback(
    async (translationId: number): Promise<boolean> => {
      if (busyTranslationIds.has(translationId)) return false;
      setBusy(translationId, true);

      try {
        const useCase = new DownloadTranslationUseCase(
          container.getDownloadIndexRepository(),
          container.getTranslationOfflineStore(),
          container.getTranslationDownloadRepository(),
          logger,
          container.getTranslationPackRepository()
        );

        await useCase.execute(translationId, settings.wordLang);

        const current = latestSelectionRef.current ?? [];
        if (
          !current.includes(translationId) &&
          current.length < MAX_TRANSLATION_SELECTIONS
        ) {
          const next = [...current, translationId];
          setLocalOrderedSelection(next);
          scheduleSelectionCommit(next);
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Download failed', message);
        logger.warn('Download translation failed', { translationId, message }, error as Error);
        return false;
      } finally {
        setBusy(translationId, false);
        refreshIndex();
      }
    },
    [busyTranslationIds, refreshIndex, scheduleSelectionCommit, setBusy, settings.wordLang]
  );

  const deleteTranslation = React.useCallback(
    async (translationId: number): Promise<void> => {
      if (busyTranslationIds.has(translationId)) return;
      setBusy(translationId, true);

      try {
        const useCase = new DeleteTranslationUseCase(
          container.getDownloadIndexRepository(),
          container.getTranslationOfflineStore(),
          logger
        );
        await useCase.execute(translationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Delete failed', message);
        logger.warn('Delete translation failed', { translationId, message }, error as Error);
      } finally {
        setBusy(translationId, false);
        refreshIndex();
      }
    },
    [busyTranslationIds, refreshIndex, setBusy]
  );

  const handlePressDownload = React.useCallback(
    (translation: ResourceRecord) => {
      if (busyTranslationIds.has(translation.id)) return;
      setDownloadTarget(translation);
    },
    [busyTranslationIds]
  );

  const handleConfirmDownload = React.useCallback(() => {
    if (!downloadTarget) return;
    const translationId = downloadTarget.id;
    setDownloadTarget(null);
    void downloadTranslation(translationId);
  }, [downloadTarget, downloadTranslation]);

  const handlePressDelete = React.useCallback((translation: ResourceRecord) => {
    setDeleteTarget(translation);
  }, []);

  const handleCancelDownload = React.useCallback((translationId: number) => {
    requestTranslationDownloadCancel(translationId);
  }, []);

  const handleConfirmDelete = React.useCallback(() => {
    if (!deleteTarget) return;
    const translationId = deleteTarget.id;
    setDeleteTarget(null);
    void deleteTranslation(translationId);
  }, [deleteTarget, deleteTranslation]);

  const allLanguages = React.useMemo(
    () => buildLanguages(translations, translationLanguageSort),
    [translations]
  );

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredTranslations = React.useMemo(
    () => filterResources(translations, searchTerm),
    [translations, searchTerm]
  );

  const languages = React.useMemo(() => {
    if (!normalizedSearchTerm) return allLanguages;
    const filteredLanguages = buildLanguages(filteredTranslations, translationLanguageSort);
    return filteredLanguages.length > 1 ? filteredLanguages : allLanguages;
  }, [allLanguages, filteredTranslations, normalizedSearchTerm]);

  React.useEffect(() => {
    if (languages.includes(activeFilter)) return;
    setActiveFilter('All');
  }, [activeFilter, languages]);

  const groupedTranslations = React.useMemo(
    () => groupResources(filteredTranslations),
    [filteredTranslations]
  );

  const resourcesToRender = React.useMemo(() => {
    return activeFilter === 'All' ? filteredTranslations : groupedTranslations[activeFilter] ?? [];
  }, [activeFilter, filteredTranslations, groupedTranslations]);

  const sectionsToRender = React.useMemo(() => {
    const languageOrder = new Map(languages.map((language, index) => [language, index]));
    const entries = Object.entries(groupedTranslations).sort(([a], [b]) => {
      const orderA = languageOrder.get(a) ?? Number.POSITIVE_INFINITY;
      const orderB = languageOrder.get(b) ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return translationLanguageSort(a, b);
    });

    return entries.map(([language, items]) => ({ language, items }));
  }, [groupedTranslations, languages]);

  const handleToggle = React.useCallback(
    (id: number): boolean => {
      const current = latestSelectionRef.current ?? [];
      if (current.includes(id)) {
        const next = current.filter((x) => x !== id);
        setLocalOrderedSelection(next);
        scheduleSelectionCommit(next);
        return true;
      }

      if (current.length >= MAX_TRANSLATION_SELECTIONS) return false;

      const downloadItem = itemsByKey.get(getDownloadKey({ kind: 'translation', translationId: id }));
      if (downloadItem?.status !== 'installed') {
        const translation = translations.find((item) => item.id === id);
        if (translation) setSelectionTarget(translation);
        return false;
      }

      const next = [...current, id];
      setLocalOrderedSelection(next);
      scheduleSelectionCommit(next);
      return true;
    },
    [itemsByKey, scheduleSelectionCommit, translations]
  );

  const commitOnlineSelection = React.useCallback(() => {
    if (!selectionTarget) return;
    const current = latestSelectionRef.current ?? [];
    if (current.length >= MAX_TRANSLATION_SELECTIONS || current.includes(selectionTarget.id)) {
      setSelectionTarget(null);
      return;
    }
    const next = [...current, selectionTarget.id];
    setLocalOrderedSelection(next);
    scheduleSelectionCommit(next);
    setSelectionTarget(null);
  }, [scheduleSelectionCommit, selectionTarget]);

  const downloadAndSelect = React.useCallback(() => {
    if (!selectionTarget) return;
    const translationId = selectionTarget.id;
    setSelectionTarget(null);
    void downloadTranslation(translationId);
  }, [downloadTranslation, selectionTarget]);

  const handleReset = React.useCallback(() => {
    const sahihId = findSaheehId(translations);
    const next = sahihId !== undefined ? [sahihId] : [DEFAULT_SAHEEH_ID];
    setLocalOrderedSelection(next);
    scheduleSelectionCommit(next);
  }, [scheduleSelectionCommit, translations]);

  const rows = React.useMemo<Row[]>(() => {
    const base: Row[] = [{ type: 'tabs' }];

    if (resourcesToRender.length === 0) {
      base.push({ type: 'empty', text: 'No translation resources found for the selected filter.' });
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
  }, [activeFilter, resourcesToRender, sectionsToRender]);

  const handleReorderSelection = React.useCallback(
    (ids: number[]) => {
      const normalized = normalizeOrderedSelection(ids, { validIds: availableTranslationIds });
      setLocalOrderedSelection(normalized);
      scheduleSelectionCommit(normalized);
    },
    [availableTranslationIds, scheduleSelectionCommit]
  );

  const headerComponent = React.useMemo(
    () => (
      <TranslationPanelHeader
        searchTerm={searchTerm}
        onChangeSearchTerm={setSearchTerm}
        orderedSelection={localOrderedSelection}
        translations={translations}
        onRemove={handleToggle}
        onReorder={handleReorderSelection}
        onReset={handleReset}
        onDragStateChange={setIsReordering}
      />
    ),
    [
      handleReorderSelection,
      handleReset,
      handleToggle,
      localOrderedSelection,
      searchTerm,
      translations,
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

      const translation = item.item;
      const key = getDownloadKey({ kind: 'translation', translationId: translation.id });
      const downloadItem = itemsByKey.get(key);

      return (
        <TranslationResourceRow
          translation={translation}
          downloadItem={downloadItem}
          isSelected={selectedIds.has(translation.id)}
          isBusy={busyTranslationIds.has(translation.id)}
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
      busyTranslationIds,
      handleCancelDownload,
      handlePressDelete,
      handlePressDownload,
      handleToggle,
      isDark,
      itemsByKey,
      languages,
      palette.tint,
      palette.background,
      palette.muted,
      palette.text,
      selectedIds,
    ]
  );

  if (errorMessage && translations.length === 0) {
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

  if (isLoading && translations.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="text-sm" style={{ color: palette.muted }}>
          Loading translations...
        </Text>
      </View>
    );
  }

  const downloadSizeLabel = formatDownloadSizeLabel(
    downloadTarget ? getBundledTranslationDownloadSizeBytes(downloadTarget.id) : null
  );
  const selectionDownloadSizeLabel = formatDownloadSizeLabel(
    selectionTarget ? getBundledTranslationDownloadSizeBytes(selectionTarget.id) : null
  );

  return (
    <View className="flex-1">
      <FlatList
        data={rows}
        keyExtractor={(row) => {
          if (row.type === 'tabs') return 'tabs';
          if (row.type === 'section') return `section:${row.language}`;
          if (row.type === 'empty') return 'empty';
          return `resource:${row.item.id}`;
        }}
        renderItem={renderItem}
        ListHeaderComponent={headerComponent}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        scrollEnabled={!isReordering}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <ResourceConfirmModal
        visible={downloadTarget !== null}
        title="Download translation?"
        resourceName={downloadTarget?.name ?? null}
        detailLabel={downloadSizeLabel}
        description="This downloads the translation for offline reading."
        confirmLabel="Download"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDownload}
        onClose={() => setDownloadTarget(null)}
      />

      <ResourceConfirmModal
        visible={deleteTarget !== null}
        title="Delete download?"
        resourceName={deleteTarget?.name ?? null}
        description="This removes downloaded verses for offline use."
        confirmLabel="Delete"
        confirmTone="danger"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ResourceConfirmModal
        visible={selectionTarget !== null}
        title="Translation not downloaded"
        resourceName={selectionTarget?.name ?? null}
        detailLabel={selectionDownloadSizeLabel}
        description="Download it for offline reading, or continue online for in-app reading only. The Verse Spotlight widget cannot use online-only translations."
        confirmLabel="Download"
        showCancelAction={false}
        secondaryLabel="Continue online"
        mutedColor={palette.muted}
        onConfirm={downloadAndSelect}
        onSecondary={commitOnlineSelection}
        onClose={() => setSelectionTarget(null)}
      />
    </View>
  );
}
