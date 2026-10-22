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
  surahLabel,
  verseLabel,
  selectedSurah,
  selectedVerse,
  onSelectSurah,
  onSelectVerse,
  onSubmitVerse,
  hideVerse = false,
  hideLabels = false,
  autoAdvanceToVerse = true,
  floatingDropdown = false,
  onOpenChange,
  dismissRequest = 0,
  dismissKeyboardOnListTouch = false,
}: {
  chapters: Chapter[];
  isLoading?: boolean;
  surahLabel?: string;
  verseLabel?: string;
  selectedSurah: number | undefined;
  selectedVerse: number | undefined;
  onSelectSurah: (surahId: number) => void;
  onSelectVerse?: (verseNumber: number) => void;
  /** The verse keyboard's return key picked a verse. */
  onSubmitVerse?: (verseNumber: number) => void;
  hideVerse?: boolean;
  hideLabels?: boolean;
  autoAdvanceToVerse?: boolean;
  floatingDropdown?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  dismissRequest?: number;
  /** Hide the keyboard when a floating list is touched; only for selectors outside dialogs. */
  dismissKeyboardOnListTouch?: boolean;
}): React.JSX.Element {
  const { t, formatNumber } = useUiTranslation();
  const resolvedSurahLabel = surahLabel ?? t('surah_tab', { fallback: 'Surah' });
  const resolvedVerseLabel = verseLabel ?? t('verse', { fallback: 'Verse' });
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

  // The Surah selector keeps its input focused until the Verse input takes over, so the keyboard
  // switches to the number pad instead of hiding and showing again (which also dropped a dialog
  // to the centre and lifted it back).
  const openVerseSelector = React.useCallback(() => {
    verseSelectorRef.current?.openDropdown();
  }, []);

  const handleSurahSelectionComplete = React.useCallback(
    (surahId: number) => {
      if (hideVerse || !autoAdvanceToVerse) return false;
      shouldAdvanceToVerseRef.current = true;
      if (selectedSurah === surahId && verseOptions.length > 0 && !isLoading) {
        shouldAdvanceToVerseRef.current = false;
        openVerseSelector();
      }
      return true;
    },
    [autoAdvanceToVerse, hideVerse, isLoading, openVerseSelector, selectedSurah, verseOptions.length]
  );

  React.useEffect(() => {
    if (hideVerse || !autoAdvanceToVerse || !shouldAdvanceToVerseRef.current) return;
    if (!selectedSurah || verseOptions.length === 0 || isLoading) return;
    shouldAdvanceToVerseRef.current = false;
    openVerseSelector();
  }, [autoAdvanceToVerse, hideVerse, isLoading, openVerseSelector, selectedSurah, verseOptions.length]);

  // During the hand-off both selectors are briefly open; report the row as one.
  const openSelectorsRef = React.useRef({ surah: false, verse: false });
  const reportOpenChange = React.useCallback(
    (selector: 'surah' | 'verse', isOpen: boolean) => {
      const wasOpen = openSelectorsRef.current.surah || openSelectorsRef.current.verse;
      openSelectorsRef.current[selector] = isOpen;
      const nowOpen = openSelectorsRef.current.surah || openSelectorsRef.current.verse;
      if (nowOpen !== wasOpen) onOpenChange?.(nowOpen);
    },
    [onOpenChange]
  );
  const handleSurahOpenChange = React.useCallback(
    (isOpen: boolean) => reportOpenChange('surah', isOpen),
    [reportOpenChange]
  );
  const handleVerseOpenChange = React.useCallback(
    (isOpen: boolean) => reportOpenChange('verse', isOpen),
    [reportOpenChange]
  );

  return (
    <View className="flex-row gap-3">
      <View style={{ flex: hideVerse ? 1 : 3 }}>
        {!hideLabels ? (
          <Text className="mb-2 text-base font-semibold text-foreground dark:text-foreground-dark">
            {resolvedSurahLabel}
          </Text>
        ) : null}
        <SurahSelector
          options={surahOptions}
          selectedValue={selectedSurah}
          onSelect={onSelectSurah}
          placeholder={surahPlaceholder}
          onSelectionComplete={handleSurahSelectionComplete}
          returnKeyType={hideVerse ? 'done' : 'next'}
          floatingDropdown={floatingDropdown}
          onOpenChange={handleSurahOpenChange}
          dismissRequest={dismissRequest}
          dismissKeyboardOnListTouch={dismissKeyboardOnListTouch}
        />
      </View>

      {!hideVerse ? (
        <View style={{ flex: 2 }}>
          {!hideLabels ? (
            <Text className="mb-2 text-base font-semibold text-foreground dark:text-foreground-dark">
              {resolvedVerseLabel}
            </Text>
          ) : null}
          <VerseSelector
            ref={verseSelectorRef}
            options={verseOptions}
            selectedValue={selectedVerse}
            onSelect={(verseNumber) => onSelectVerse?.(verseNumber)}
            onSubmitSelection={onSubmitVerse}
            disabled={!selectedSurah || verseOptions.length === 0 || isLoading}
            placeholder={versePlaceholder}
            disabledPlaceholder={disabledVersePlaceholder}
            returnKeyType={onSubmitVerse ? 'go' : 'done'}
            floatingDropdown={floatingDropdown}
            onOpenChange={handleVerseOpenChange}
            dismissRequest={dismissRequest}
          dismissKeyboardOnListTouch={dismissKeyboardOnListTouch}
          />
        </View>
      ) : null}
    </View>
  );
}
