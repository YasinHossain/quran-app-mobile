import { BookOpenText, Globe, Type, Wand2, X, Download } from 'lucide-react-native';
import React from 'react';
import { router } from 'expo-router';
import { Alert, Animated, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import Colors from '@/constants/Colors';
import { modalSpringConfig } from '@/components/motion/modalTransition';
import { MushafPackOptionCard } from '@/components/reader/settings/MushafPackOptionCard';
import { clearOfflineSurahPageCache } from '@/lib/surah/offlineSurahPageCache';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useMushafPackManager, type MushafPackManagerEntry } from '@/hooks/useMushafPackManager';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { getUiLanguageLabel, UI_LANGUAGES } from '@/lib/i18n/uiLanguages';
import {
  getWordLanguageName,
  normalizeWordLanguageCode,
  WORD_LANGUAGES,
} from '@/lib/i18n/wordLanguages';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { CollapsibleSection } from './CollapsibleSection';
import { FontSizeSlider } from './FontSizeSlider';
import { SettingsPanelHeader } from './SettingsPanelHeader';
import { TafsirSelectionPanel } from './TafsirSettingsContent';
import { ManageTranslationsPanel } from './ManageTranslationsPanel';
import { SelectionBox } from './SelectionBox';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceConfirmModal } from './resource-panel/ResourceConfirmModal';
import {
  capitalizeLanguageName,
  formatDownloadSize,
  type ResourceRecord,
} from './resource-panel/resourcePanel.utils';
import { SettingsTabToggle, type SettingsTab } from './SettingsTabToggle';
import { ToggleRow } from './ToggleRow';
import { ArabicFontFilterToggle, type ArabicFontFilter } from './ArabicFontFilterToggle';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useDownloadedResourceSize } from '@/hooks/useDownloadedResourceSize';
import { getDownloadKey, type DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { DownloadWordTranslationUseCase, requestWordDownloadCancel } from '@/src/core/application/use-cases/DownloadWordTranslation';
import { DeleteWordTranslationUseCase } from '@/src/core/application/use-cases/DeleteWordTranslation';
import { ResourceDownloadAction } from './resource-panel/ResourceDownloadAction';
import { container } from '@/src/core/infrastructure/di/container';
import { getFirstFontFamily, loadArabicFontFaceAsync } from '@/src/core/infrastructure/fonts/arabicFonts';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import { isMushafPackInstallCanceledError } from '@/src/core/infrastructure/mushaf/MushafPackInstaller';
import {
  getBundledMushafDownloadSizeBytes,
  getBundledWordTranslationDownloadSizeBytes,
} from '@/src/core/infrastructure/offline-packs/bundledDownloadMetadata';

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

// The resource lists each keep their own layer (header included) warm offscreen;
// every other sub-panel shares one layer whose content is built on open.
type SubPanelLayer = 'translations' | 'tafsir' | 'other';
const SUB_PANEL_LAYERS: SubPanelLayer[] = ['translations', 'tafsir', 'other'];

function getSubPanelLayer(type: PanelType | undefined): SubPanelLayer | null {
  if (!type || type === 'root') return null;
  if (type === 'translations' || type === 'tafsir') return type;
  return 'other';
}

const ARABIC_FONT_PREVIEW_TEXT = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

type WordLanguageItem = ResourceRecord & {
  code: string;
};

const WORD_LANGUAGE_ITEMS: WordLanguageItem[] = WORD_LANGUAGES.map((item, index) => ({
  id: index + 1,
  name: item.name,
  lang: item.name,
  code: item.code,
}));

const UI_LANGUAGE_ITEMS: WordLanguageItem[] = UI_LANGUAGES.map((item, index) => ({
  id: index + 1,
  name: item.nativeLabel,
  lang: item.label,
  code: item.code,
}));

const RESPONSIVE_SETTING_COMMIT_MS = 48;

function useResponsiveSetting<T>(
  externalValue: T,
  onCommit: (value: T) => void
): readonly [T, (value: T) => void] {
  const [localValue, setLocalValue] = React.useState(externalValue);
  const latestValueRef = React.useRef(externalValue);
  const onCommitRef = React.useRef(onCommit);
  const commitTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  React.useEffect(() => {
    if (commitTimeoutRef.current === null) {
      latestValueRef.current = externalValue;
      setLocalValue(externalValue);
    }
  }, [externalValue]);

  const update = React.useCallback((nextValue: T) => {
    latestValueRef.current = nextValue;
    setLocalValue(nextValue);

    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
    }

    commitTimeoutRef.current = setTimeout(() => {
      commitTimeoutRef.current = null;
      const valueToCommit = latestValueRef.current;
      React.startTransition(() => onCommitRef.current(valueToCommit));
    }, RESPONSIVE_SETTING_COMMIT_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (!commitTimeoutRef.current) return;
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
      const valueToCommit = latestValueRef.current;
      React.startTransition(() => onCommitRef.current(valueToCommit));
    },
    []
  );

  return [localValue, update] as const;
}

function getLanguageName(code: string | undefined): string {
  return code ? getWordLanguageName(code) : '';
}

function formatMushafDownloadDetailLabel(
  entry: MushafPackManagerEntry | null
): string {
  const details: string[] = [];
  const size = formatDownloadSize(entry ? getBundledMushafDownloadSizeBytes(entry.option.id) : null);

  if (size) {
    details.push(`Download size: ${size}`);
  } else {
    details.push('Download size unavailable');
  }

  if (entry?.definition) {
    details.push(`${entry.definition.totalPages} pages`);
  }

  return details.join(' · ');
}

const WordLanguageResourceRow = React.memo(function WordLanguageResourceRow({
  item,
  downloadSize,
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
  downloadSize: string | null;
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
        : `Download ${item.name} word-by-word${downloadSize ? `, ${downloadSize}` : ''}`;

  return (
    <ResourceItem
      item={item}
      isSelected={isSelected}
      onToggle={onToggle}
      trailingAction={actionIcon ?? undefined}
      trailingLabel={!isArabic && canDownload ? downloadSize : null}
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
  onMushafInstalled,
  onOpenMushafManager,
  onSubPanelBack,
  hideRootWhenSubPanel = false,
  dataEnabled = true,
}: {
  onClose?: () => void;
  showTafsirSetting?: boolean;
  pageType?: 'verse' | 'tafsir' | 'bookmarks';
  activeTabOverride?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  containerWidth?: number;
  initialPanel?: PanelType;
  onMushafInstalled?: (packId: MushafPackId) => void;
  onOpenMushafManager?: () => void;
  onSubPanelBack?: () => void;
  hideRootWhenSubPanel?: boolean;
  dataEnabled?: boolean;
}): React.JSX.Element {
  const { width: windowWidth } = useWindowDimensions();
  const {
    settings,
    arabicFonts,
    setShowByWords,
    setTajweedMushaf,
    setArabicFontFace,
    setArabicFontSize,
    setTranslationFontSize,
    setTafsirFontSize,
    setWordLang,
    setTranslationIds,
    setUiLanguage,
    setMushafScaleStep,
    setMushafId,
  } = useSettings();
  const { t } = useUiTranslation();
  const { resolvedTheme, setDarkModeEnabled, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [displayShowByWords, updateShowByWords] = useResponsiveSetting(
    settings.showByWords,
    setShowByWords
  );
  const displayWordLang = settings.wordLang;
  const [displayTajweed, setDisplayTajweed] = React.useState(settings.tajweed);

  React.useEffect(() => {
    setDisplayTajweed(settings.tajweed);
  }, [settings.tajweed]);

  const [activeTab, setActiveTab] = React.useState<SettingsTab>(activeTabOverride ?? 'translations');
  const [panel, setPanel] = React.useState<Panel>(() => ({ type: initialPanel ?? 'root' }));
  // A direct resource-manager open (for example, "Add Tafsir") does not need the
  // full settings root behind it. Keep that large subtree out of the cold-open
  // commit and mount it only if the user actually navigates back to settings.
  const [isRootContentMounted, setIsRootContentMounted] = React.useState(
    () => !initialPanel || initialPanel === 'root'
  );
  const [isReadingOpen, setIsReadingOpen] = React.useState(true);
  const [isTafsirOpen, setIsTafsirOpen] = React.useState(showTafsirSetting && pageType === 'tafsir');
  const [isFontOpen, setIsFontOpen] = React.useState(true);
  const [arabicFontFilter, setArabicFontFilter] = React.useState<ArabicFontFilter>('Uthmani');
  const [mushafDownloadTargetId, setMushafDownloadTargetId] = React.useState<MushafPackId | null>(null);
  const [mushafDeleteTargetId, setMushafDeleteTargetId] = React.useState<MushafPackId | null>(null);
  const [enableTajweedAfterDownload, setEnableTajweedAfterDownload] = React.useState(false);

  const previousMushafIdRef = React.useRef<MushafPackId | undefined>(
    settings.mushafId === TAJWEED_MUSHAF_ID ? undefined : settings.mushafId
  );
  const animationTokenRef = React.useRef(0);
  const fontSelectionRequestRef = React.useRef(0);
  const openPanelRafRef = React.useRef<number | null>(null);
  const navProgress = React.useRef(new Animated.Value(initialPanel && initialPanel !== 'root' ? 1 : 0)).current;
  // Which sub-panel layer navProgress slides in (1) or leaves offscreen (0). Set natively
  // before a slide starts, so a warm layer can move without waiting for a React commit.
  const layerSelection = React.useRef<Record<SubPanelLayer, Animated.Value>>({
    translations: new Animated.Value(getSubPanelLayer(initialPanel) === 'translations' ? 1 : 0),
    tafsir: new Animated.Value(getSubPanelLayer(initialPanel) === 'tafsir' ? 1 : 0),
    other: new Animated.Value(getSubPanelLayer(initialPanel) === 'other' ? 1 : 0),
  }).current;
  const selectLayer = React.useCallback(
    (type: SubPanelType) => {
      const target = getSubPanelLayer(type);
      for (const layer of SUB_PANEL_LAYERS) {
        layerSelection[layer].setValue(layer === target ? 1 : 0);
      }
    },
    [layerSelection]
  );
  const panelWidth = containerWidth ?? Math.min(390, Math.round(windowWidth * 0.92));

  React.useEffect(() => {
    if (!initialPanel || initialPanel === 'root') return;
    navProgress.stopAnimation();
    selectLayer(initialPanel);
    navProgress.setValue(1);
    setPanel({ type: initialPanel });
  }, [initialPanel, navProgress, selectLayer]);

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
  const requestedWordLanguageRef = React.useRef<string | null>(null);
  const enableWordByWordAfterDownloadRef = React.useRef<string | null>(null);
  const activeWordDownloadsRef = React.useRef(new Set<string>());
  const [wordDownloadTarget, setWordDownloadTarget] = React.useState<WordLanguageItem | null>(null);
  const [wordDeleteTarget, setWordDeleteTarget] = React.useState<WordLanguageItem | null>(null);

  const isDownloadIndexEnabled =
    dataEnabled && (panel.type === 'root' || panel.type === 'word-language');
  const {
    items,
    itemsByKey,
    isLoading: isDownloadIndexLoading,
    refresh: refreshIndex,
  } = useDownloadIndexItems({
    enabled: isDownloadIndexEnabled,
    pollIntervalMs: 800,
    pollWhileEnabled: busyWordLangCodes.size > 0,
  });
  const { label: downloadedResourceSizeLabel } = useDownloadedResourceSize(items, {
    isIndexLoading: isDownloadIndexLoading || !isDownloadIndexEnabled,
  });

  const downloadWordLanguage = React.useCallback(async (code: string) => {
    if (activeWordDownloadsRef.current.has(code)) return;
    activeWordDownloadsRef.current.add(code);
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
      // Cancellation resolves normally; only a completed installation may select a language.
      const installed = await container.getDownloadIndexRepository().get({
        kind: 'word-translation', languageCode: code,
      });
      if (installed?.status === 'installed' && requestedWordLanguageRef.current === code) {
        setWordLang(code);
        if (enableWordByWordAfterDownloadRef.current === code) {
          updateShowByWords(true);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Download failed', message);
    } finally {
      if (enableWordByWordAfterDownloadRef.current === code) {
        enableWordByWordAfterDownloadRef.current = null;
      }
      activeWordDownloadsRef.current.delete(code);
      setBusyWordLangCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      refreshIndex();
    }
  }, [refreshIndex, setWordLang, updateShowByWords]);

  const deleteWordLanguage = React.useCallback(async (code: string) => {
    if (busyWordLangCodes.has(code)) return;
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
      if (normalizeWordLanguageCode(settings.wordLang) === code && settings.showByWords) {
        updateShowByWords(false);
      }
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
  }, [busyWordLangCodes, refreshIndex, settings.showByWords, settings.wordLang, updateShowByWords]);

  const handlePressDownloadWordLanguage = React.useCallback(
    (code: string) => {
      if (busyWordLangCodes.has(code)) return;
      const target = WORD_LANGUAGE_ITEMS.find((item) => item.code === code);
      if (target) {
        enableWordByWordAfterDownloadRef.current = null;
        requestedWordLanguageRef.current = code;
        void downloadWordLanguage(code);
      }
    },
    [busyWordLangCodes, downloadWordLanguage]
  );

  const handleConfirmDownloadWordLanguage = React.useCallback(() => {
    if (!wordDownloadTarget) return;
    const code = wordDownloadTarget.code;
    setWordDownloadTarget(null);
    void downloadWordLanguage(code);
  }, [downloadWordLanguage, wordDownloadTarget]);

  const handlePressDeleteWordLanguage = React.useCallback(
    (code: string) => {
      if (busyWordLangCodes.has(code)) return;
      const target = WORD_LANGUAGE_ITEMS.find((item) => item.code === code);
      if (target) setWordDeleteTarget(target);
    },
    [busyWordLangCodes]
  );

  const handleConfirmDeleteWordLanguage = React.useCallback(() => {
    if (!wordDeleteTarget) return;
    const code = wordDeleteTarget.code;
    setWordDeleteTarget(null);
    void deleteWordLanguage(code);
  }, [deleteWordLanguage, wordDeleteTarget]);

  const wordDownloadSize = formatDownloadSize(
    wordDownloadTarget ? getBundledWordTranslationDownloadSizeBytes(wordDownloadTarget.code) : null
  );
  const wordDownloadSizeLabel = wordDownloadSize
    ? `Download size: ${wordDownloadSize}`
    : 'Download size unavailable';

  const handleCancelWordDownload = React.useCallback((code: string) => {
    requestWordDownloadCancel(code);
  }, []);

  const openPanel = React.useCallback(
    (nextPanel: SubPanelType) => {
      const token = ++animationTokenRef.current;
      navProgress.stopAnimation();
      navProgress.setValue(0);
      selectLayer(nextPanel);
      setPanel({ type: nextPanel });

      const startAnimation = () => {
        if (animationTokenRef.current !== token) return;
        navProgress.stopAnimation();
        // Native timing animations are sampled at 60 fps on Android and judder on 90/120 Hz
        // screens; the shared decelerating spring advances on every display frame.
        Animated.spring(navProgress, {
          toValue: 1,
          ...modalSpringConfig('open', 200),
          isInteraction: false,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) return;
          if (animationTokenRef.current !== token) return;
        });
      };

      if (openPanelRafRef.current !== null) {
        cancelAnimationFrame(openPanelRafRef.current);
        openPanelRafRef.current = null;
      }

      if (getSubPanelLayer(nextPanel) !== 'other') {
        // Resource lists already sit offscreen in their own layer, header included,
        // so nothing has to change onscreen before they move.
        startAnimation();
        return;
      }

      // The shared layer builds its content on open. Wait for that commit before
      // moving it so a previous panel's content can never flash onscreen.
      openPanelRafRef.current = requestAnimationFrame(() => {
        openPanelRafRef.current = null;
        startAnimation();
      });
    },
    [navProgress, selectLayer]
  );

  const closePanel = React.useCallback(() => {
    if (panel.type === 'root') return;
    const token = ++animationTokenRef.current;
    if (openPanelRafRef.current !== null) {
      cancelAnimationFrame(openPanelRafRef.current);
      openPanelRafRef.current = null;
    }
    const startAnimation = () => {
      if (animationTokenRef.current !== token) return;
      navProgress.stopAnimation();
      // Going back slides the root panel in, so it decelerates like an entrance.
      Animated.spring(navProgress, {
        toValue: 0,
        ...modalSpringConfig('open', 160),
        isInteraction: false,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        if (animationTokenRef.current !== token) return;
        setPanel({ type: 'root' });
      });
    };

    if (isRootContentMounted) {
      startAnimation();
      return;
    }

    // The root was intentionally skipped for a direct subpanel open. Give React
    // one frame to put it behind the subpanel before sliding the subpanel away.
    setIsRootContentMounted(true);
    openPanelRafRef.current = requestAnimationFrame(() => {
      openPanelRafRef.current = null;
      startAnimation();
    });
  }, [isRootContentMounted, navProgress, panel.type]);

  const {
    translations: translationResources,
    translationsById,
    isLoading: isTranslationResourcesLoading,
    errorMessage: translationResourcesError,
    refresh: refreshTranslationResources,
  } = useTranslationResources({
    enabled:
      dataEnabled &&
      (panel.type === 'translations' ||
        (panel.type === 'root' && activeTab === 'translations')),
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
  // The stored word language is only a preference until its pack is installed.
  const selectedWordPack = itemsByKey.get(getDownloadKey({
    kind: 'word-translation',
    languageCode: normalizeWordLanguageCode(displayWordLang),
  }));
  const isSelectedWordLanguageInstalled = selectedWordPack?.status === 'installed';
  const selectedWordLanguageName = isSelectedWordLanguageInstalled
    ? getLanguageName(displayWordLang)
    : '';
  const selectedArabicFont = React.useMemo(
    () => arabicFonts.find((font) => font.value === settings.arabicFontFace) ?? arabicFonts[0],
    [arabicFonts, settings.arabicFontFace]
  );
  const selectedArabicFontName = selectedArabicFont?.name ?? 'KFGQ';
  const selectedArabicFontFamily =
    getFirstFontFamily(selectedArabicFont?.value ?? settings.arabicFontFace) ?? 'UthmanicHafs1Ver18';
  const selectedUiLanguageName = getUiLanguageLabel(settings.uiLanguage);
  const selectedMushafName =
    findMushafOption(settings.mushafId)?.name ?? 'No mushaf installed';
  const {
    entries: mushafPackEntries,
    isStatusKnown: isMushafPackStatusKnown,
    errorMessage: mushafPackManagerError,
    installPack,
    cancelPackInstall,
    deletePack,
    refresh: refreshMushafPacks,
  } = useMushafPackManager({
    selectedPackId: settings.mushafId,
    enabled: dataEnabled && (panel.type === 'root' || panel.type === 'mushaf'),
  });
  const hasActiveMushafJob = mushafPackEntries.some((entry) => entry.isBusy);
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
  const mushafDownloadDetailLabel = React.useMemo(
    () => formatMushafDownloadDetailLabel(mushafDownloadTarget),
    [mushafDownloadTarget]
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
      if (!selected || isDownloadIndexLoading) return;
      enableWordByWordAfterDownloadRef.current = null;
      requestedWordLanguageRef.current = selected.code;
      const download = itemsByKey.get(getDownloadKey({
        kind: 'word-translation', languageCode: selected.code,
      }));
      if (busyWordLangCodes.has(selected.code) ||
          download?.status === 'queued' || download?.status === 'downloading' ||
          download?.status === 'deleting') return;
      if (download?.status === 'installed') {
        setWordLang(selected.code);
      } else {
        setWordDownloadTarget(selected);
      }
    },
    [busyWordLangCodes, isDownloadIndexLoading, itemsByKey, setWordLang]
  );
  const handleShowByWordsChange = React.useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        enableWordByWordAfterDownloadRef.current = null;
        updateShowByWords(false);
        return;
      }

      if (isDownloadIndexLoading) return;

      const code = normalizeWordLanguageCode(settings.wordLang);
      const target = WORD_LANGUAGE_ITEMS.find((item) => item.code === code);
      if (!target) return;

      const download = itemsByKey.get(getDownloadKey({
        kind: 'word-translation',
        languageCode: code,
      }));

      requestedWordLanguageRef.current = code;
      if (download?.status === 'installed') {
        enableWordByWordAfterDownloadRef.current = null;
        updateShowByWords(true);
        return;
      }

      if (
        busyWordLangCodes.has(code) ||
        download?.status === 'queued' ||
        download?.status === 'downloading'
      ) {
        enableWordByWordAfterDownloadRef.current = code;
        return;
      }

      if (download?.status === 'deleting') return;

      enableWordByWordAfterDownloadRef.current = code;
      setWordDownloadTarget(target);
    },
    [busyWordLangCodes, isDownloadIndexLoading, itemsByKey, settings.wordLang, updateShowByWords]
  );
  const handleSelectArabicFont = React.useCallback(
    (id: number) => {
      const selected = arabicFontItems.find((item) => item.id === id);
      if (!selected) return;
      const requestId = ++fontSelectionRequestRef.current;
      void loadArabicFontFaceAsync(selected.value)
        .then(() => {
          if (requestId === fontSelectionRequestRef.current) {
            setArabicFontFace(selected.value);
          }
        })
        .catch((error) => {
          logger.warn('Failed to load selected Arabic font', undefined, error as Error);
        });
    },
    [arabicFontItems, setArabicFontFace]
  );
  const handleSelectUiLanguage = React.useCallback(
    (id: number) => {
      const selected = UI_LANGUAGE_ITEMS.find((item) => item.id === id);
      if (!selected) return;
      setUiLanguage(selected.code);
    },
    [setUiLanguage]
  );

  const { tafsirById } = useTafsirResources({
    enabled: dataEnabled && showTafsirSetting,
  });

  const selectedTafsirName = React.useMemo(() => {
    const ids = settings.tafsirIds ?? [];
    if (ids.length === 0) return t('select_tafsir');
    const names = ids
      .map((id) => tafsirById.get(id)?.displayName ?? `Tafsir ${id}`)
      .filter(Boolean)
      .slice(0, 3);
    return names.length ? names.join(', ') : t('select_tafsir');
  }, [settings.tafsirIds, tafsirById, t]);

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
        setDisplayTajweed(true);
        React.startTransition(() => setTajweedMushaf(true, TAJWEED_MUSHAF_ID));
      } else {
        setEnableTajweedAfterDownload(false);
        setDisplayTajweed(false);
        React.startTransition(() =>
          setTajweedMushaf(false, previousMushafIdRef.current ?? settings.mushafId ?? TAJWEED_MUSHAF_ID)
        );
      }
    },
    [mushafPackEntries, setTajweedMushaf, settings.mushafId]
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

      const enablesTajweed = packId === TAJWEED_MUSHAF_ID;
      if (enablesTajweed && settings.mushafId !== TAJWEED_MUSHAF_ID) {
        previousMushafIdRef.current = settings.mushafId;
      }
      setDisplayTajweed(enablesTajweed);
      React.startTransition(() => setTajweedMushaf(enablesTajweed, packId));
    },
    [mushafPackEntries, setTajweedMushaf, settings.mushafId]
  );

  const handleInstallMushafPack = React.useCallback(
    async (packId: MushafPackId) => {
      try {
        await installPack(packId);
        const enablesTajweed = packId === TAJWEED_MUSHAF_ID;
        setDisplayTajweed(enablesTajweed);
        setTajweedMushaf(enablesTajweed, packId);
        setEnableTajweedAfterDownload(false);
        onMushafInstalled?.(packId);
      } catch (error) {
        if (packId === TAJWEED_MUSHAF_ID) {
          setEnableTajweedAfterDownload(false);
        }
        if (isMushafPackInstallCanceledError(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Install failed', message);
      }
    },
    [installPack, onMushafInstalled, setTajweedMushaf]
  );

  const handleConfirmMushafPackDownload = React.useCallback(() => {
    if (!mushafDownloadTarget) return;

    const packId = mushafDownloadTarget.option.id;
    setMushafDownloadTargetId(null);
    void handleInstallMushafPack(packId);
  }, [handleInstallMushafPack, mushafDownloadTarget]);

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
          setMushafId(undefined);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Delete failed', message);
      }
    },
    [deletePack, setMushafId, settings.mushafId]
  );

  const handleConfirmMushafPackDelete = React.useCallback(() => {
    if (!mushafDeleteTarget) return;

    const packId = mushafDeleteTarget.option.id;
    setMushafDeleteTargetId(null);
    void handleDeleteMushafPack(packId);
  }, [handleDeleteMushafPack, mushafDeleteTarget]);

  const goBack = React.useCallback(() => {
    if (onSubPanelBack) {
      onSubPanelBack();
      return;
    }
    closePanel();
  }, [closePanel, onSubPanelBack]);

  const handleActiveTabChange = React.useCallback(
    (nextTab: SettingsTab) => {
      if (nextTab === 'mushaf' && !settings.mushafId && panel.type === 'root') {
        if (onOpenMushafManager) {
          onOpenMushafManager();
          return;
        }
        animationTokenRef.current += 1;
        navProgress.stopAnimation();
        selectLayer('mushaf');
        navProgress.setValue(1);
        setPanel({ type: 'mushaf' });
      }
      // A controlled tab switches the reader view and closes the sidebar, so keep
      // the current panel on screen instead of flashing the other tab while it hides.
      if (!activeTabOverride || !onTabChange) setActiveTab(nextTab);
      onTabChange?.(nextTab);
    },
    [
      activeTabOverride,
      navProgress,
      onOpenMushafManager,
      onTabChange,
      panel.type,
      selectLayer,
      settings.mushafId,
    ]
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
      title={t('tafsir_setting')}
      icon={<BookOpenText color={palette.tint} size={20} strokeWidth={2.25} />}
      isOpen={isTafsirOpen}
      onToggle={() => setIsTafsirOpen((v) => !v)}
    >
      <View className="gap-5">
        <SelectionBox
          label={t('select_tafsir')}
          value={selectedTafsirName || t('select_tafsir')}
          onPress={() => openPanel('tafsir')}
        />
        <FontSizeSlider
          label={t('tafsir_font_size')}
          value={settings.tafsirFontSize || 18}
          min={12}
          max={48}
          onChange={setTafsirFontSize}
        />
      </View>
    </CollapsibleSection>
  ) : null;

  const isSubPanel = panel.type !== 'root';
  const subPanelLayer = getSubPanelLayer(panel.type);
  // Once the drawer settles, the resource lists mount offscreen in their own layers
  // so their first open neither builds nor swaps anything. A direct mushaf manager
  // open never shows the root, so it skips them.
  const shouldWarmResourceLists = dataEnabled && !hideRootWhenSubPanel;
  const isTranslationsLayerMounted = subPanelLayer === 'translations' || shouldWarmResourceLists;
  const isTafsirLayerMounted =
    subPanelLayer === 'tafsir' || (shouldWarmResourceLists && showTafsirSetting);
  const otherPanelType =
    subPanelLayer === 'other' && panel.type !== 'root' ? panel.type : null;

  // Memoized so a re-render mid-slide keeps the native driver attached to the same nodes.
  const layerStyles = React.useMemo(() => {
    const build = (layer: SubPanelLayer) => {
      const progress = Animated.multiply(navProgress, layerSelection[layer]);
      return {
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [panelWidth, 0],
            }),
          },
        ],
      };
    };
    return {
      translations: build('translations'),
      tafsir: build('tafsir'),
      other: build('other'),
    } satisfies Record<SubPanelLayer, unknown>;
  }, [layerSelection, navProgress, panelWidth]);
  const rootTranslateX = navProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -22],
  });
  const rootOpacity = navProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9],
  });

  const otherPanelTitle =
    otherPanelType === 'word-language'
      ? t('word_by_word_language')
      : otherPanelType === 'arabic-font'
        ? t('select_font_face')
      : otherPanelType === 'ui-language'
        ? t('language_setting')
      : t('mushaf');

  const renderSubPanelLayer = (layer: SubPanelLayer, content: React.ReactNode) => {
    const isActive = subPanelLayer === layer;
    return (
      <Animated.View
        key={layer}
        accessibilityElementsHidden={!isActive}
        importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
        pointerEvents={isActive ? 'auto' : 'none'}
        style={[styles.subPanel, { backgroundColor: palette.background }, layerStyles[layer]]}
      >
        {content}
      </Animated.View>
    );
  };

  const translationsPanel = (
    <View className="flex-1">
      <SettingsPanelHeader title={t('manage_translations')} onBack={goBack} onClose={onClose} />
      <ManageTranslationsPanel
        translations={translationRecords}
        orderedSelection={settings.translationIds ?? []}
        onChangeSelection={setTranslationIds}
        isLoading={isTranslationResourcesLoading}
        errorMessage={translationResourcesError}
        onRefresh={refreshTranslationResources}
        isActive={subPanelLayer === 'translations'}
      />
    </View>
  );

  const tafsirPanel = (
    <View className="flex-1">
      <SettingsPanelHeader title={t('tafsir_panel_title')} onBack={goBack} onClose={onClose} />
      <TafsirSelectionPanel isActive={dataEnabled && subPanelLayer === 'tafsir'} />
    </View>
  );

  const otherPanel = (
    <View className="flex-1">
      <SettingsPanelHeader title={otherPanelTitle} onBack={goBack} onClose={onClose} />

      <View className="flex-1">
        {otherPanelType === 'word-language' ? (
          <FlatList
            data={WORD_LANGUAGE_ITEMS}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            renderItem={({ item }) => {
              const key = getDownloadKey({ kind: 'word-translation', languageCode: item.code });
              const downloadItem = itemsByKey.get(key);
              return (
                <View style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
                  <WordLanguageResourceRow
                    item={item}
                    downloadSize={formatDownloadSize(getBundledWordTranslationDownloadSizeBytes(item.code))}
                    downloadItem={downloadItem}
                    isSelected={item.code === displayWordLang && downloadItem?.status === 'installed'}
                    isBusy={busyWordLangCodes.has(item.code)}
                    isDark={isDark}
                    tintColor={palette.tint}
                    onToggle={handleSelectWordLanguage}
                    onPressDownload={handlePressDownloadWordLanguage}
                    onPressDelete={handlePressDeleteWordLanguage}
                    onCancelDownload={handleCancelWordDownload}
                  />
                </View>
              );
            }}
          />
        ) : null}

        {otherPanelType === 'arabic-font' ? (
          <FlatList
            data={arabicFontItems}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            ListHeaderComponent={
              <View className="px-4 pb-3">
                <ArabicFontFilterToggle activeFilter={arabicFontFilter} onChange={setArabicFontFilter} />
                <View
                  className="mt-3 items-center px-4 pb-4 pt-2"
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(51,65,85,0.2)' : 'rgba(229,231,235,0.3)',
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Text
                    className="text-center"
                    style={[
                      styles.arabicFontPreviewText,
                      {
                        color: palette.text,
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
              <View style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
                <ResourceItem
                  item={item}
                  isSelected={item.value === settings.arabicFontFace}
                  onToggle={handleSelectArabicFont}
                />
              </View>
            )}
          />
        ) : null}

        {otherPanelType === 'ui-language' ? (
          <FlatList
            data={UI_LANGUAGE_ITEMS}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
                <ResourceItem
                  item={item}
                  isSelected={item.code === (settings.uiLanguage ?? 'en')}
                  onToggle={handleSelectUiLanguage}
                />
              </View>
            )}
          />
        ) : null}

        {otherPanelType === 'mushaf' ? (
          // Six fixed cards: render them in one pass. Virtualized batches popped cards in
          // during the slide on slower phones, and the content height kept changing.
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 24 }}
          >
            {mushafPackManagerError ? (
              <View className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 dark:border-error-dark/30 dark:bg-error-dark/10">
                <Text className="text-xs leading-5 text-error dark:text-error-dark">
                  {mushafPackManagerError}
                </Text>
                <View className="mt-3 flex-row">
                  <Pressable
                    onPress={refreshMushafPacks}
                    className="rounded-full px-4 py-2"
                    style={({ pressed }) => ({
                      backgroundColor: palette.interactive,
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <Text className="text-xs font-semibold" style={{ color: palette.text }}>
                      Retry
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {mushafPackEntries.map((item) => {
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
                        void handleInstallMushafPack(item.option.id);
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
                  key={item.option.id}
                  packId={item.option.id}
                  title={item.option.name}
                  downloadProgress={effectiveMushafProgress}
                  downloadStatus={effectiveMushafStatus}
                  downloadSize={
                    !isSelectable && !isDownloading && item.isInstallImplemented
                      ? formatDownloadSize(getBundledMushafDownloadSizeBytes(item.option.id))
                      : null
                  }
                  description={item.option.description}
                  statusLabel={item.statusLabel}
                  progressLabel={item.progressLabel}
                  errorMessage={item.errorMessage}
                  sourceLabel={item.definition?.sourceLabel ?? null}
                  isSelected={item.isSelected}
                  isStatusPending={!isMushafPackStatusKnown}
                  primaryAction={primaryAction}
                  secondaryAction={secondaryAction}
                />
              );
            })}
          </ScrollView>
        ) : null}

      </View>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: palette.background }}>
      {!isSubPanel || (!hideRootWhenSubPanel && isRootContentMounted) ? (
        <Animated.View
          accessibilityElementsHidden={isSubPanel}
          importantForAccessibility={isSubPanel ? 'no-hide-descendants' : 'auto'}
          style={{ flex: 1, opacity: rootOpacity, transform: [{ translateX: rootTranslateX }] }}
          pointerEvents={isSubPanel ? 'none' : 'auto'}
        >
          <View className="flex-1">
          <View
            style={[styles.header, { borderBottomColor: `${palette.border}66` }]}
            className="border-b"
          >
            <View style={styles.headerSide} />
            <View style={styles.headerTitleWrap}>
              <Text
                className="text-lg font-semibold"
                numberOfLines={1}
                style={{ color: palette.text }}
              >
                {t('settings')}
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
          <View
            className="border-b px-4 py-3"
            style={{ borderBottomColor: `${palette.border}66` }}
          >
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
                          title={t('reading_setting')}
                          icon={<Wand2 color={palette.tint} size={20} strokeWidth={2.25} />}
                          isOpen={isReadingOpen}
                          onToggle={() => setIsReadingOpen((v) => !v)}
                        >
                          <View className="gap-4">
                            <ToggleRow label={t('night_mode')} value={isDark} onChange={setDarkModeEnabled} />
                            <SelectionBox
                              label={t('translations')}
                              value={selectedTranslationName || t('no_translation_selected')}
                              onPress={() => openPanel('translations')}
                            />
                            <ToggleRow
                              disabled={isDownloadIndexLoading}
                              label={t('show_word_by_word')}
                              value={displayShowByWords}
                              onChange={handleShowByWordsChange}
                            />
                            <SelectionBox
                              label={t('word_by_word_language')}
                              value={selectedWordLanguageName || t('select_language')}
                              onPress={() => openPanel('word-language')}
                            />
                            <ToggleRow
                              disabled={isTajweedDownloading}
                              label={t('apply_tajweed')}
                              value={displayTajweed}
                              rightElement={tajweedToggleAccessory}
                              onChange={toggleTajweed}
                            />
                          </View>
                        </CollapsibleSection>

                        {pageType !== 'tafsir' ? tafsirSection : null}

                        <CollapsibleSection
                          title={t('font_setting')}
                          icon={<Type color={palette.tint} size={20} strokeWidth={2.25} />}
                          isOpen={isFontOpen}
                          onToggle={() => setIsFontOpen((v) => !v)}
                        >
                          <View className="gap-5">
                            <FontSizeSlider
                              label={t('arabic_font_size')}
                              value={settings.arabicFontSize}
                              min={18}
                              max={60}
                              onChange={setArabicFontSize}
                            />
                            <FontSizeSlider
                              label={t('translation_font_size')}
                              value={settings.translationFontSize}
                              min={12}
                              max={36}
                              onChange={setTranslationFontSize}
                            />
                            <SelectionBox
                              label={t('arabic_font_face')}
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
                          <View className="min-w-0 flex-1 flex-row items-center gap-3">
                            <Download color={palette.tint} size={20} strokeWidth={2.25} />
                            <View className="min-w-0 flex-1">
                              <Text
                                numberOfLines={1}
                                className="text-base font-semibold"
                                style={{ color: palette.text }}
                              >
                                {t('manage_downloads')}
                              </Text>
                            </View>
                          </View>
                          {downloadedResourceSizeLabel ? (
                            <View
                              className="rounded-full border border-border/20 bg-interactive px-2.5 py-0.5 dark:border-border-dark/10 dark:bg-surface-navigation-dark"
                              style={{ flexShrink: 0 }}
                            >
                              <Text className="text-[10px] font-bold text-muted dark:text-muted-dark">
                                {downloadedResourceSizeLabel}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>

                        <Pressable
                          onPress={() => openPanel('ui-language')}
                          className="flex-row items-center justify-between gap-3 rounded-2xl px-2 py-3 mt-1"
                          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                        >
                          <View className="flex-row items-center gap-3">
                            <Globe color={palette.tint} size={20} strokeWidth={2.25} />
                            <Text
                              className="text-base font-semibold"
                              style={{ color: palette.text }}
                            >
                              {t('language_setting')}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <Text className="text-sm" style={{ color: palette.muted }}>
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
                  <SelectionBox label={t('mushaf')} value={selectedMushafName} onPress={() => openPanel('mushaf')} />
                  <FontSizeSlider
                    label={t('mushaf_font_size')}
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
      ) : null}

      {isTranslationsLayerMounted ? renderSubPanelLayer('translations', translationsPanel) : null}
      {isTafsirLayerMounted ? renderSubPanelLayer('tafsir', tafsirPanel) : null}
      {otherPanelType ? renderSubPanelLayer('other', otherPanel) : null}

      <ResourceConfirmModal
        visible={mushafDownloadTarget !== null}
        title="Download mushaf pack?"
        resourceName={mushafDownloadTarget?.option.name ?? null}
        detailLabel={mushafDownloadDetailLabel}
        confirmLabel="Download"
        mutedColor={palette.muted}
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
        confirmLabel="Delete"
        confirmTone="danger"
        mutedColor={palette.muted}
        onConfirm={handleConfirmMushafPackDelete}
        onClose={() => setMushafDeleteTargetId(null)}
      />

      <ResourceConfirmModal
        visible={wordDownloadTarget !== null}
        title="Download word-by-word pack?"
        resourceName={wordDownloadTarget?.name ?? null}
        detailLabel={wordDownloadSizeLabel}
        confirmLabel="Download and use"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDownloadWordLanguage}
        onClose={() => {
          if (enableWordByWordAfterDownloadRef.current === wordDownloadTarget?.code) {
            enableWordByWordAfterDownloadRef.current = null;
          }
          setWordDownloadTarget(null);
        }}
      />

      <ResourceConfirmModal
        visible={wordDeleteTarget !== null}
        title="Delete download?"
        resourceName={wordDeleteTarget?.name ?? null}
        confirmLabel="Delete"
        confirmTone="danger"
        mutedColor={palette.muted}
        onConfirm={handleConfirmDeleteWordLanguage}
        onClose={() => setWordDeleteTarget(null)}
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
