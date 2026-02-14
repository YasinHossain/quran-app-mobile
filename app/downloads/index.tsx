import { useIsFocused } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useSettings } from '@/providers/SettingsContext';
import { DownloadTranslationUseCase } from '@/src/core/application/use-cases/DownloadTranslation';
import { DeleteTranslationUseCase } from '@/src/core/application/use-cases/DeleteTranslation';
import type { DownloadIndexItemWithKey, DownloadProgress } from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { useAppTheme } from '@/providers/ThemeContext';

function formatProgress(progress: DownloadProgress | undefined): string {
  if (!progress) return '';
  if (progress.kind === 'percent') return `${Math.round(progress.percent)}%`;
  if (progress.kind === 'items') return `${progress.completed}/${progress.total} surahs`;
  return '';
}

function getStatusLabel(item: DownloadIndexItemWithKey | undefined): string {
  if (!item) return 'Not installed';

  const progressLabel = formatProgress(item.progress);
  const suffix = progressLabel ? ` · ${progressLabel}` : '';

  switch (item.status) {
    case 'queued':
      return `Queued${suffix}`;
    case 'downloading':
      return `Downloading${suffix}`;
    case 'installed':
      return 'Installed';
    case 'failed':
      return `Failed${suffix}`;
    case 'deleting':
      return 'Deleting';
    default:
      return item.status;
  }
}

export default function DownloadsScreen(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const isFocused = useIsFocused();

  const { translations, isLoading: isTranslationsLoading, errorMessage: translationsError, refresh: refreshTranslations } =
    useTranslationResources({
      enabled: isFocused,
      language: settings.contentLanguage,
    });

  const { itemsByKey, isLoading: isIndexLoading, errorMessage: indexError, refresh: refreshIndex } =
    useDownloadIndexItems({
      enabled: isFocused,
      pollIntervalMs: 800,
    });

  const [busyTranslationIds, setBusyTranslationIds] = React.useState<Set<number>>(() => new Set());

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
      } finally {
        setBusy(translationId, false);
        refreshIndex();
      }
    },
    [busyTranslationIds, refreshIndex, setBusy]
  );

  const handlePressDelete = React.useCallback(
    (translationId: number) => {
      Alert.alert(
        'Delete translation?',
        'This removes downloaded verses for offline use.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => void deleteTranslation(translationId),
          },
        ],
        { cancelable: true }
      );
    },
    [deleteTranslation]
  );

  const onRefresh = React.useCallback(() => {
    refreshTranslations();
    refreshIndex();
  }, [refreshIndex, refreshTranslations]);

  const errorMessage = translationsError ?? indexError;
  const isLoading = isTranslationsLoading || isIndexLoading;

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen options={{ title: 'Downloads' }} />

      <View className="px-4 pt-4 pb-2">
        <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
          Translations
        </Text>
        <Text className="mt-1 text-sm text-muted dark:text-muted-dark">
          Download translations for offline reading.
        </Text>

        {errorMessage ? (
          <View className="mt-3 rounded-xl border border-error/20 bg-error/10 px-4 py-3">
            <Text className="text-sm font-semibold text-error dark:text-error-dark">
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={translations}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        refreshing={isLoading}
        onRefresh={onRefresh}
        renderItem={({ item }) => {
          const key = getDownloadKey({ kind: 'translation', translationId: item.id });
          const downloadItem = itemsByKey.get(key);
          const statusLabel = getStatusLabel(downloadItem);

          const isBusy = busyTranslationIds.has(item.id);
          const status = downloadItem?.status;
          const isDownloading = status === 'queued' || status === 'downloading';
          const isDeleting = status === 'deleting';
          const isInstalled = status === 'installed';
          const isFailed = status === 'failed';

          const canDownload = !isBusy && !isDownloading && !isDeleting && !isInstalled;
          const canDelete = !isBusy && !isDownloading && !isDeleting && (isInstalled || isFailed);

          return (
            <View
              className={[
                'rounded-2xl border px-4 py-4',
                'border-border/50 dark:border-border-dark/40',
                'bg-surface dark:bg-surface-dark',
              ].join(' ')}
            >
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                    {item.name}
                  </Text>
                  <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                    {item.authorName ? `${item.authorName} · ${item.languageName || 'Unknown'}` : item.languageName || 'Unknown'}
                  </Text>

                  <View className="mt-2 flex-row items-center gap-2">
                    {(isDownloading || isDeleting) && (
                      <ActivityIndicator size="small" color={palette.tint} />
                    )}
                    <Text className="text-xs font-semibold text-muted dark:text-muted-dark">
                      {statusLabel}
                    </Text>
                  </View>

                  {downloadItem?.error ? (
                    <Text className="mt-2 text-xs text-error dark:text-error-dark">
                      {downloadItem.error}
                    </Text>
                  ) : null}
                </View>

                <View className="items-end gap-2">
                  {isDeleting ? (
                    <View className="px-4 py-2 rounded-lg bg-error/20 border border-error/20">
                      <Text className="text-xs font-semibold text-error dark:text-error-dark">
                        Deleting…
                      </Text>
                    </View>
                  ) : isDownloading ? (
                    <View className="px-4 py-2 rounded-lg bg-accent/10 border border-accent/20">
                      <Text className="text-xs font-semibold text-accent dark:text-accent-dark">
                        Downloading…
                      </Text>
                    </View>
                  ) : isInstalled ? (
                    <Pressable
                      onPress={() => handlePressDelete(item.id)}
                      disabled={!canDelete}
                      accessibilityRole="button"
                      accessibilityLabel="Delete"
                      className={[
                        'px-4 py-2 rounded-lg bg-error dark:bg-error-dark',
                        canDelete ? '' : 'opacity-40',
                      ].join(' ')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Text className="text-xs font-semibold text-on-accent">Delete</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => void downloadTranslation(item.id)}
                      disabled={!canDownload}
                      accessibilityRole="button"
                      accessibilityLabel={isFailed ? 'Retry download' : 'Download'}
                      className={[
                        'px-4 py-2 rounded-lg bg-accent',
                        canDownload ? '' : 'opacity-40',
                      ].join(' ')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Text className="text-xs font-semibold text-on-accent">
                        {isFailed ? 'Retry' : 'Download'}
                      </Text>
                    </Pressable>
                  )}

                  {isFailed && canDelete ? (
                    <Pressable
                      onPress={() => handlePressDelete(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete"
                      className="px-4 py-2 rounded-lg bg-error dark:bg-error-dark"
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Text className="text-xs font-semibold text-on-accent">Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center justify-center py-12">
              <ActivityIndicator size="large" color={palette.tint} />
            </View>
          ) : (
            <View className="items-center justify-center py-12">
              <Text className="text-sm text-muted dark:text-muted-dark">
                No translations found.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
