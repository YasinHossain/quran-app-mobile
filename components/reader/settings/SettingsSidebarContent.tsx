import { ArrowLeft, BookOpenText, Globe, Type, Wand2 } from 'lucide-react-native';
import React from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { DEFAULT_MUSHAF_ID, TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import Colors from '@/constants/Colors';
import { MushafPackOptionCard } from '@/components/reader/settings/MushafPackOptionCard';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useMushafPackManager } from '@/hooks/useMushafPackManager';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { CollapsibleSection } from './CollapsibleSection';
import { FontSizeSlider } from './FontSizeSlider';
import { ManageTafsirsPanel } from './ManageTafsirsPanel';
import { ManageTranslationsPanel } from './ManageTranslationsPanel';
import { SelectionBox } from './SelectionBox';
import { ResourceItem } from './resource-panel/ResourceItem';
import { capitalizeLanguageName, type ResourceRecord } from './resource-panel/resourcePanel.utils';
import { SettingsTabToggle, type SettingsTab } from './SettingsTabToggle';
import { ToggleRow } from './ToggleRow';
import { ArabicFontFilterToggle, type ArabicFontFilter } from './ArabicFontFilterToggle';

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

const WORD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
] as const;

const UI_LANGUAGES = WORD_LANGUAGES;

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

