import React from 'react';
import { Text, View } from 'react-native';

import type { Chapter } from '@/types';

import { SurahSelector } from './SurahSelector';
import { VerseSelector } from './VerseSelector';

function buildVerseOptions(versesCount: number | undefined): { value: number; label: string }[] {
  if (!versesCount || versesCount <= 0) return [];
  return Array.from({ length: versesCount }, (_, index) => {
    const verseNumber = index + 1;
    return { value: verseNumber, label: String(verseNumber) };
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
}): React.JSX.Element {
  const surahOptions = React.useMemo(() => {
    return chapters.map((chapter) => ({
      value: chapter.id,
      label: `${chapter.id} • ${chapter.name_simple}`,
      searchLabel: `${chapter.id} ${chapter.name_simple}`.toLowerCase(),
    }));
  }, [chapters]);

  const activeChapter = React.useMemo(
    () => (selectedSurah && !hideVerse ? chapters.find((c) => c.id === selectedSurah) : undefined),
    [chapters, hideVerse, selectedSurah]
  );

  const verseOptions = React.useMemo(
    () => buildVerseOptions(activeChapter?.verses_count),
    [activeChapter?.verses_count]
  );

  const surahPlaceholder = isLoading && chapters.length === 0 ? 'Loading surahs…' : 'Select Surah';
  const versePlaceholder = isLoading ? 'Loading…' : 'Select Verse';
  const disabledVersePlaceholder = isLoading ? 'Loading…' : 'Select Surah first';

  return (
    <View className="flex-row gap-3">
      <View style={{ flex: hideVerse ? 1 : 3 }}>
        <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
          {surahLabel}
        </Text>
        <SurahSelector
          options={surahOptions}
          selectedValue={selectedSurah}
          onSelect={onSelectSurah}
          placeholder={surahPlaceholder}
        />
      </View>

      {!hideVerse ? (
        <View style={{ flex: 2 }}>
          <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
            {verseLabel}
          </Text>
          <VerseSelector
            options={verseOptions}
            selectedValue={selectedVerse}
            onSelect={(verseNumber) => onSelectVerse?.(verseNumber)}
            disabled={!selectedSurah || verseOptions.length === 0 || isLoading}
            placeholder={versePlaceholder}
            disabledPlaceholder={disabledVersePlaceholder}
          />
        </View>
      ) : null}
    </View>
  );
}

