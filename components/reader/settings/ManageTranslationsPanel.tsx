import React from 'react';
import {
  Alert,
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAppTheme } from '@/providers/ThemeContext';
import { DeleteTranslationUseCase } from '@/src/core/application/use-cases/DeleteTranslation';
import {
  DownloadTranslationUseCase,
  requestTranslationDownloadCancel,
} from '@/src/core/application/use-cases/DownloadTranslation';
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

export const MAX_TRANSLATION_SELECTIONS = 5;

const DEFAULT_SAHEEH_ID = 20;
const ESTIMATE_SAMPLE_CHAPTERS = [1, 2, 18, 36, 55, 78] as const;
const ESTIMATE_SAMPLE_PER_PAGE = 50;
const ESTIMATE_STORAGE_OVERHEAD_MULTIPLIER = 1.35;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const FALLBACK_TOTAL_VERSE_COUNT = 6236;
const SELECTION_COMMIT_DEBOUNCE_MS = Platform.OS === 'android' ? 220 : 120;

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

type ApiEstimateVerse = {
  translations?: Array<{ resource_id?: number; text?: string }>;
};

type ApiEstimateResponse = {
  verses?: ApiEstimateVerse[];
};

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

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
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

async function estimateTranslationSizeMb(translationId: number): Promise<number> {
  const sampleResponses = await Promise.all(
    ESTIMATE_SAMPLE_CHAPTERS.map((chapterNumber) =>
      apiFetch<ApiEstimateResponse>(
        `/verses/by_chapter/${chapterNumber}`,
        {
          language: 'en',
          words: 'false',
          translations: String(translationId),
          per_page: String(ESTIMATE_SAMPLE_PER_PAGE),
          page: '1',
        },
        'Failed to estimate translation size'
      )
    )
  );

  let sampleByteCount = 0;
  let sampleVerseCount = 0;

  for (const response of sampleResponses) {
    for (const verse of response.verses ?? []) {
      const firstTranslation = verse.translations?.[0];
      const text = stripHtml(String(firstTranslation?.text ?? ''));
      if (!text) continue;

      sampleByteCount += utf8ByteLength(text);
      sampleVerseCount += 1;
    }
  }

  if (sampleVerseCount <= 0) {
    throw new Error('No sample verses available for size estimation');
  }

  const averageBytesPerVerse = sampleByteCount / sampleVerseCount;
  const estimatedStoredBytes =
    averageBytesPerVerse * TOTAL_VERSE_COUNT * ESTIMATE_STORAGE_OVERHEAD_MULTIPLIER;
  const estimatedMb = estimatedStoredBytes / BYTES_PER_MEGABYTE;

  return Math.max(0.1, Math.round(estimatedMb * 10) / 10);
}