export function SettingsSidebarContent({
  onClose,
  showTafsirSetting = false,
  pageType,
  activeTabOverride,
  onTabChange,
}: {
  onClose?: () => void;
  showTafsirSetting?: boolean;
  pageType?: 'verse' | 'tafsir' | 'bookmarks';
  activeTabOverride?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}): React.JSX.Element {
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
  const [panel, setPanel] = React.useState<Panel>({ type: 'root' });
  const [isReadingOpen, setIsReadingOpen] = React.useState(true);
  const [isTafsirOpen, setIsTafsirOpen] = React.useState(showTafsirSetting && pageType === 'tafsir');
  const [isFontOpen, setIsFontOpen] = React.useState(true);
  const [arabicFontFilter, setArabicFontFilter] = React.useState<ArabicFontFilter>('Uthmani');

  const previousMushafIdRef = React.useRef<MushafPackId | undefined>(settings.mushafId);

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
  const selectedArabicFontName =
    arabicFonts.find((f) => f.value === settings.arabicFontFace)?.name ?? 'KFGQ';
  const selectedUiLanguageName = getUiLanguageName(settings.contentLanguage);
  const selectedMushafName =
    findMushafOption(settings.mushafId)?.name ?? findMushafOption(DEFAULT_MUSHAF_ID)?.name ?? 'Uthmani Unicode';
  const {
    entries: mushafPackEntries,
    isLoading: isMushafPackManagerLoading,
    errorMessage: mushafPackManagerError,
    installPack,
    deletePack,
    refresh: refreshMushafPacks,
  } = useMushafPackManager({
    selectedPackId: settings.mushafId ?? DEFAULT_MUSHAF_ID,
  });
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
        previousMushafIdRef.current = settings.mushafId;
        setSettings({ ...settings, tajweed: true, mushafId: TAJWEED_MUSHAF_ID });
      } else {
        setSettings({
          ...settings,
          tajweed: false,
          mushafId: previousMushafIdRef.current,
        });
      }
    },
    [setSettings, settings]
  );

  const applyMushafSelection = React.useCallback(
    (packId: MushafPackId) => {
      setSettings({
        ...settings,
        mushafId: packId,
        tajweed: packId === TAJWEED_MUSHAF_ID,
      });
    },
    [setSettings, settings]
  );

  const handleInstallMushafPack = React.useCallback(
    async (packId: MushafPackId) => {
      try {
        await installPack(packId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Install failed', message);
      }
    },
    [installPack]
  );

  const handleDeleteMushafPack = React.useCallback(
    (packId: MushafPackId) => {
      const option = findMushafOption(packId);
      if (!option) return;

      Alert.alert(
        'Delete mushaf download?',
        `This removes ${option.name} from local storage.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await deletePack(packId);
                  if (settings.mushafId === packId) {
                    applyMushafSelection(DEFAULT_MUSHAF_ID);
                  }
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  Alert.alert('Delete failed', message);
                }
              })();
            },
          },
        ]
      );
    },
    [applyMushafSelection, deletePack, settings.mushafId]
  );

  const goBack = React.useCallback(() => setPanel({ type: 'root' }), []);

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

  if (panel.type !== 'root') {
    const title =
      panel.type === 'translations'
        ? 'Manage Translations'
        : panel.type === 'tafsir'
          ? 'Manage Tafsirs'
        : panel.type === 'word-language'
          ? 'Word-by-word Language'
        : panel.type === 'arabic-font'
            ? 'Arabic Font Selection'
            : panel.type === 'ui-language'
              ? 'Language'
              : 'Mushaf';

    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-row items-center gap-3 border-b border-border/30 dark:border-border-dark/20 px-4 py-3">
          <Pressable onPress={goBack} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ArrowLeft color={palette.text} size={20} strokeWidth={2.25} />
          </Pressable>
          <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
            {title}
          </Text>
          <View className="flex-1" />
          {onClose ? (
            <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Close</Text>
            </Pressable>
          ) : null}
        </View>

        {panel.type === 'translations' ? (
          <ManageTranslationsPanel
            translations={translationRecords}
            orderedSelection={settings.translationIds ?? []}
            onChangeSelection={setTranslationIds}
            isLoading={isTranslationResourcesLoading}
            errorMessage={translationResourcesError}
            onRefresh={refreshTranslationResources}
          />
        ) : null}

        {panel.type === 'tafsir' ? (
          <ManageTafsirsPanel
            tafsirs={tafsirRecords}
            orderedSelection={settings.tafsirIds ?? []}
            onChangeSelection={setTafsirIds}
            isLoading={isTafsirResourcesLoading}
            errorMessage={tafsirResourcesError}
            onRefresh={refreshTafsirResources}
            languageSort={tafsirLanguageSort}
          />
        ) : null}

        {panel.type === 'word-language' ? (
          <FlatList
            data={WORD_LANGUAGE_ITEMS}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View className="px-4 py-1">
                <ResourceItem
                  item={item}
                  isSelected={item.code === settings.wordLang}
                  onToggle={handleSelectWordLanguage}
                />
              </View>
            )}
          />
        ) : null}

        {panel.type === 'arabic-font' ? (
          <FlatList
            data={arabicFontItems}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ paddingVertical: 12, paddingBottom: 20 }}
            ListHeaderComponent={
              <View className="pb-2">
                <ArabicFontFilterToggle
                  activeFilter={arabicFontFilter}
                  onChange={setArabicFontFilter}
                />
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
              const isSelectable = item.isInstalled || item.isBundled;
              const primaryAction = isSelectable
                ? {
                    label: item.isSelected ? 'Selected' : 'Use',
                    onPress: () => {
                      applyMushafSelection(item.option.id);
                      setPanel({ type: 'root' });
                    },
                    disabled: item.isSelected || item.isBusy,
                    tone: item.isSelected ? ('default' as const) : ('accent' as const),
                  }
                : item.isInstallImplemented
                  ? {
                      label: item.downloadItem?.status === 'failed' ? 'Retry install' : 'Install',
                      onPress: () => {
                        void handleInstallMushafPack(item.option.id);
                      },
                      disabled: item.isBusy,
                      tone: 'accent' as const,
                    }
                  : {
                      label: 'Coming soon',
                      onPress: () => undefined,
                      disabled: true,
                    };

              const secondaryAction =
                item.isInstalled && !item.isBundled
                  ? {
                      label: 'Delete',
                      onPress: () => handleDeleteMushafPack(item.option.id),
                      disabled: item.isBusy,
                      tone: 'danger' as const,
                    }
                  : undefined;

              return (
                <MushafPackOptionCard
                  title={item.option.name}
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
        ) : null}
      </View>
    );
  }

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
          onPress={() => setPanel({ type: 'tafsir' })}
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

  return (
      <View className="flex-1">
      <View className="border-b border-border/30 dark:border-border-dark/20 px-4 py-3">
        <SettingsTabToggle activeTab={activeTab} onTabChange={handleActiveTabChange} />
      </View>

      <View className="flex-1 px-3 py-3">
        {activeTab === 'translations' ? (
          <View className="flex-1">
            <View className="flex-1">
              <FlatList
                data={[{ key: 'content' }]}
                keyExtractor={(item) => item.key}
                contentContainerStyle={{ padding: 8, gap: 14 }}
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
                          onPress={() => setPanel({ type: 'translations' })}
                        />
                        <ToggleRow
                          label="Show Word-by-Word"
                          value={settings.showByWords}
                          onChange={(next) => setSettings({ ...settings, showByWords: next })}
                        />
                        <SelectionBox
                          label="Word-by-word Language"
                          value={selectedWordLanguageName || 'Select'}
                          onPress={() => setPanel({ type: 'word-language' })}
                        />
                        <ToggleRow label="Tajweed Colors" value={settings.tajweed} onChange={toggleTajweed} />
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
                          onPress={() => setPanel({ type: 'arabic-font' })}
                        />
                      </View>
                    </CollapsibleSection>

                    <Pressable
                      onPress={() => setPanel({ type: 'ui-language' })}
                      className="flex-row items-center justify-between gap-3 rounded-2xl px-2 py-3"
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
            <View className="gap-4 p-2">
              <SelectionBox label="Mushaf" value={selectedMushafName} onPress={() => setPanel({ type: 'mushaf' })} />
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
  );
}
