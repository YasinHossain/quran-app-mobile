import { ArrowLeft, BookOpenText, Globe, Type, Wand2, X, Download } from 'lucide-react-native';
import React from 'react';
import { router } from 'expo-router';
import { Alert, Animated, Easing, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DEFAULT_MUSHAF_ID, TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import Colors from '@/constants/Colors';
import { MushafPackOptionCard } from '@/components/reader/settings/MushafPackOptionCard';
import { clearOfflineSurahPageCache } from '@/lib/surah/offlineSurahPageCache';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useMushafPackManager, type MushafPackManagerEntry } from '@/hooks/useMushafPackManager';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { CollapsibleSection } from './CollapsibleSection';
import { FontSizeSlider } from './FontSizeSlider';
import { ManageTafsirsPanel } from './ManageTafsirsPanel';
import { ManageTranslationsPanel } from './ManageTranslationsPanel';
import { SelectionBox } from './SelectionBox';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceConfirmModal } from './resource-panel/ResourceConfirmModal';
import { capitalizeLanguageName, type ResourceRecord } from './resource-panel/resourcePanel.utils';
import { SettingsTabToggle, type SettingsTab } from './SettingsTabToggle';
import { ToggleRow } from './ToggleRow';
import { ArabicFontFilterToggle, type ArabicFontFilter } from './ArabicFontFilterToggle';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { getDownloadKey, type DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { DownloadWordTranslationUseCase, requestWordDownloadCancel } from '@/src/core/application/use-cases/DownloadWordTranslation';
import { DeleteWordTranslationUseCase } from '@/src/core/application/use-cases/DeleteWordTranslation';
import { ResourceDownloadAction } from './resource-panel/ResourceDownloadAction';
import { container } from '@/src/core/infrastructure/di/container';
import { getFirstFontFamily } from '@/src/core/infrastructure/fonts/arabicFonts';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { isMushafPackInstallCanceledError } from '@/src/core/infrastructure/mushaf/MushafPackInstaller';
import { getMushafPackCatalogUrl } from '@/src/core/infrastructure/mushaf/mushafPackCatalogConfig';

import type { MushafPackId } from '@/types';
import { clampMushafScaleStep, MUSHAF_SCALE_MAX, MUSHAF_SCALE_MIN } from '@/types';

type Panel =
  | { type: 'root' }
  | { type: 'translations' }
  | { type: 'tafsir' }
  | { type: 'word-language' }
  | { type: 'arabic-font' }
  | { type: 'ui-language' }
  | { type: 'mushaf' };

export type PanelType = Panel['type'];
type SubPanelType = Exclude<PanelType, 'root'>;

const WORD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bangla' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'fa', name: 'Persian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ta', name: 'Tamil' },
] as const;

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
] as const;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const ARABIC_FONT_PREVIEW_TEXT = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

type WordLanguageItem = ResourceRecord & {
  code: string;
};

type MushafDownloadSizeInfo = {
  mb: number | null;
  isExact: boolean;
};

const WORD_LANGUAGE_ITEMS: WordLanguageItem[] = WORD_LANGUAGES.map((item, index) => ({
  id: index + 1,
  name: item.name,
  lang: item.name,
  code: item.code,
}));

const UI_LANGUAGE_ITEMS: WordLanguageItem[] = UI_LANGUAGES.map((item, index) => ({
  id: index + 1,
  name: item.name,
  lang: item.name,
  code: item.code,
}));

