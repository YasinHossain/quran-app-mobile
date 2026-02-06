import { ArrowLeft, BookOpenText, Check, Globe, Type, Wand2 } from 'lucide-react-native';
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { TAJWEED_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import Colors from '@/constants/Colors';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { MUSHAF_OPTIONS } from '@/data/mushaf/options';
import type { Tafsir } from '@/src/core/domain/entities/Tafsir';

import { CollapsibleSection } from './CollapsibleSection';
import { FontSizeSlider } from './FontSizeSlider';
import { SelectionBox } from './SelectionBox';
import { SettingsTabToggle, type SettingsTab } from './SettingsTabToggle';
import { ToggleRow } from './ToggleRow';

type Panel =
  | { type: 'root' }
  | { type: 'translations' }
  | { type: 'tafsir' }
  | { type: 'word-language' }
  | { type: 'arabic-font' }
  | { type: 'ui-language' }
  | { type: 'mushaf' };

const TRANSLATIONS = [{ id: 20, name: 'Saheeh International' }] as const;

const WORD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
] as const;

const UI_LANGUAGES = WORD_LANGUAGES;

function getTranslationName(id: number | undefined): string {
  if (!id) return '';
  return TRANSLATIONS.find((t) => t.id === id)?.name ?? `Translation ${id}`;
}

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
}: {
  onClose?: () => void;
  showTafsirSetting?: boolean;
  pageType?: 'verse' | 'tafsir' | 'bookmarks';
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
  } = useSettings();
  const { resolvedTheme, setDarkModeEnabled, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const [activeTab, setActiveTab] = React.useState<SettingsTab>('translations');
  const [panel, setPanel] = React.useState<Panel>({ type: 'root' });
  const [isReadingOpen, setIsReadingOpen] = React.useState(true);
  const [isTafsirOpen, setIsTafsirOpen] = React.useState(showTafsirSetting && pageType === 'tafsir');
  const [isFontOpen, setIsFontOpen] = React.useState(true);

  const previousMushafIdRef = React.useRef<string | undefined>(settings.mushafId);

  const selectedTranslationName = getTranslationName(settings.translationIds?.[0] ?? settings.translationId);
  const selectedWordLanguageName = getLanguageName(settings.wordLang);
  const selectedArabicFontName =
    arabicFonts.find((f) => f.value === settings.arabicFontFace)?.name ?? 'KFGQ';
  const selectedUiLanguageName = getUiLanguageName(settings.contentLanguage);
  const selectedMushafName = findMushafOption(settings.mushafId)?.name ?? 'King Fahad Complex V1';

  const { tafsirs, tafsirById, isLoading: isTafsirResourcesLoading, errorMessage: tafsirResourcesError } =
    useTafsirResources({
      enabled: showTafsirSetting || panel.type === 'tafsir',
    });

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

  const goBack = React.useCallback(() => setPanel({ type: 'root' }), []);

  if (panel.type !== 'root') {
    const title =
      panel.type === 'translations'
        ? 'Translations'
        : panel.type === 'tafsir'
          ? 'Tafsir'
        : panel.type === 'word-language'
          ? 'Word-by-word Language'
          : panel.type === 'arabic-font'
            ? 'Arabic Font'
            : panel.type === 'ui-language'
              ? 'Language'
              : 'Mushaf';

    return (
      <View className="flex-1">
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
          <FlatList
            data={TRANSLATIONS}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setTranslationIds([item.id]);
                  setPanel({ type: 'root' });
                }}
                className={[
                  'rounded-xl border px-4 py-3',
                  'border-border/30 dark:border-border-dark/20',
                  'bg-interactive dark:bg-interactive-dark',
                ].join(' ')}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        ) : null}

        {panel.type === 'tafsir' ? (
          <TafsirPickerPanel
            tafsirs={tafsirs}
            tafsirIds={settings.tafsirIds ?? []}
            isLoading={isTafsirResourcesLoading}
            errorMessage={tafsirResourcesError}
            onToggle={(id) => {
              const current = settings.tafsirIds ?? [];
              const isSelected = current.includes(id);
              if (isSelected) {
                setTafsirIds(current.filter((x) => x !== id));
                return;
              }
              if (current.length >= 3) return;
              setTafsirIds([...current, id]);
            }}
          />
        ) : null}

        {panel.type === 'word-language' ? (
          <FlatList
            data={WORD_LANGUAGES}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setWordLang(item.code);
                  setPanel({ type: 'root' });
                }}
                className={[
                  'rounded-xl border px-4 py-3',
                  'border-border/30 dark:border-border-dark/20',
                  'bg-interactive dark:bg-interactive-dark',
                ].join(' ')}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        ) : null}

        {panel.type === 'arabic-font' ? (
          <FlatList
            data={arabicFonts}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setArabicFontFace(item.value);
                  setPanel({ type: 'root' });
                }}
                className={[
                  'rounded-xl border px-4 py-3',
                  'border-border/30 dark:border-border-dark/20',
                  'bg-interactive dark:bg-interactive-dark',
                ].join(' ')}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  {item.name}
                </Text>
                <Text className="mt-1 text-xs text-muted dark:text-muted-dark">{item.category}</Text>
              </Pressable>
            )}
          />
        ) : null}

        {panel.type === 'ui-language' ? (
          <FlatList
            data={UI_LANGUAGES}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setContentLanguage(item.code);
                  setPanel({ type: 'root' });
                }}
                className={[
                  'rounded-xl border px-4 py-3',
                  'border-border/30 dark:border-border-dark/20',
                  'bg-interactive dark:bg-interactive-dark',
                ].join(' ')}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        ) : null}

        {panel.type === 'mushaf' ? (
          <FlatList
            data={MUSHAF_OPTIONS}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setMushafId(item.id);
                  setPanel({ type: 'root' });
                }}
                className={[
                  'rounded-xl border px-4 py-3',
                  'border-border/30 dark:border-border-dark/20',
                  'bg-interactive dark:bg-interactive-dark',
                ].join(' ')}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  {item.name}
                </Text>
                <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                  {item.description}
                </Text>
              </Pressable>
            )}
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
        <SettingsTabToggle activeTab={activeTab} onTabChange={setActiveTab} />
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
                          value={selectedTranslationName || 'Select'}
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
              <Text className="text-xs text-muted dark:text-muted-dark">
                Mushaf rendering mode will be implemented next. This panel is UI-ready.
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function TafsirPickerPanel({
  tafsirs,
  tafsirIds,
  isLoading,
  errorMessage,
  onToggle,
}: {
  tafsirs: Tafsir[];
  tafsirIds: number[];
  isLoading: boolean;
  errorMessage: string | null;
  onToggle: (id: number) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const sorted = React.useMemo(() => {
    return [...tafsirs].sort((a, b) => {
      const aPriority = a.getLanguagePriority();
      const bPriority = b.getLanguagePriority();
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [tafsirs]);

  const limitReached = tafsirIds.length >= 3;

  if (errorMessage) {
    return (
      <View className="p-4">
        <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
      </View>
    );
  }

  if (isLoading && sorted.length === 0) {
    return (
      <View className="p-4">
        <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsir…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-4 pt-3 pb-2">
        <Text className="text-xs text-muted dark:text-muted-dark">
          Selected {tafsirIds.length}/3
        </Text>
        {limitReached ? (
          <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
            You can select up to 3 tafsirs.
          </Text>
        ) : null}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        renderItem={({ item }) => {
          const isSelected = tafsirIds.includes(item.id);
          const disabled = !isSelected && limitReached;

          return (
            <Pressable
              onPress={() => onToggle(item.id)}
              disabled={disabled}
              className={[
                'rounded-xl border px-4 py-3',
                'border-border/30 dark:border-border-dark/20',
                isSelected ? 'bg-accent/10' : 'bg-interactive dark:bg-interactive-dark',
                disabled ? 'opacity-50' : '',
              ].join(' ')}
              style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.9 : 1 })}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                    {item.displayName}
                  </Text>
                  <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                    {item.formattedLanguage}
                  </Text>
                </View>
                {isSelected ? (
                  <Check color={palette.tint} size={18} strokeWidth={2.75} />
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
