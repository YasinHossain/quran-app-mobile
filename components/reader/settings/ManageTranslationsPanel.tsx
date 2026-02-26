import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import Colors from '@/constants/Colors';
import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAppTheme } from '@/providers/ThemeContext';
import { DeleteTranslationUseCase } from '@/src/core/application/use-cases/DeleteTranslation';
import {
  DownloadTranslationUseCase,
  requestTranslationDownloadCancel,
} from '@/src/core/application/use-cases/DownloadTranslation';
import type { DownloadIndexItemWithKey, DownloadProgress } from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

import chaptersData from '../../../src/data/chapters.en.json';

import { ReorderableSelectionList } from './resource-panel/ReorderableSelectionList';
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeOrderedSelection(ids: number[]): number[] {
  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const raw of ids ?? []) {
    if (!Number.isFinite(raw)) continue;
    const id = Math.trunc(raw);
    if (id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function toProgressPercent(progress: DownloadProgress | undefined): number {
  if (!progress) return 0;
  if (progress.kind === 'percent') return clampPercent(progress.percent);
  if (progress.kind === 'items') {
    if (!Number.isFinite(progress.total) || progress.total <= 0) return 0;
    const rawPercent = clampPercent((progress.completed / progress.total) * 100);
    if (progress.completed > 0 && rawPercent < 12) return 12;
    return rawPercent;
  }
  return 0;
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

function CompactProgressRing({
  percent,
  tintColor,
  trackColor,
  crossColor,
}: {
  percent: number;
  tintColor: string;
  trackColor: string;
  crossColor: string;
}): React.JSX.Element {
  const size = 24;
  const strokeWidth = 3;
  const clampedPercent = clampPercent(percent);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  return (
    <View className="h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-interactive dark:border-border-dark/60 dark:bg-interactive-dark">
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tintColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>

      <View className="absolute inset-0 items-center justify-center">
        <MaterialCommunityIcons name="close" size={12} color={crossColor} />
      </View>
    </View>
  );
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
  const isFailed = status === 'failed';

  const canDownload = !isBusy && !isDownloading && !isDeleting && !isInstalled;
  const canDelete = !isBusy && !isDownloading && !isDeleting && isInstalled;
  const canCancel = isDownloading;

  const progressPercent = toProgressPercent(downloadItem?.progress);
  const destructiveColor = isSelected ? '#FFFFFF' : isDark ? '#F87171' : '#DC2626';
  const iconColor = isSelected ? '#FFFFFF' : tintColor;
  const trackColor = isSelected
    ? 'rgba(255,255,255,0.35)'
    : isDark
      ? 'rgba(20,184,166,0.35)'
      : 'rgba(13,148,136,0.35)';
  const progressColor = isSelected ? '#FFFFFF' : tintColor;
  const crossColor = isSelected ? '#FFFFFF' : tintColor;

  const actionIcon = isDeleting ? (
    <View
      className={[
        'h-8 w-8 items-center justify-center rounded-full border',
        isSelected ? 'border-white/30 bg-white/15' : 'border-error/40 bg-error/10',
      ].join(' ')}
    >
      <ActivityIndicator size="small" color={destructiveColor} />
    </View>
  ) : isDownloading ? (
    <CompactProgressRing
      percent={progressPercent}
      tintColor={progressColor}
      trackColor={trackColor}
      crossColor={crossColor}
    />
  ) : isInstalled ? (
    <View
      className={[
        'h-8 w-8 items-center justify-center rounded-full border',
        isSelected ? 'border-white/30 bg-white/15' : 'border-error/40 bg-error/10',
      ].join(' ')}
    >
      <MaterialCommunityIcons name="trash-can-outline" size={16} color={destructiveColor} />
    </View>
  ) : (
    <View
      className={[
        'h-8 w-8 items-center justify-center rounded-full border',
        isSelected
          ? 'border-white/30 bg-white/15'
          : 'border-border/60 bg-interactive dark:border-border-dark/60 dark:bg-interactive-dark',
      ].join(' ')}
    >
      <MaterialCommunityIcons
        name="download"
        size={16}
        color={isFailed ? destructiveColor : iconColor}
      />
    </View>
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

export function ManageTranslationsPanel({
  translations,
  orderedSelection,
  onChangeSelection,
  isLoading,
  errorMessage,
  onRefresh,
}: {
  translations: ResourceRecord[];
  orderedSelection: number[];
  onChangeSelection: (ids: number[]) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [busyTranslationIds, setBusyTranslationIds] = React.useState<Set<number>>(() => new Set());
  const [downloadTarget, setDownloadTarget] = React.useState<ResourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ResourceRecord | null>(null);
  const [sizeEstimatesMbById, setSizeEstimatesMbById] = React.useState<Record<number, number | null>>({});
  const [estimatingTranslationIds, setEstimatingTranslationIds] = React.useState<Set<number>>(
    () => new Set()
  );
  const [localOrderedSelection, setLocalOrderedSelection] = React.useState<number[]>(() =>
    normalizeOrderedSelection(orderedSelection ?? [])
  );
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
  const { itemsByKey, refresh: refreshIndex } = useDownloadIndexItems({
    enabled: true,
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
          logger
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

  const ensureEstimatedSize = React.useCallback(
    async (translationId: number): Promise<void> => {
      if (sizeEstimatesMbById[translationId] !== undefined) return;
      if (estimatingTranslationIds.has(translationId)) return;

      setEstimatingTranslationIds((prev) => {
        const next = new Set(prev);
        next.add(translationId);
        return next;
      });

      try {
        const estimatedMb = await estimateTranslationSizeMb(translationId);
        setSizeEstimatesMbById((prev) => ({ ...prev, [translationId]: estimatedMb }));
      } catch (error) {
        logger.warn(
          'Failed to estimate translation download size',
          { translationId },
          error as Error
        );
        setSizeEstimatesMbById((prev) => ({ ...prev, [translationId]: null }));
      } finally {
        setEstimatingTranslationIds((prev) => {
          const next = new Set(prev);
          next.delete(translationId);
          return next;
        });
      }
    },
    [estimatingTranslationIds, sizeEstimatesMbById]
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
      void ensureEstimatedSize(downloadTarget.id);
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
    };
  }, [downloadTarget, ensureEstimatedSize]);

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

  const languages = React.useMemo(
    () => buildLanguages(translations, translationLanguageSort),
    [translations]
  );

  React.useEffect(() => {
    if (languages.includes(activeFilter)) return;
    setActiveFilter('All');
  }, [activeFilter, languages]);

  const filteredTranslations = React.useMemo(
    () => filterResources(translations, searchTerm),
    [translations, searchTerm]
  );

  const groupedTranslations = React.useMemo(
    () => groupResources(filteredTranslations),
    [filteredTranslations]
  );

  const resourcesToRender = React.useMemo(() => {
    return activeFilter === 'All' ? filteredTranslations : groupedTranslations[activeFilter] ?? [];
  }, [activeFilter, filteredTranslations, groupedTranslations]);

  const sectionsToRender = React.useMemo(() => {
    const entries = Object.entries(groupedTranslations).sort(([a], [b]) => translationLanguageSort(a, b));
    return entries.map(([language, items]) => ({ language, items }));
  }, [groupedTranslations]);

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
          placeholder="Search translations or languages..."
        />

        <ReorderableSelectionList
          variant="translation"
          orderedSelection={localOrderedSelection}
          resources={translations}
          onRemove={(id) => handleToggle(id)}
          onReorder={(ids) => {
            const normalized = normalizeOrderedSelection(ids);
            setLocalOrderedSelection(normalized);
            scheduleSelectionCommit(normalized);
          }}
          onReset={handleReset}
          maxSelections={MAX_TRANSLATION_SELECTIONS}
          emptyText="No translations selected"
          removeAccessibilityLabel="Remove translation"
          onDragStateChange={setIsReordering}
        />
      </View>
    );
  }, [
    handleReset,
    handleToggle,
    localOrderedSelection,
    scheduleSelectionCommit,
    searchTerm,
    translations,
  ]);

  const renderItem = React.useCallback(
    ({ item }: { item: Row }): React.JSX.Element | null => {
      if (item.type === 'tabs') {
        return (
          <View className="py-2 border-b bg-background dark:bg-background-dark border-border dark:border-border-dark">
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

  const downloadEstimate = downloadTarget ? sizeEstimatesMbById[downloadTarget.id] : undefined;
  const isEstimatingDownloadSize =
    downloadTarget !== null &&
    (downloadEstimate === undefined || estimatingTranslationIds.has(downloadTarget.id));
  const downloadEstimateLabel = isEstimatingDownloadSize
    ? 'Estimating size...'
    : typeof downloadEstimate === 'number'
      ? `Estimated size: ~${downloadEstimate.toFixed(1)} MB`
      : 'Estimated size unavailable';

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
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        drawDistance={Platform.OS === 'android' ? 350 : 250}
        getItemType={getRowType}
        overrideItemLayout={overrideRowLayout}
        overrideProps={{ initialDrawBatchSize: 8 }}
        scrollEnabled={!isReordering}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <Modal
        transparent
        animationType="fade"
        visible={downloadTarget !== null}
        onRequestClose={() => setDownloadTarget(null)}
      >
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            onPress={() => setDownloadTarget(null)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
          </Pressable>

          <View
            style={{ width: '100%', maxWidth: 420 }}
            className="rounded-2xl border border-border/50 bg-surface px-5 py-5 dark:border-border-dark/40 dark:bg-surface-dark"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
                Download translation?
              </Text>
              <Pressable
                onPress={() => setDownloadTarget(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <MaterialCommunityIcons name="close" size={18} color={palette.muted} />
              </Pressable>
            </View>

            <View className="mt-4 rounded-xl border border-border/50 bg-interactive/60 px-4 py-3 dark:border-border-dark/40 dark:bg-interactive-dark/60">
              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                {downloadTarget?.name}
              </Text>
              <View className="mt-2 flex-row items-center gap-2">
                {isEstimatingDownloadSize ? (
                  <ActivityIndicator size="small" color={palette.tint} />
                ) : null}
                <Text className="text-xs text-muted dark:text-muted-dark">{downloadEstimateLabel}</Text>
              </View>
            </View>

            <Text className="mt-4 text-xs text-muted dark:text-muted-dark">
              This downloads the translation for offline reading.
            </Text>

            <View className="mt-5 flex-row items-center justify-end gap-3">
              <Pressable
                onPress={() => setDownloadTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="rounded-lg bg-interactive px-4 py-2 dark:bg-interactive-dark"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmDownload}
                accessibilityRole="button"
                accessibilityLabel="Download"
                className="rounded-lg bg-accent px-4 py-2"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-on-accent">Download</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={deleteTarget !== null}
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            onPress={() => setDeleteTarget(null)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
          </Pressable>

          <View
            style={{ width: '100%', maxWidth: 420 }}
            className="rounded-2xl border border-border/50 bg-surface px-5 py-5 dark:border-border-dark/40 dark:bg-surface-dark"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
                Delete download?
              </Text>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <MaterialCommunityIcons name="close" size={18} color={palette.muted} />
              </Pressable>
            </View>

            <Text className="mt-4 text-sm text-foreground dark:text-foreground-dark">
              {deleteTarget?.name}
            </Text>
            <Text className="mt-2 text-xs text-muted dark:text-muted-dark">
              This removes downloaded verses for offline use.
            </Text>

            <View className="mt-5 flex-row items-center justify-end gap-3">
              <Pressable
                onPress={() => setDeleteTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="rounded-lg bg-interactive px-4 py-2 dark:bg-interactive-dark"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmDelete}
                accessibilityRole="button"
                accessibilityLabel="Delete"
                className="rounded-lg bg-error px-4 py-2 dark:bg-error-dark"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-on-accent">Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