function getLanguageName(code: string | undefined): string {
  if (!code) return '';
  return WORD_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

function getUiLanguageName(code: string | undefined): string {
  if (!code) return 'English';
  return UI_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

function getMushafPackEntryKey(entry: MushafPackManagerEntry): string {
  return `${entry.option.id}@${entry.option.version}`;
}

function formatMushafDownloadDetailLabel(
  entry: MushafPackManagerEntry | null,
  sizeInfo: MushafDownloadSizeInfo | null | undefined,
  isLoading: boolean
): string {
  const details: string[] = [];

  if (isLoading) {
    details.push('Estimating size...');
  } else if (sizeInfo && typeof sizeInfo.mb === 'number') {
    details.push(
      sizeInfo.isExact
        ? `Download size: ${sizeInfo.mb.toFixed(1)} MB`
        : `Estimated size: ~${sizeInfo.mb.toFixed(1)} MB`
    );
  } else {
    details.push('Download size unavailable');
  }

  if (entry?.definition) {
    details.push(`${entry.definition.totalPages} pages`);
  }

  return details.join(' · ');
}

async function resolveMushafDownloadSizeInfo(
  entry: MushafPackManagerEntry
): Promise<MushafDownloadSizeInfo | null> {
  const catalogUrl = getMushafPackCatalogUrl();
  if (!catalogUrl) return null;

  const catalogEntry = await container.getMushafPackCatalogClient().getPack(catalogUrl, {
    packId: entry.option.id,
    version: entry.option.version,
  });
  if (!catalogEntry || catalogEntry.sizeBytes <= 0) return null;

  const filesBytes = (catalogEntry.files ?? []).reduce((total, file) => {
    return total + (typeof file.sizeBytes === 'number' && file.sizeBytes > 0 ? file.sizeBytes : 0);
  }, 0);
  const payloadAndAssetsBytes = Math.max(catalogEntry.sizeBytes, filesBytes);
  const totalBytes = payloadAndAssetsBytes + (catalogEntry.manifestSizeBytes ?? 0);
  const mb = Math.max(0.1, Math.round((totalBytes / BYTES_PER_MEGABYTE) * 10) / 10);

  return { mb, isExact: true };
}

const WordLanguageResourceRow = React.memo(function WordLanguageResourceRow({
  item,
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
  item: WordLanguageItem;
  downloadItem: DownloadIndexItemWithKey | undefined;
  isSelected: boolean;
  isBusy: boolean;
  isDark: boolean;
  tintColor: string;
  onToggle: (id: number) => void;
  onPressDownload: (code: string) => void;
  onPressDelete: (code: string) => void;
  onCancelDownload: (code: string) => void;
}) {
  const status = downloadItem?.status ?? (isBusy ? 'queued' : undefined);
  const isDownloading = status === 'queued' || status === 'downloading';
  const isDeleting = status === 'deleting';
  const isInstalled = status === 'installed';

  const canDownload = !isBusy && !isDownloading && !isDeleting && !isInstalled;
  const canDelete = !isBusy && !isDownloading && !isDeleting && isInstalled;
  const canCancel = isDownloading;

  const isArabic = item.code === 'ar';

  const actionIcon = isArabic ? null : (
    <ResourceDownloadAction
      status={status}
      progress={downloadItem?.progress ?? (isBusy ? { kind: 'items', completed: 0, total: 1 } : undefined)}
      isSelected={isSelected}
      isDark={isDark}
      tintColor={tintColor}
    />
  );

  const trailingPress = isArabic
    ? undefined
    : isDownloading
      ? () => {
          if (canCancel) onCancelDownload(item.code);
        }
      : isInstalled
        ? () => {
            if (canDelete) onPressDelete(item.code);
          }
        : () => {
            if (canDownload) onPressDownload(item.code);
          };

  const trailingLabel = isArabic
    ? undefined
    : isDownloading
      ? `Cancel ${item.name} word-by-word download`
      : isInstalled
        ? `Delete ${item.name} offline word-by-word download`
        : `Download ${item.name} word-by-word for offline use`;

  return (
    <ResourceItem
      item={item}
      isSelected={isSelected}
      onToggle={onToggle}
      trailingAction={actionIcon ?? undefined}
      onTrailingPress={trailingPress}
      trailingAccessibilityLabel={trailingLabel}
      trailingDisabled={
        isArabic || isDeleting || (isDownloading ? !canCancel : isInstalled ? !canDelete : !canDownload)
      }
    />
  );
});

export function SettingsSidebarContent({
  onClose,
  showTafsirSetting = false,
  pageType,
  activeTabOverride,
  onTabChange,
  containerWidth,
  initialPanel,
}: {
  onClose?: () => void;
  showTafsirSetting?: boolean;
  pageType?: 'verse' | 'tafsir' | 'bookmarks';
  activeTabOverride?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  containerWidth?: number;
  initialPanel?: PanelType;
}): React.JSX.Element {
  const { width: windowWidth } = useWindowDimensions();
  const {
    settings,
    setSettings,
    arabicFonts,
    setArabicFontFace,
    setArabicFontSize,
    setTranslationFontSize,
    setTafsirFontSize,
    setWordLang,
    setTranslationIds,
    setTafsirIds,
    setContentLanguage,
    setMushafId,
    setMushafScaleStep,
  } = useSettings();
  const { resolvedTheme, setDarkModeEnabled, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const [activeTab, setActiveTab] = React.useState<SettingsTab>(activeTabOverride ?? 'translations');
  const [panel, setPanel] = React.useState<Panel>(() => ({ type: initialPanel ?? 'root' }));
  const [isReadingOpen, setIsReadingOpen] = React.useState(true);
  const [isTafsirOpen, setIsTafsirOpen] = React.useState(showTafsirSetting && pageType === 'tafsir');
  const [isFontOpen, setIsFontOpen] = React.useState(true);
  const [arabicFontFilter, setArabicFontFilter] = React.useState<ArabicFontFilter>('Uthmani');
  const [mushafDownloadTargetId, setMushafDownloadTargetId] = React.useState<MushafPackId | null>(null);
  const [mushafDeleteTargetId, setMushafDeleteTargetId] = React.useState<MushafPackId | null>(null);
  const [enableTajweedAfterDownload, setEnableTajweedAfterDownload] = React.useState(false);
  const [mushafDownloadSizeInfoByKey, setMushafDownloadSizeInfoByKey] = React.useState<
    Record<string, MushafDownloadSizeInfo | null | undefined>
  >({});
  const [estimatingMushafDownloadKeys, setEstimatingMushafDownloadKeys] = React.useState<Set<string>>(
    () => new Set()
  );


  const previousMushafIdRef = React.useRef<MushafPackId | undefined>(settings.mushafId);
  const animationTokenRef = React.useRef(0);
  const openPanelRafRef = React.useRef<number | null>(null);
  const navProgress = React.useRef(new Animated.Value(initialPanel && initialPanel !== 'root' ? 1 : 0)).current;
  const panelWidth = containerWidth ?? Math.min(390, Math.round(windowWidth * 0.92));

  React.useEffect(() => {
    return () => {
      animationTokenRef.current += 1;
      if (openPanelRafRef.current !== null) {
        cancelAnimationFrame(openPanelRafRef.current);
        openPanelRafRef.current = null;
      }
      navProgress.stopAnimation();
    };
  }, [navProgress]);

  const [busyWordLangCodes, setBusyWordLangCodes] = React.useState<Set<string>>(() => new Set());

  const { itemsByKey, refresh: refreshIndex } = useDownloadIndexItems({
    enabled: panel.type === 'word-language',
    pollIntervalMs: 800,
    pollWhileEnabled: busyWordLangCodes.size > 0,
  });

  const handleDownloadWordLanguage = React.useCallback(async (code: string) => {
    if (busyWordLangCodes.has(code)) return;
    setBusyWordLangCodes((prev) => {
      const next = new Set(prev);
      next.add(code);
      return next;
    });
    try {
      const useCase = new DownloadWordTranslationUseCase(
        container.getDownloadIndexRepository(),
        container.getTranslationOfflineStore(),
        logger,
        container.getWordTranslationPackRepository()
      );
      await useCase.execute(code);
      clearOfflineSurahPageCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Download failed', message);
    } finally {
      setBusyWordLangCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      refreshIndex();
    }
  }, [busyWordLangCodes, refreshIndex]);

  const handleDeleteWordLanguage = React.useCallback((code: string) => {
    if (busyWordLangCodes.has(code)) return;
    Alert.alert(
      'Delete word-by-word download?',
      `This removes offline word-by-word translations for this language.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyWordLangCodes((prev) => {
                const next = new Set(prev);
                next.add(code);
                return next;
              });
              try {
                const useCase = new DeleteWordTranslationUseCase(
                  container.getDownloadIndexRepository(),
                  container.getTranslationOfflineStore(),
                  logger
                );
                await useCase.execute(code);
                clearOfflineSurahPageCache();
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Alert.alert('Delete failed', message);
              } finally {
                setBusyWordLangCodes((prev) => {
                  const next = new Set(prev);
                  next.delete(code);
                  return next;
                });
                refreshIndex();
              }
            })();
          },
        },
      ]
    );
  }, [busyWordLangCodes, refreshIndex]);

  const handleCancelWordDownload = React.useCallback((code: string) => {
    requestWordDownloadCancel(code);
  }, []);

  const openPanel = React.useCallback(
    (nextPanel: SubPanelType) => {
      const token = ++animationTokenRef.current;
      navProgress.stopAnimation();
      navProgress.setValue(0);
      setPanel({ type: nextPanel });
      if (openPanelRafRef.current !== null) {
        cancelAnimationFrame(openPanelRafRef.current);
      }

      openPanelRafRef.current = requestAnimationFrame(() => {
        openPanelRafRef.current = null;
        if (animationTokenRef.current !== token) return;

        navProgress.stopAnimation();
        Animated.timing(navProgress, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          isInteraction: false,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) return;
          if (animationTokenRef.current !== token) return;
        });
      });
    },
    [navProgress]
  );

  const closePanel = React.useCallback(() => {
    if (panel.type === 'root') return;
    const token = ++animationTokenRef.current;
    if (openPanelRafRef.current !== null) {
      cancelAnimationFrame(openPanelRafRef.current);
      openPanelRafRef.current = null;
    }
    navProgress.stopAnimation();
    Animated.timing(navProgress, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setPanel({ type: 'root' });
    });
  }, [navProgress, panel.type]);

  const {
    translations: translationResources,
    translationsById,
    isLoading: isTranslationResourcesLoading,
    errorMessage: translationResourcesError,
    refresh: refreshTranslationResources,
  } = useTranslationResources({
    enabled: activeTab === 'translations' || panel.type === 'translations',
    language: settings.contentLanguage,
  });

  const translationRecords = React.useMemo<ResourceRecord[]>(() => {
    return (translationResources ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      lang: capitalizeLanguageName(t.languageName).trim() || 'Other',
    }));
  }, [translationResources]);

  const selectedTranslationName = React.useMemo(() => {
    const ids = settings.translationIds ?? [];
    if (ids.length === 0) return '';

    const primaryId = ids[0] ?? settings.translationId;
    const primaryName = translationsById.get(primaryId)?.name ?? `Translation ${primaryId}`;

    const extraCount = ids.length - 1;
    if (extraCount > 0) {
      return `${primaryName}, +${extraCount}`;
    }

    return primaryName;
  }, [settings.translationId, settings.translationIds, translationsById]);
  const selectedWordLanguageName = getLanguageName(settings.wordLang);
  const selectedArabicFont = React.useMemo(
    () => arabicFonts.find((font) => font.value === settings.arabicFontFace) ?? arabicFonts[0],
    [arabicFonts, settings.arabicFontFace]
  );
  const selectedArabicFontName = selectedArabicFont?.name ?? 'KFGQ';
  const selectedArabicFontFamily =
    getFirstFontFamily(selectedArabicFont?.value ?? settings.arabicFontFace) ?? 'UthmanicHafs1Ver18';
  const selectedUiLanguageName = getUiLanguageName(settings.contentLanguage);
  const selectedMushafName =
    findMushafOption(settings.mushafId)?.name ?? findMushafOption(DEFAULT_MUSHAF_ID)?.name ?? 'Uthmani Unicode';
  const {
    entries: mushafPackEntries,
    isLoading: isMushafPackManagerLoading,
    errorMessage: mushafPackManagerError,
    installPack,
    cancelPackInstall,
    deletePack,
    refresh: refreshMushafPacks,
  } = useMushafPackManager({
    selectedPackId: settings.mushafId ?? DEFAULT_MUSHAF_ID,
  });
  const mushafDownloadTarget = React.useMemo(
    () =>
      mushafDownloadTargetId
        ? mushafPackEntries.find((entry) => entry.option.id === mushafDownloadTargetId) ?? null
        : null,
    [mushafDownloadTargetId, mushafPackEntries]
  );
  const mushafDeleteTarget = React.useMemo(
    () =>
      mushafDeleteTargetId
        ? mushafPackEntries.find((entry) => entry.option.id === mushafDeleteTargetId) ?? null
        : null,
    [mushafDeleteTargetId, mushafPackEntries]
  );
  const mushafDownloadTargetKey = mushafDownloadTarget ? getMushafPackEntryKey(mushafDownloadTarget) : null;
  const mushafDownloadSizeInfo = mushafDownloadTargetKey
    ? mushafDownloadSizeInfoByKey[mushafDownloadTargetKey]
    : undefined;
  const isEstimatingMushafDownloadSize =
    mushafDownloadTargetKey !== null &&
    (mushafDownloadSizeInfo === undefined || estimatingMushafDownloadKeys.has(mushafDownloadTargetKey));
  const mushafDownloadDetailLabel = React.useMemo(
    () =>
      formatMushafDownloadDetailLabel(
        mushafDownloadTarget,
        mushafDownloadSizeInfo,
        isEstimatingMushafDownloadSize
      ),
    [isEstimatingMushafDownloadSize, mushafDownloadSizeInfo, mushafDownloadTarget]
  );
  const tajweedPackEntry = React.useMemo(
    () => mushafPackEntries.find((entry) => entry.option.id === TAJWEED_MUSHAF_ID) ?? null,
    [mushafPackEntries]
  );
  const tajweedDownloadStatus =
    tajweedPackEntry?.downloadItem?.status ??
    (tajweedPackEntry?.isBusy && !tajweedPackEntry.isInstalled ? ('queued' as const) : undefined);
  const tajweedDownloadProgress =
    tajweedPackEntry?.downloadItem?.progress ??
    (tajweedDownloadStatus === 'queued' || tajweedDownloadStatus === 'downloading'
      ? { kind: 'items' as const, completed: 0, total: 1 }
      : undefined);
  const isTajweedDownloading =
    tajweedDownloadStatus === 'queued' || tajweedDownloadStatus === 'downloading';
  const filteredArabicFonts = React.useMemo(
    () => arabicFonts.filter((font) => font.category === arabicFontFilter),
    [arabicFontFilter, arabicFonts]
  );
  const arabicFontItems = React.useMemo(
    () =>
      filteredArabicFonts.map((font, index) => ({
        id: index + 1,
        name: font.name,
        lang: font.category,
        value: font.value,
      })),
    [filteredArabicFonts]
  );

  const handleSelectWordLanguage = React.useCallback(
    (id: number) => {
      const selected = WORD_LANGUAGE_ITEMS.find((item) => item.id === id);
      if (!selected) return;
      setWordLang(selected.code);
    },
    [setWordLang]
  );
  const handleSelectArabicFont = React.useCallback(
    (id: number) => {
      const selected = arabicFontItems.find((item) => item.id === id);
      if (!selected) return;
      setArabicFontFace(selected.value);
    },
    [arabicFontItems, setArabicFontFace]
  );
  const handleSelectUiLanguage = React.useCallback(
    (id: number) => {
      const selected = UI_LANGUAGE_ITEMS.find((item) => item.id === id);
      if (!selected) return;
      setContentLanguage(selected.code);
    },
    [setContentLanguage]
  );

  const {
    tafsirs,
    tafsirById,
    isLoading: isTafsirResourcesLoading,
    errorMessage: tafsirResourcesError,
    refresh: refreshTafsirResources,
  } = useTafsirResources({
    enabled: showTafsirSetting || panel.type === 'tafsir',
  });

  const tafsirRecords = React.useMemo<ResourceRecord[]>(() => {
    return (tafsirs ?? []).map((t) => ({ id: t.id, name: t.displayName, lang: t.formattedLanguage }));
  }, [tafsirs]);

  const tafsirLanguageSort = React.useMemo(() => {
    const priorityByLang = new Map<string, number>();

    for (const tafsir of tafsirs ?? []) {
      const lang = tafsir.formattedLanguage;
      const priority = tafsir.getLanguagePriority();
      const existing = priorityByLang.get(lang);
      if (existing === undefined || priority < existing) {
        priorityByLang.set(lang, priority);
      }
    }

    return (a: string, b: string): number => {
      const priorityA = priorityByLang.get(a) ?? Number.POSITIVE_INFINITY;
      const priorityB = priorityByLang.get(b) ?? Number.POSITIVE_INFINITY;
      return priorityA !== priorityB ? priorityA - priorityB : a.localeCompare(b);
    };
  }, [tafsirs]);

  const selectedTafsirName = React.useMemo(() => {
    const ids = settings.tafsirIds ?? [];
    if (ids.length === 0) return 'Select Tafsir';
    const names = ids
      .map((id) => tafsirById.get(id)?.displayName ?? `Tafsir ${id}`)
      .filter(Boolean)
      .slice(0, 3);
    return names.length ? names.join(', ') : 'Select Tafsir';
  }, [settings.tafsirIds, tafsirById]);

  const toggleTajweed = React.useCallback(
    (enabled: boolean) => {
      if (enabled) {
        const tajweedEntry = mushafPackEntries.find(
          (entry) => entry.option.id === TAJWEED_MUSHAF_ID
        );
        const canUseTajweed = Boolean(tajweedEntry?.isInstalled || tajweedEntry?.isBundled);
        if (!canUseTajweed) {
          if (tajweedEntry?.isInstallImplemented) {
            previousMushafIdRef.current = settings.mushafId;
            setEnableTajweedAfterDownload(true);
            setMushafDownloadTargetId(TAJWEED_MUSHAF_ID);
            return;
          }

          Alert.alert(
            'Tajweed download unavailable',
            'Tajweed Colors must be downloaded before they can be used offline.'
          );
          return;
        }

        previousMushafIdRef.current = settings.mushafId;
        setSettings({ ...settings, tajweed: true, mushafId: TAJWEED_MUSHAF_ID });
      } else {
        setEnableTajweedAfterDownload(false);
        setSettings({
          ...settings,
          tajweed: false,
          mushafId: previousMushafIdRef.current,
        });
      }
    },
    [mushafPackEntries, setSettings, settings]
  );

  const applyMushafSelection = React.useCallback(
    (packId: MushafPackId) => {
      if (packId === TAJWEED_MUSHAF_ID) {
        const tajweedEntry = mushafPackEntries.find(
          (entry) => entry.option.id === TAJWEED_MUSHAF_ID
        );
        const canUseTajweed = Boolean(tajweedEntry?.isInstalled || tajweedEntry?.isBundled);
        if (!canUseTajweed) {
          if (tajweedEntry?.isInstallImplemented) {
            previousMushafIdRef.current = settings.mushafId;
            setEnableTajweedAfterDownload(true);
            setMushafDownloadTargetId(TAJWEED_MUSHAF_ID);
            return;
          }

          Alert.alert(
            'Tajweed download unavailable',
            'Tajweed Colors must be downloaded before they can be used offline.'
          );
          return;
        }
      }

      setSettings({
        ...settings,
        mushafId: packId,
        tajweed: packId === TAJWEED_MUSHAF_ID,
      });
    },
    [mushafPackEntries, setSettings, settings]
  );

  const handleInstallMushafPack = React.useCallback(
    async (packId: MushafPackId) => {
      try {
        await installPack(packId);
        if (packId === TAJWEED_MUSHAF_ID && enableTajweedAfterDownload) {
          setSettings({ ...settings, tajweed: true, mushafId: TAJWEED_MUSHAF_ID });
          setEnableTajweedAfterDownload(false);
        }
      } catch (error) {
        if (packId === TAJWEED_MUSHAF_ID) {
          setEnableTajweedAfterDownload(false);
        }
        if (isMushafPackInstallCanceledError(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Install failed', message);
      }
    },
    [enableTajweedAfterDownload, installPack, setSettings, settings]
  );

  const handleConfirmMushafPackDownload = React.useCallback(() => {
    if (!mushafDownloadTarget) return;

    const packId = mushafDownloadTarget.option.id;
    setMushafDownloadTargetId(null);
    void handleInstallMushafPack(packId);
  }, [handleInstallMushafPack, mushafDownloadTarget]);

  React.useEffect(() => {
    if (!mushafDownloadTarget) return;

    const key = getMushafPackEntryKey(mushafDownloadTarget);
    if (mushafDownloadSizeInfoByKey[key] !== undefined) return;
    if (estimatingMushafDownloadKeys.has(key)) return;

    let cancelled = false;
    setEstimatingMushafDownloadKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    void resolveMushafDownloadSizeInfo(mushafDownloadTarget)
      .then((sizeInfo) => {
        if (cancelled) return;
        setMushafDownloadSizeInfoByKey((prev) => ({ ...prev, [key]: sizeInfo }));
      })
      .catch((error) => {
        if (cancelled) return;
        logger.warn(
          'Failed to resolve mushaf download size',
          { packId: mushafDownloadTarget.option.id, version: mushafDownloadTarget.option.version },
          error as Error
        );
        setMushafDownloadSizeInfoByKey((prev) => ({ ...prev, [key]: null }));
      })
      .finally(() => {
        if (cancelled) return;
        setEstimatingMushafDownloadKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [mushafDownloadSizeInfoByKey, mushafDownloadTarget]);

  const handleCancelMushafPackInstall = React.useCallback(
    async (packId: MushafPackId) => {
      try {
        await cancelPackInstall(packId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Cancel failed', message);
      }
    },
    [cancelPackInstall]
  );

  const handleDeleteMushafPack = React.useCallback(
    async (packId: MushafPackId) => {
      try {
        await deletePack(packId);
        if (settings.mushafId === packId) {
          applyMushafSelection(DEFAULT_MUSHAF_ID);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Delete failed', message);
      }
    },
    [applyMushafSelection, deletePack, settings.mushafId]
  );

  const handleConfirmMushafPackDelete = React.useCallback(() => {
    if (!mushafDeleteTarget) return;

    const packId = mushafDeleteTarget.option.id;
    setMushafDeleteTargetId(null);
    void handleDeleteMushafPack(packId);
  }, [handleDeleteMushafPack, mushafDeleteTarget]);

  const goBack = React.useCallback(() => {
    closePanel();
  }, [closePanel]);

  const handleActiveTabChange = React.useCallback(
    (nextTab: SettingsTab) => {
      setActiveTab(nextTab);
      onTabChange?.(nextTab);
    },
    [onTabChange]
  );

  React.useEffect(() => {
    if (panel.type !== 'arabic-font') return;
    const selected = arabicFonts.find((font) => font.value === settings.arabicFontFace);
    const nextFilter: ArabicFontFilter = selected?.category === 'IndoPak' ? 'IndoPak' : 'Uthmani';
    setArabicFontFilter(nextFilter);
  }, [arabicFonts, panel.type, settings.arabicFontFace]);

  React.useEffect(() => {
    if (!activeTabOverride) return;
    setActiveTab(activeTabOverride);
  }, [activeTabOverride]);

  const tajweedToggleAccessory = isTajweedDownloading ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cancel Tajweed Colors download"
      hitSlop={8}
      onPress={() => void handleCancelMushafPackInstall(TAJWEED_MUSHAF_ID)}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <ResourceDownloadAction
        status={tajweedDownloadStatus}
        progress={tajweedDownloadProgress}
        isSelected={false}
        isDark={isDark}
        tintColor={palette.tint}
      />
    </Pressable>
  ) : undefined;

  const tafsirSection = showTafsirSetting ? (
    <CollapsibleSection
      title="Tafsir Setting"
      icon={<BookOpenText color={palette.tint} size={20} strokeWidth={2.25} />}
      isOpen={isTafsirOpen}
      onToggle={() => setIsTafsirOpen((v) => !v)}
    >
      <View className="gap-5">
        <SelectionBox
          label="Select Tafsir"
          value={selectedTafsirName || 'Select Tafsir'}
          onPress={() => openPanel('tafsir')}
        />
        <FontSizeSlider
          label="Tafsir Font Size"
          value={settings.tafsirFontSize || 18}
          min={12}
          max={48}
          onChange={setTafsirFontSize}
        />
      </View>
    </CollapsibleSection>
  ) : null;

  const isSubPanel = panel.type !== 'root';

  const subTranslateX = navProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth, 0],
  });
  const subOpacity = navProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const rootTranslateX = navProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -22],
  });
  const rootOpacity = navProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9],
  });

  const subPanelTitle = isSubPanel
    ? panel.type === 'translations'
      ? 'Manage Translations'
      : panel.type === 'tafsir'
        ? 'Manage Tafsirs'
      : panel.type === 'word-language'
        ? 'Word-by-word Language'
      : panel.type === 'arabic-font'
        ? 'Arabic Font Selection'
      : panel.type === 'ui-language'
        ? 'Language'
      : 'Mushaf'
    : '';

  const isTranslationsVisible = panel.type === 'translations';
  const isTafsirVisible = panel.type === 'tafsir';



  const subPanel = (
    <View className="flex-1">
      {isSubPanel ? (
        <View style={styles.header} className="border-b border-border/30 dark:border-border-dark/20">
          <View style={styles.headerSide}>
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
            >
              <ArrowLeft color={palette.text} size={18} strokeWidth={2.25} />
            </Pressable>
          </View>
          <View style={styles.headerTitleWrap}>
            <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark" numberOfLines={1}>
              {subPanelTitle}
            </Text>
          </View>
          <View style={styles.headerSide}>
            {onClose ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                hitSlop={8}
                style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
              >
                <X color={palette.text} size={18} strokeWidth={2.25} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View className="flex-1">
        {panel.type === 'translations' ? (
          <View style={{ flex: 1 }}>
            <ManageTranslationsPanel
              translations={translationRecords}
              orderedSelection={settings.translationIds ?? []}
              onChangeSelection={setTranslationIds}
              isLoading={isTranslationResourcesLoading}
              errorMessage={translationResourcesError}
              onRefresh={refreshTranslationResources}
              isActive={isTranslationsVisible}
            />
          </View>
        ) : null}

        {panel.type === 'tafsir' ? (
          <View style={{ flex: 1 }}>
            <ManageTafsirsPanel
              tafsirs={tafsirRecords}
              orderedSelection={settings.tafsirIds ?? []}
              onChangeSelection={setTafsirIds}
              isLoading={isTafsirResourcesLoading}
              errorMessage={tafsirResourcesError}
              onRefresh={refreshTafsirResources}
              languageSort={tafsirLanguageSort}
              isActive={isTafsirVisible}
            />
          </View>
        ) : null}

        {panel.type === 'word-language' ? (
          <FlatList
            data={WORD_LANGUAGE_ITEMS}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            renderItem={({ item }) => {
              const key = getDownloadKey({ kind: 'word-translation', languageCode: item.code });
              const downloadItem = itemsByKey.get(key);
              return (
                <View className="px-4 py-1">
                  <WordLanguageResourceRow
                    item={item}
                    downloadItem={downloadItem}
                    isSelected={item.code === settings.wordLang}
                    isBusy={busyWordLangCodes.has(item.code)}
                    isDark={isDark}
                    tintColor={palette.tint}
                    onToggle={handleSelectWordLanguage}
                    onPressDownload={handleDownloadWordLanguage}
                    onPressDelete={handleDeleteWordLanguage}
                    onCancelDownload={handleCancelWordDownload}
                  />
                </View>
              );
            }}
          />
        ) : null}

        {panel.type === 'arabic-font' ? (
          <FlatList
            data={arabicFontItems}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            ListHeaderComponent={
              <View className="px-4 pb-3">
                <ArabicFontFilterToggle activeFilter={arabicFontFilter} onChange={setArabicFontFilter} />
                <View
                  className="mt-3 items-center rounded-lg border border-border/30 bg-surface px-4 pb-4 pt-2 dark:border-border-dark/20 dark:bg-surface-dark"
                >
                  <Text
                    className="text-center text-foreground dark:text-foreground-dark"
                    style={[
                      styles.arabicFontPreviewText,
                      {
                        fontFamily: selectedArabicFontFamily,
                      },
                    ]}
                  >
                    {ARABIC_FONT_PREVIEW_TEXT}
                  </Text>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <View className="px-4 py-1">
                <ResourceItem
                  item={item}
                  isSelected={item.value === settings.arabicFontFace}
                  onToggle={handleSelectArabicFont}
                />
              </View>
            )}
          />
        ) : null}

        {panel.type === 'ui-language' ? (
          <FlatList
            data={UI_LANGUAGE_ITEMS}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View className="px-4 py-1">
                <ResourceItem
                  item={item}
                  isSelected={item.code === (settings.contentLanguage ?? 'en')}
                  onToggle={handleSelectUiLanguage}
                />
              </View>
            )}
          />
        ) : null}

        {panel.type === 'mushaf' ? (
          <View style={{ flex: 1 }}>
            <FlatList
              data={mushafPackEntries}
              keyExtractor={(item) => item.option.id}
              contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 24 }}
              ListHeaderComponent={
                <View className="px-1 pb-3">
                  <Text className="text-xs leading-5 text-muted dark:text-muted-dark">
                    Keep the bundled Unicode mushaf for instant offline reading. Exact packs download
                    into local versioned storage and stay available offline once installed.
                  </Text>
                  {isMushafPackManagerLoading ? (
                    <Text className="mt-3 text-xs text-muted dark:text-muted-dark">
                      Refreshing local mushaf pack status…
                    </Text>
                  ) : null}
                  {mushafPackManagerError ? (
                    <View className="mt-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 dark:border-error-dark/30 dark:bg-error-dark/10">
                      <Text className="text-xs leading-5 text-error dark:text-error-dark">
                        {mushafPackManagerError}
                      </Text>
                      <View className="mt-3 flex-row">
                        <Pressable
                          onPress={refreshMushafPacks}
                          className="rounded-full bg-interactive px-4 py-2 dark:bg-interactive-dark"
                          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
                        >
                          <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                            Retry
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              }
              renderItem={({ item }) => {
                const hasActiveMushafJob = mushafPackEntries.some((entry) => entry.isBusy);
                const effectiveMushafStatus =
                  item.downloadItem?.status ??
                  (item.isBusy ? (item.isInstalled ? 'deleting' : 'queued') : undefined);
                const effectiveMushafProgress =
                  item.downloadItem?.progress ??
                  (effectiveMushafStatus === 'queued' || effectiveMushafStatus === 'downloading'
                    ? { kind: 'items' as const, completed: 0, total: 1 }
                    : undefined);
                const isDownloading =
                  effectiveMushafStatus === 'queued' ||
                  effectiveMushafStatus === 'downloading';
                const isSelectable = item.isInstalled || item.isBundled;
                const primaryAction = isSelectable
                  ? {
                      label: item.isSelected ? 'Selected' : 'Use',
                      onPress: () => {
                        applyMushafSelection(item.option.id);
                        closePanel();
                      },
                      disabled: item.isSelected || item.isBusy,
                      tone: item.isSelected ? ('default' as const) : ('accent' as const),
                    }
                  : item.isInstallImplemented
                    ? {
                        label: effectiveMushafStatus === 'failed' ? 'Retry install' : 'Install',
                        onPress: () => {
                          if (item.option.id === TAJWEED_MUSHAF_ID) {
                            previousMushafIdRef.current = settings.mushafId;
                            setEnableTajweedAfterDownload(true);
                          }
                          setMushafDownloadTargetId(item.option.id);
                        },
                        disabled: item.isBusy || hasActiveMushafJob,
                        tone: 'accent' as const,
                      }
                    : {
                        label: 'Coming soon',
                        onPress: () => undefined,
                        disabled: true,
                      };

                const secondaryAction =
                  isDownloading
                    ? {
                        label: 'Cancel install',
                        onPress: () => {
                          void handleCancelMushafPackInstall(item.option.id);
                        },
                        disabled: false,
                      }
                    : item.isInstalled && !item.isBundled
                    ? {
                        label: 'Delete',
                        onPress: () => setMushafDeleteTargetId(item.option.id),
                        disabled: item.isBusy,
                        tone: 'danger' as const,
                      }
                    : undefined;

                return (
                  <MushafPackOptionCard
                    packId={item.option.id}
                    title={item.option.name}
                    downloadProgress={effectiveMushafProgress}
                    downloadStatus={effectiveMushafStatus}
                    description={item.option.description}
                    statusLabel={item.statusLabel}
                    progressLabel={item.progressLabel}
                    errorMessage={item.errorMessage}
                    sourceLabel={item.definition?.sourceLabel ?? null}
                    isSelected={item.isSelected}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                  />
                );
              }}
            />
          </View>
        ) : null}

      </View>
    </View>
  );

  return (
    <View className="flex-1">
      <Animated.View
        style={{ flex: 1, opacity: rootOpacity, transform: [{ translateX: rootTranslateX }] }}
        pointerEvents={isSubPanel ? 'none' : 'auto'}
      >
        <View className="flex-1">
          <View style={styles.header} className="border-b border-border/30 dark:border-border-dark/20">
            <View style={styles.headerSide} />
            <View style={styles.headerTitleWrap}>
              <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark" numberOfLines={1}>
                Settings
              </Text>
            </View>
            <View style={styles.headerSide}>
              {onClose ? (
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close settings"
                  hitSlop={8}
                  style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
                >
                  <X color={palette.text} size={18} strokeWidth={2.25} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <View className="border-b border-border/30 dark:border-border-dark/20 px-4 py-3">
            <SettingsTabToggle activeTab={activeTab} onTabChange={handleActiveTabChange} />
          </View>

          <View className="flex-1 py-1">
            {activeTab === 'translations' ? (
              <View className="flex-1">
                <View className="flex-1">
                  <FlatList
                    data={[{ key: 'content' }]}
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 12, gap: 14 }}
                    renderItem={() => (
                      <>
                        {pageType === 'tafsir' ? tafsirSection : null}
                        <CollapsibleSection
                          title="Reading Setting"
                          icon={<Wand2 color={palette.tint} size={20} strokeWidth={2.25} />}
                          isOpen={isReadingOpen}
                          onToggle={() => setIsReadingOpen((v) => !v)}
                        >
                          <View className="gap-4">
                            <ToggleRow label="Night Mode" value={isDark} onChange={setDarkModeEnabled} />
                            <SelectionBox
                              label="Translations"
                              value={selectedTranslationName || 'No translation'}
                              onPress={() => openPanel('translations')}
                            />
                            <ToggleRow
                              label="Show Word-by-Word"
                              value={settings.showByWords}
                              onChange={(next) => setSettings({ ...settings, showByWords: next })}
                            />
                            <SelectionBox
                              label="Word-by-word Language"
                              value={selectedWordLanguageName || 'Select'}
                              onPress={() => openPanel('word-language')}
                            />
                            <ToggleRow
                              disabled={isTajweedDownloading}
                              label="Tajweed Colors"
                              value={settings.tajweed}
                              rightElement={tajweedToggleAccessory}
                              onChange={toggleTajweed}
                            />
                          </View>
                        </CollapsibleSection>

                        {pageType !== 'tafsir' ? tafsirSection : null}

                        <CollapsibleSection
                          title="Font Setting"
                          icon={<Type color={palette.tint} size={20} strokeWidth={2.25} />}
                          isOpen={isFontOpen}
                          onToggle={() => setIsFontOpen((v) => !v)}
                        >
                          <View className="gap-5">
                            <FontSizeSlider
                              label="Arabic Font Size"
                              value={settings.arabicFontSize}
                              min={18}
                              max={60}
                              onChange={setArabicFontSize}
                            />
                            <FontSizeSlider
                              label="Translation Font Size"
                              value={settings.translationFontSize}
                              min={12}
                              max={36}
                              onChange={setTranslationFontSize}
                            />
                            <SelectionBox
                              label="Arabic Font"
                              value={selectedArabicFontName}
                              onPress={() => openPanel('arabic-font')}
                            />
                          </View>
                        </CollapsibleSection>

                        <Pressable
                          onPress={() => {
                            onClose?.();
                            router.push('/downloads');
                          }}
                          className="flex-row items-center justify-between gap-3 rounded-2xl px-2 py-3 mt-1"
                          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                        >
                          <View className="flex-row items-center gap-3">
                            <Download color={palette.tint} size={20} strokeWidth={2.25} />
                            <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                              Manage Downloads
                            </Text>
                          </View>
                        </Pressable>

                        <Pressable
                          onPress={() => openPanel('ui-language')}
                          className="flex-row items-center justify-between gap-3 rounded-2xl px-2 py-3 mt-1"
                          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                        >
                          <View className="flex-row items-center gap-3">
                            <Globe color={palette.tint} size={20} strokeWidth={2.25} />
                            <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                              Language
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <Text className="text-sm text-muted dark:text-muted-dark">
                              {selectedUiLanguageName}
                            </Text>
                          </View>
                        </Pressable>
                      </>
                    )}
                  />
                </View>
              </View>
            ) : (
              <View className="flex-1">
                <View className="gap-4 px-4 py-3">
                  <SelectionBox label="Mushaf" value={selectedMushafName} onPress={() => openPanel('mushaf')} />
                  <FontSizeSlider
                    label="Mushaf Font Size"
                    value={settings.mushafScaleStep}
                    min={MUSHAF_SCALE_MIN}
                    max={MUSHAF_SCALE_MAX}
                    onChange={(next) => setMushafScaleStep(clampMushafScaleStep(next))}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      {isSubPanel ? (
        <Animated.View
          style={[
            styles.subPanel,
            {
              backgroundColor: palette.background,
              opacity: subOpacity,
              transform: [{ translateX: subTranslateX }],
            },
          ]}
        >
          {subPanel}
        </Animated.View>
      ) : null}

      <ResourceConfirmModal
        visible={mushafDownloadTarget !== null}
        title="Download mushaf pack?"
        resourceName={mushafDownloadTarget?.option.name ?? null}
        detailLabel={mushafDownloadDetailLabel}
        isDetailLoading={isEstimatingMushafDownloadSize}
        description="This downloads the mushaf pack."
        confirmLabel="Download"
        mutedColor={palette.muted}
        tintColor={palette.tint}
        onConfirm={handleConfirmMushafPackDownload}
        onClose={() => {
          setMushafDownloadTargetId(null);
          setEnableTajweedAfterDownload(false);
        }}
      />

      <ResourceConfirmModal
        visible={mushafDeleteTarget !== null}
        title="Delete mushaf download?"
        resourceName={mushafDeleteTarget?.option.name ?? null}
        description="This removes the mushaf pack from local storage."
        confirmLabel="Delete"
        confirmTone="danger"
        mutedColor={palette.muted}
        tintColor={palette.tint}
        onConfirm={handleConfirmMushafPackDelete}
        onClose={() => setMushafDeleteTargetId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerSide: {
    width: 40,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  subPanel: {
    ...StyleSheet.absoluteFill,
  },
  hidden: {
    display: 'none',
  },
  arabicFontPreviewText: {
    fontSize: 26,
    lineHeight: 46,
    minHeight: 52,
    includeFontPadding: false,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
