import React from 'react';
import { Text, View } from 'react-native';

import { useUiTranslation } from '@/providers/UiLanguageContext';

import type { Chapter } from '@/types';

import { SurahSelector } from './SurahSelector';
import { VerseSelector, type VerseSelectorHandle } from './VerseSelector';

function buildVerseOptions(
  versesCount: number | undefined,
  formatNumber: (value: number) => string
): { value: number; label: string }[] {
  if (!versesCount || versesCount <= 0) return [];
  return Array.from({ length: versesCount }, (_, index) => {
    const verseNumber = index + 1;
    return { value: verseNumber, label: formatNumber(verseNumber) };
  });
}

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
  hideLabels = false,
  dropdownVisualOffset,
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
  hideLabels?: boolean;
  dropdownVisualOffset?: number;
}): React.JSX.Element {
  const { t, formatNumber } = useUiTranslation();
  const surahOptions = React.useMemo(() => {
    return chapters.map((chapter) => ({
      value: chapter.id,
      label: `${formatNumber(chapter.id)} • ${t(`surah_names.${chapter.id}`, { fallback: chapter.name_simple })}`,
      searchLabel: `${chapter.id} ${chapter.name_simple} ${t(`surah_names.${chapter.id}`, { fallback: chapter.name_simple })}`.toLowerCase(),
    }));
  }, [chapters, formatNumber, t]);

  const activeChapter = React.useMemo(
    () => (selectedSurah && !hideVerse ? chapters.find((c) => c.id === selectedSurah) : undefined),
    [chapters, hideVerse, selectedSurah]
  );

  const verseOptions = React.useMemo(
    () => buildVerseOptions(activeChapter?.verses_count, formatNumber),
    [activeChapter?.verses_count, formatNumber]
  );

  const surahPlaceholder = isLoading && chapters.length === 0 ? t('loading_surah') : t('select_surah');
  const versePlaceholder = isLoading ? t('loading') : t('select_verse');
  const disabledVersePlaceholder = isLoading ? t('loading') : t('select_surah');
  const verseSelectorRef = React.useRef<VerseSelectorHandle>(null);
  const shouldAdvanceToVerseRef = React.useRef(false);
  const openVerseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScheduledVerseOpen = React.useCallback(() => {
    if (openVerseTimeoutRef.current !== null) {
      clearTimeout(openVerseTimeoutRef.current);
      openVerseTimeoutRef.current = null;
    }
  }, []);

  const scheduleVerseOpen = React.useCallback(() => {
    clearScheduledVerseOpen();
    // Wait for the Surah selector modal to fully close and layout to settle before measuring
    openVerseTimeoutRef.current = setTimeout(() => {
      openVerseTimeoutRef.current = null;
      verseSelectorRef.current?.openDropdown();
    }, 180);
  }, [clearScheduledVerseOpen]);

  const handleSurahSelectionComplete = React.useCallback(
    (surahId: number) => {
      if (hideVerse) return;
      shouldAdvanceToVerseRef.current = true;
      if (selectedSurah === surahId && verseOptions.length > 0 && !isLoading) {
        shouldAdvanceToVerseRef.current = false;
        scheduleVerseOpen();
      }
    },
    [hideVerse, isLoading, scheduleVerseOpen, selectedSurah, verseOptions.length]
  );

  React.useEffect(() => {
    if (hideVerse || !shouldAdvanceToVerseRef.current) return;
    if (!selectedSurah || verseOptions.length === 0 || isLoading) return;
    shouldAdvanceToVerseRef.current = false;
    scheduleVerseOpen();
  }, [hideVerse, isLoading, scheduleVerseOpen, selectedSurah, verseOptions.length]);

  React.useEffect(() => clearScheduledVerseOpen, [clearScheduledVerseOpen]);

  return (
    <View className="flex-row gap-3">
      <View style={{ flex: hideVerse ? 1 : 3 }}>
        {!hideLabels ? (
          <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
            {surahLabel}
          </Text>
        ) : null}
        <SurahSelector
          options={surahOptions}
          selectedValue={selectedSurah}
          onSelect={onSelectSurah}
          placeholder={surahPlaceholder}
          dropdownVisualOffset={dropdownVisualOffset}
          onSelectionComplete={handleSurahSelectionComplete}
          returnKeyType={hideVerse ? 'done' : 'next'}
        />
      </View>

      {!hideVerse ? (
        <View style={{ flex: 2 }}>
          {!hideLabels ? (
            <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
              {verseLabel}
            </Text>
          ) : null}
          <VerseSelector
            ref={verseSelectorRef}
            options={verseOptions}
            selectedValue={selectedVerse}
            onSelect={(verseNumber) => onSelectVerse?.(verseNumber)}
            disabled={!selectedSurah || verseOptions.length === 0 || isLoading}
            placeholder={versePlaceholder}
            disabledPlaceholder={disabledVersePlaceholder}
            dropdownVisualOffset={dropdownVisualOffset}
            returnKeyType="done"
          />
        </View>
      ) : null}
    </View>
  );
}