async function resolveTranslationDownloadSizeInfo(translationId: number): Promise<DownloadSizeInfo> {
  const packAvailability = await container.getTranslationPackRepository().getPackAvailability(translationId);
  if (packAvailability && packAvailability.sizeBytes > 0) {
    const mb = Math.max(0.1, Math.round((packAvailability.sizeBytes / BYTES_PER_MEGABYTE) * 10) / 10);
    return { mb, isExact: true };
  }

  const estimatedMb = await estimateTranslationSizeMb(translationId);
  return {
    mb: estimatedMb,
    isExact: false,
  };
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
  const status = downloadItem?.status;
  const isDownloading = status === 'queued' || status === 'downloading';
  const isDeleting = status === 'deleting';
  const isInstalled = status === 'installed';

  const canDownload = !isBusy && !isDownloading && !isDeleting && !isInstalled;
  const canDelete = !isBusy && !isDownloading && !isDeleting && isInstalled;
  const canCancel = isDownloading;
  const actionIcon = (
    <ResourceDownloadAction
      status={status}
      progress={downloadItem?.progress}
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
    <View className="px-4 py-1">
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
  return (
    <View className="p-4 gap-4">
      <HeaderSearchInput
        value={searchTerm}
        onChangeText={onChangeSearchTerm}
        placeholder="Search translations or languages..."
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
  const palette = Colors[resolvedTheme];
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [busyTranslationIds, setBusyTranslationIds] = React.useState<Set<number>>(() => new Set());
  const [downloadTarget, setDownloadTarget] = React.useState<ResourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ResourceRecord | null>(null);
  const [downloadSizeInfoById, setDownloadSizeInfoById] = React.useState<
    Record<number, DownloadSizeInfo | null | undefined>
  >({});
  const [estimatingTranslationIds, setEstimatingTranslationIds] = React.useState<Set<number>>(
    () => new Set()
  );
  const [localOrderedSelection, setLocalOrderedSelection] = React.useState<number[]>(() =>
    normalizeOrderedSelection(orderedSelection ?? [])
  );
  const hasPrunedSelectionRef = React.useRef(false);
  const latestSelectionRef = React.useRef(localOrderedSelection);
  const commitTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRevisionRef = React.useRef(0);

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

        InteractionManager.runAfterInteractions(() => {
          if (scheduledRevision !== commitRevisionRef.current) return;
          if (typeof React.startTransition === 'function') {
            React.startTransition(() => {
              onChangeSelection(idsToCommit);
            });
            return;
          }

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
      onChangeSelection([...latestSelectionRef.current]);
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
    async (translationId: number): Promise<void> => {
      if (busyTranslationIds.has(translationId)) return;
      setBusy(translationId, true);

      try {
        const useCase = new DownloadTranslationUseCase(
          container.getDownloadIndexRepository(),
          container.getTranslationOfflineStore(),
          container.getTranslationDownloadRepository(),
          logger,
          container.getTranslationPackRepository()
        );

        await useCase.execute(translationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Download failed', message);
        logger.warn('Download translation failed', { translationId, message }, error as Error);
      } finally {
        setBusy(translationId, false);
        refreshIndex();
      }
    },
    [busyTranslationIds, refreshIndex, setBusy]
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

  const ensureDownloadSizeInfo = React.useCallback(
    async (translationId: number): Promise<void> => {
      if (downloadSizeInfoById[translationId] !== undefined) return;
      if (estimatingTranslationIds.has(translationId)) return;

      setEstimatingTranslationIds((prev) => {
        const next = new Set(prev);
        next.add(translationId);
        return next;
      });

      try {
        const sizeInfo = await resolveTranslationDownloadSizeInfo(translationId);
        setDownloadSizeInfoById((prev) => ({ ...prev, [translationId]: sizeInfo }));
      } catch (error) {
        logger.warn(
          'Failed to resolve translation download size',
          { translationId },
          error as Error
        );
        setDownloadSizeInfoById((prev) => ({ ...prev, [translationId]: null }));
      } finally {
        setEstimatingTranslationIds((prev) => {
          const next = new Set(prev);
          next.delete(translationId);
          return next;
        });
      }
    },
    [downloadSizeInfoById, estimatingTranslationIds]
  );

  const handlePressDownload = React.useCallback(
    (translation: ResourceRecord) => {
      if (busyTranslationIds.has(translation.id)) return;
      setDownloadTarget(translation);
    },
    [busyTranslationIds]
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

      const next = [...current, id];
      setLocalOrderedSelection(next);
      scheduleSelectionCommit(next);
      return true;
    },
    [scheduleSelectionCommit]
  );

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
            className="py-2 border-b bg-background dark:bg-background-dark border-border dark:border-border-dark"
            style={{ zIndex: 10, elevation: 8 }}
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
            className="self-start rounded-lg bg-interactive dark:bg-interactive-dark border border-border dark:border-border-dark px-4 py-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (isLoading && translations.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="text-sm text-muted dark:text-muted-dark">Loading translations...</Text>
      </View>
    );
  }

  const downloadSizeInfo = downloadTarget ? downloadSizeInfoById[downloadTarget.id] : undefined;
  const isEstimatingDownloadSize =
    downloadTarget !== null &&
    (downloadSizeInfo === undefined || estimatingTranslationIds.has(downloadTarget.id));
  const downloadEstimateLabel = isEstimatingDownloadSize
    ? 'Estimating size...'
    : downloadSizeInfo && typeof downloadSizeInfo.mb === 'number'
      ? downloadSizeInfo.isExact
        ? `Download size: ${downloadSizeInfo.mb.toFixed(1)} MB`
        : `Estimated size: ~${downloadSizeInfo.mb.toFixed(1)} MB`
      : 'Download size unavailable';

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
        removeClippedSubviews={Platform.OS === 'android'}
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
        detailLabel={downloadEstimateLabel}
        isDetailLoading={isEstimatingDownloadSize}
        description="This downloads the translation for offline reading."
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
        description="This removes downloaded verses for offline use."
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
