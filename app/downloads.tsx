import React from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  BookOpen,
  BookOpenText,
  Languages,
  Volume2,
  Book,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ResourceConfirmModal } from '@/components/reader/settings/resource-panel/ResourceConfirmModal';

import Colors from '@/constants/Colors';
import { AppHeader } from '@/components/navigation/AppHeader';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import { ResourceDownloadAction } from '@/components/reader/settings/resource-panel/ResourceDownloadAction';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useReciters } from '@/hooks/audio/useReciters';
import { useChapters } from '@/hooks/useChapters';
import { clearOfflineSurahPageCache } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { findMushafOption } from '@/data/mushaf/options';

import { DeleteTranslationUseCase } from '@/src/core/application/use-cases/DeleteTranslation';
import { DeleteTafsirUseCase } from '@/src/core/application/use-cases/DeleteTafsir';
import { DeleteWordTranslationUseCase } from '@/src/core/application/use-cases/DeleteWordTranslation';
import { requestTranslationDownloadCancel } from '@/src/core/application/use-cases/DownloadTranslation';
import { requestTafsirDownloadCancel } from '@/src/core/application/use-cases/DownloadFullTafsir';
import { requestWordDownloadCancel } from '@/src/core/application/use-cases/DownloadWordTranslation';

import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import type { DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';

const WORD_LANGUAGES_MAP: Record<string, string> = {
  en: 'English',
  bn: 'Bengali',
  ur: 'Urdu',
  hi: 'Hindi',
  ar: 'Arabic',
};

const CATEGORY_ICONS: Record<
  DisplayDownloadItem['category'],
  React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>
> = {
  Translations: BookOpen,
  Tafsirs: BookOpenText,
  'Word-by-Word': Languages,
  Audio: Volume2,
  'Mushaf Packs': Book,
  Other: Download,
};

interface DisplayDownloadItem {
  key: string;
  item: DownloadIndexItemWithKey;
  title: string;
  subtitle: string;
  category: 'Translations' | 'Tafsirs' | 'Word-by-Word' | 'Audio' | 'Mushaf Packs' | 'Other';
}

export default function DownloadsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const { t } = useUiTranslation();

  const [deletingKeys, setDeletingKeys] = React.useState<Set<string>>(() => new Set());
  const [collapsedCategories, setCollapsedCategories] = React.useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = React.useState<DisplayDownloadItem | null>(null);

  const toggleCategory = React.useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // 1. Fetch Downloaded index items
  const { items, isLoading: isIndexLoading, refresh } = useDownloadIndexItems({
    enabled: true,
    pollIntervalMs: 1000,
  });

  // 2. Metadata: Translations
  const { translationsById, isLoading: isTranslationsLoading } = useTranslationResources({
    enabled: true,
    language: settings.contentLanguage,
  });

  // 3. Metadata: Tafsirs
  const { tafsirById, isLoading: isTafsirsLoading } = useTafsirResources({
    enabled: true,
  });

  // 4. Metadata: Reciters
  const { reciters, isLoading: isRecitersLoading } = useReciters();
  const reciterNameById = React.useMemo(() => {
    const lookup = new Map<number, string>();
    for (const r of reciters) {
      if (r.id) lookup.set(r.id, r.name);
    }
    return lookup;
  }, [reciters]);

  // 5. Metadata: Chapters (Surahs)
  const { chapters, isLoading: isChaptersLoading } = useChapters();
  const surahNameById = React.useMemo(() => {
    const lookup = new Map<number, string>();
    for (const ch of chapters) {
      lookup.set(ch.id, ch.name_simple);
    }
    return lookup;
  }, [chapters]);

  const isLoadingMetadata =
    isTranslationsLoading || isTafsirsLoading || isRecitersLoading || isChaptersLoading;

  // Map download index items to render-friendly items
  const mappedItems = React.useMemo<DisplayDownloadItem[]>(() => {
    return items.map((item) => {
      let title = '';
      let subtitle = '';
      let category: DisplayDownloadItem['category'] = 'Other';

      switch (item.content.kind) {
        case 'translation': {
          category = 'Translations';
          const res = translationsById.get(item.content.translationId);
          title = res?.name ?? `Translation #${item.content.translationId}`;
          subtitle = '';
          break;
        }
        case 'tafsir': {
          category = 'Tafsirs';
          const res = tafsirById.get(item.content.tafsirId);
          title = res?.displayName ?? `Tafsir #${item.content.tafsirId}`;
          subtitle = '';
          break;
        }
        case 'word-translation': {
          category = 'Word-by-Word';
          const lang = WORD_LANGUAGES_MAP[item.content.languageCode] ?? item.content.languageCode;
          title = t('lang_' + item.content.languageCode, { fallback: lang });
          subtitle = '';
          break;
        }
        case 'words': {
          category = 'Word-by-Word';
          const surahName = surahNameById.get(item.content.surahId) ?? `Surah ${item.content.surahId}`;
          title = `Arabic Word Data - ${surahName}`;
          subtitle = '';
          break;
        }
        case 'audio': {
          category = 'Audio';
          const rName = reciterNameById.get(item.content.reciterId) ?? `Reciter #${item.content.reciterId}`;
          const surahName = surahNameById.get(item.content.surahId) ?? `Surah ${item.content.surahId}`;
          title = rName;
          subtitle = `Audio recitation • ${surahName}`;
          break;
        }
        case 'mushaf-pack': {
          category = 'Mushaf Packs';
          const option = findMushafOption(item.content.packId);
          title = option?.name ?? `Mushaf Pack: ${item.content.packId}`;
          subtitle = '';
          break;
        }
        default:
          title = 'Unknown Offline Resource';
          subtitle = 'Offline Data';
          break;
      }

      return {
        key: item.key,
        item,
        title,
        subtitle,
        category,
      };
    });
  }, [items, translationsById, tafsirById, reciterNameById, surahNameById, t]);

  // Group items by category
  const sections = React.useMemo(() => {
    const groups: Record<DisplayDownloadItem['category'], DisplayDownloadItem[]> = {
      Translations: [],
      Tafsirs: [],
      'Word-by-Word': [],
      Audio: [],
      'Mushaf Packs': [],
      Other: [],
    };

    for (const d of mappedItems) {
      groups[d.category].push(d);
    }

    return Object.entries(groups)
      .filter(([_, data]) => data.length > 0)
      .map(([title, data]) => ({
        title: title as DisplayDownloadItem['category'],
        totalCount: data.length,
        data: collapsedCategories.has(title) ? [] : data,
      }));
  }, [mappedItems, collapsedCategories]);

  const performDelete = async (displayItem: DisplayDownloadItem) => {
    const { item } = displayItem;
    setDeletingKeys((prev) => new Set([...prev, item.key]));

    try {
      switch (item.content.kind) {
        case 'translation': {
          const useCase = new DeleteTranslationUseCase(
            container.getDownloadIndexRepository(),
            container.getTranslationOfflineStore(),
            logger
          );
          await useCase.execute(item.content.translationId);
          break;
        }
        case 'tafsir': {
          const useCase = new DeleteTafsirUseCase(
            container.getDownloadIndexRepository(),
            container.getTafsirOfflineStore(),
            logger
          );
          await useCase.execute(item.content.tafsirId);
          break;
        }
        case 'word-translation': {
          const useCase = new DeleteWordTranslationUseCase(
            container.getDownloadIndexRepository(),
            container.getTranslationOfflineStore(),
            logger
          );
          await useCase.execute(item.content.languageCode);
          clearOfflineSurahPageCache();
          break;
        }
        case 'audio': {
          const manager = container.getAudioDownloadManager();
          await manager.deleteSurahAudio({
            reciterId: item.content.reciterId,
            surahId: item.content.surahId,
          });
          break;
        }
        case 'mushaf-pack': {
          await container
            .getMushafPackInstaller()
            .deleteInstalledVersionAsync(item.content.packId, item.content.version);
          break;
        }
        default: {
          await container.getDownloadIndexRepository().remove(item.content);
          break;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert('Delete Failed', msg);
    } finally {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(item.key);
        return next;
      });
      refresh();
    }
  };

  const handleDeleteItem = (displayItem: DisplayDownloadItem) => {
    const { item } = displayItem;

    if (item.status === 'failed') {
      void container.getDownloadIndexRepository().remove(item.content);
      return;
    }

    if (item.status === 'queued' || item.status === 'downloading') {
      if (item.content.kind === 'translation') {
        requestTranslationDownloadCancel(item.content.translationId);
      } else if (item.content.kind === 'tafsir' && !('scope' in item.content)) {
        requestTafsirDownloadCancel(item.content.tafsirId);
      } else if (item.content.kind === 'word-translation') {
        requestWordDownloadCancel(item.content.languageCode);
      } else if (item.content.kind === 'audio') {
        void container.getAudioDownloadManager().cancelSurahAudioDownload({
          reciterId: item.content.reciterId,
          surahId: item.content.surahId,
        });
      } else if (item.content.kind === 'mushaf-pack') {
        void container
          .getMushafPackInstaller()
          .cancelDownloadablePackInstallAsync(item.content.packId, item.content.version);
      } else {
        void container.getDownloadIndexRepository().remove(item.content);
      }
      return;
    }

    setDeleteTarget(displayItem);
  };

  const getCategoryTranslation = (cat: DisplayDownloadItem['category']) => {
    switch (cat) {
      case 'Translations':
        return t('translations');
      case 'Tafsirs':
        return t('downloads_category_tafsirs', { fallback: 'Tafsirs' });
      case 'Word-by-Word':
        return t('downloads_category_word_by_word', { fallback: 'Word-by-Word' });
      case 'Audio':
        return t('downloads_category_audio', { fallback: 'Audio' });
      case 'Mushaf Packs':
        return t('downloads_category_mushaf_packs', { fallback: 'Mushaf Packs' });
      case 'Other':
        return t('downloads_category_other', { fallback: 'Other' });
      default:
        return cat;
    }
  };

  const renderDownloadItem = ({ item: dItem }: { item: DisplayDownloadItem }) => {
    const status = dItem.item.status;
    const progress = dItem.item.progress;
    const error = dItem.item.error;
    const isDeleting = status === 'deleting' || deletingKeys.has(dItem.key);

    let statusText = '';
    let isProgress = false;
    let percent = 0;

    if (status === 'queued') {
      statusText = t('downloads_status_queued', { fallback: 'Queued…' });
    } else if (status === 'downloading') {
      statusText = t('downloads_status_downloading', { fallback: 'Downloading…' });
      if (progress?.kind === 'percent') {
        isProgress = true;
        percent = progress.percent;
      }
    } else if (status === 'failed') {
      statusText = t('downloads_status_failed', { fallback: 'Failed' });
    } else if (isDeleting) {
      statusText = t('downloads_status_deleting', { fallback: 'Deleting…' });
    }

    const actionStatus = isDeleting ? 'deleting' : status === 'failed' ? 'installed' : status;

    return (
      <View
        className="flex-row items-center justify-between border border-border/30 dark:border-border-dark/20 bg-surface dark:bg-surface-dark px-4 py-2.5 rounded-lg mb-2"
      >
        <View className="flex-1 mr-4">
          <Text className="text-base font-semibold text-foreground dark:text-foreground-dark" numberOfLines={1}>
            {dItem.title}
          </Text>
          {dItem.subtitle ? (
            <Text className="text-xs text-muted dark:text-muted-dark mt-1" numberOfLines={1}>
              {dItem.subtitle}
            </Text>
          ) : null}
          {statusText ? (
            <View className="flex-row items-center gap-1.5 mt-2">
              {status === 'failed' ? (
                <AlertTriangle size={12} color={palette.error} />
              ) : (
                <ActivityIndicator size="small" color={palette.tint} style={{ transform: [{ scale: 0.7 }] }} />
              )}
              <Text
                className={[
                  'text-xs font-semibold',
                  status === 'failed' ? 'text-error dark:text-error-dark' : 'text-accent dark:text-accent-dark',
                ].join(' ')}
              >
                {statusText}
              </Text>
              {isProgress && (
                <Text className="text-xs text-muted dark:text-muted-dark font-medium">({Math.round(percent)}%)</Text>
              )}
            </View>
          ) : null}
          {error && (
            <Text className="text-[10px] text-error dark:text-error-dark mt-1" numberOfLines={1}>
              {error}
            </Text>
          )}
        </View>

        <Pressable
          onPress={() => handleDeleteItem(dItem)}
          disabled={isDeleting}
          className={isDeleting ? 'opacity-40' : ''}
          style={({ pressed }) => ({ opacity: isDeleting ? 0.4 : pressed ? 0.85 : 1 })}
          accessibilityRole="button"
          accessibilityLabel={status === 'queued' || status === 'downloading' ? 'Cancel download' : 'Delete download'}
        >
          <ResourceDownloadAction
            status={actionStatus}
            progress={progress}
            isSelected={false}
            isDark={isDark}
            tintColor={palette.tint}
          />
        </Pressable>
      </View>
    );
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: DisplayDownloadItem['category']; totalCount: number; data: DisplayDownloadItem[] };
  }) => {
    const isCollapsed = collapsedCategories.has(section.title);
    const IconComponent = CATEGORY_ICONS[section.title] || Download;

    return (
      <Pressable
        onPress={() => toggleCategory(section.title)}
        className="flex-row items-center justify-between bg-background dark:bg-background-dark pt-6 pb-3 px-1 active:opacity-80"
      >
        <View className="flex-row items-center gap-3">
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent-dark/10">
            <IconComponent color={palette.tint} size={16} strokeWidth={2.25} />
          </View>
          <Text className="text-sm font-bold text-foreground dark:text-foreground-dark uppercase tracking-wider">
            {getCategoryTranslation(section.title)}
          </Text>
          <View className="rounded-full bg-interactive dark:bg-interactive-dark px-2.5 py-0.5 border border-border/20 dark:border-border-dark/10">
            <Text className="text-[10px] font-bold text-muted dark:text-muted-dark">
              {section.totalCount}
            </Text>
          </View>
        </View>

        <View className="h-7 w-7 items-center justify-center rounded-full bg-interactive/50 dark:bg-interactive-dark/50">
          {isCollapsed ? (
            <ChevronRight size={16} color={palette.muted} strokeWidth={2.25} />
          ) : (
            <ChevronDown size={16} color={palette.muted} strokeWidth={2.25} />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <AppHeader
        title={t('downloads', { fallback: 'Downloads' })}
        left={
          <HeaderActionButton onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={palette.text} />
          </HeaderActionButton>
        }
      />

      {isIndexLoading || isLoadingMetadata ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={palette.tint} />
          <Text className="text-sm text-muted dark:text-muted-dark mt-3">
            {t('downloads_loading', { fallback: 'Loading downloads…' })}
          </Text>
        </View>
      ) : mappedItems.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6 text-center">
          <View className="h-16 w-16 rounded-3xl bg-accent/10 items-center justify-center mb-5">
            <Download size={28} color={palette.tint} strokeWidth={2.25} />
          </View>
          <Text className="text-lg font-bold text-foreground dark:text-foreground-dark mb-2">
            {t('downloads_empty_title', { fallback: 'No Downloads Yet' })}
          </Text>
          <Text className="text-sm text-muted dark:text-muted-dark text-center max-w-[280px] leading-6">
            {t('downloads_empty_desc', { fallback: 'Translations, tafsirs, audio recitations, and mushaf packs downloaded for offline reading will appear here.' })}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-8 bg-accent px-6 py-3 rounded-xl active:opacity-90"
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <Text className="text-sm font-semibold text-on-accent">{t('downloads_go_back', { fallback: 'Go Back' })}</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderDownloadItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ResourceConfirmModal
        visible={deleteTarget !== null}
        title={t('downloads_delete_confirm_title', { fallback: 'Delete Download?' })}
        resourceName={deleteTarget?.title}
        detailLabel={deleteTarget?.subtitle}
        description={t('downloads_delete_confirm_desc', { fallback: 'Are you sure you want to delete this downloaded item? This will remove the offline files from your device.' })}
        confirmLabel={t('delete', { fallback: 'Delete' })}
        confirmTone="danger"
        mutedColor={palette.muted}
        tintColor={palette.tint}
        onConfirm={() => {
          if (deleteTarget) {
            void performDelete(deleteTarget);
          }
          setDeleteTarget(null);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </View>
  );
}
