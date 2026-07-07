import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Chapter } from '@/types';

import { SurahVersePickerSheet } from './SurahVersePickerSheet';

export function SurahVerseSelectorRow({
  chapters,
  isLoading = false,
  surahLabel = 'Surah',
  verseLabel = 'Verse',
  selectedSurah,
  selectedVerse,
  onSelectSurah,
  onSelectVerse,
  hideVerse = false,
}: {
  chapters: Chapter[];
  isLoading?: boolean;
  surahLabel?: string;
  verseLabel?: string;
  selectedSurah: number | undefined;
  selectedVerse: number | undefined;
  onSelectSurah: (surahId: number) => void;
  onSelectVerse?: (verseNumber: number) => void;
  hideVerse?: boolean;
  dropdownVisualOffset?: number;
}): React.JSX.Element {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [initialFocus, setInitialFocus] = React.useState<'surah' | 'verse'>('surah');

  const surahPlaceholder = isLoading && chapters.length === 0 ? 'Loading surahs…' : 'Select Surah';
  const versePlaceholder = isLoading ? 'Loading…' : 'Select Verse';
  const disabledVersePlaceholder = isLoading ? 'Loading…' : 'Select Surah first';

  const selectedSurahLabel = React.useMemo(() => {
    if (!selectedSurah) return '';
    const chapter = chapters.find((item) => item.id === selectedSurah);
    return chapter ? `${chapter.id} • ${chapter.name_simple}` : `Surah ${selectedSurah}`;
  }, [chapters, selectedSurah]);

  const selectedVerseLabel = React.useMemo(() => {
    if (!selectedVerse) return '';
    return String(selectedVerse);
  }, [selectedVerse]);

  const canOpen = !isLoading || chapters.length > 0;
  const openPicker = React.useCallback((focus: 'surah' | 'verse') => {
    if (!canOpen) return;
    setInitialFocus(focus);
    setIsPickerOpen(true);
  }, [canOpen]);

  return (
    <>
      <View className="flex-row gap-3">
        <SelectorField
          label={surahLabel}
          value={selectedSurahLabel}
          placeholder={surahPlaceholder}
          disabled={!canOpen}
          flex={hideVerse ? 1 : 3}
          accessibilityLabel={`Select ${surahLabel}`}
          onPress={() => openPicker('surah')}
        />

        {!hideVerse ? (
          <SelectorField
            label={verseLabel}
            value={selectedVerseLabel}
            placeholder={selectedSurah ? versePlaceholder : disabledVersePlaceholder}
            disabled={!canOpen}
            flex={2}
            accessibilityLabel={`Select ${verseLabel}`}
            onPress={() => openPicker(selectedSurah ? 'verse' : 'surah')}
          />
        ) : null}
      </View>

      <SurahVersePickerSheet
        isOpen={isPickerOpen}
        chapters={chapters}
        isLoading={isLoading}
        hideVerse={hideVerse}
        selectedSurah={selectedSurah}
        selectedVerse={selectedVerse}
        surahLabel={surahLabel}
        verseLabel={verseLabel}
        initialFocus={initialFocus}
        onClose={() => setIsPickerOpen(false)}
        onApply={({ surahId, verseNumber }) => {
          onSelectSurah(surahId);
          if (!hideVerse && typeof verseNumber === 'number') {
            onSelectVerse?.(verseNumber);
          }
        }}
      />
    </>
  );
}

function SelectorField({
  label,
  value,
  placeholder,
  disabled,
  flex,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  flex: number;
  accessibilityLabel: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View style={{ flex }}>
      <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={[
          'min-h-[42px] justify-center rounded-lg border border-border/50 bg-interactive px-3 dark:border-border-dark/40 dark:bg-interactive-dark',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
        style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
      >
        <Text
          numberOfLines={1}
          className={value ? 'text-sm text-foreground dark:text-foreground-dark' : 'text-sm text-muted dark:text-muted-dark'}
        >
          {value || placeholder}
        </Text>
      </Pressable>
    </View>
  );
}
