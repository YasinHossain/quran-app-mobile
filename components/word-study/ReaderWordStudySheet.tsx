import { useRouter } from 'expo-router';
import React from 'react';
import { Share } from 'react-native';

import { WordQuickSheet } from './WordQuickSheet';
import type { WordStudyPressEvent } from './WordStudyPressEvent';
import { stageWordStudyNavigationHandoff } from './full-study/wordStudyNavigationHandoff';
import type { WordQuickSheetController } from './useWordQuickSheetController';

type WordAudioAction = (location: { verseKey: string; wordPosition: number }) => void;

export function ReaderWordStudySheet({
  controller,
  resolveSurahName,
  playWord,
  playVerseFromWord,
}: {
  controller: WordQuickSheetController;
  resolveSurahName: (surahId: number) => string;
  playWord: WordAudioAction;
  playVerseFromWord: WordAudioAction;
}): React.JSX.Element {
  const router = useRouter();
  const selectedLocation = controller.event;
  const surahId = getSurahId(selectedLocation);
  const surahName = surahId ? resolveSurahName(surahId) : 'Surah';

  const handlePlayWord = React.useCallback(() => {
    if (selectedLocation) playWord(selectedLocation);
  }, [playWord, selectedLocation]);

  const handlePlayVerseFromWord = React.useCallback(() => {
    if (selectedLocation) playVerseFromWord(selectedLocation);
  }, [playVerseFromWord, selectedLocation]);

  const handleShare = React.useCallback(async () => {
    if (!selectedLocation) return;
    const analysis =
      controller.loadState.status === 'ready' ? controller.loadState.analysis : null;
    const gloss = analysis?.contextualGlosses.find((item) => item.languageCode === 'en')?.text;
    const lines = [
      `${surahName} ${selectedLocation.verseKey}:${selectedLocation.wordPosition}`,
      '',
      analysis?.surfaceUthmani ?? selectedLocation.surfaceText ?? '',
      ...(gloss ? ['', gloss] : []),
      '',
      'Word analysis: Quranic Arabic Corpus v0.4',
    ].filter((line, index, all) => line || all[index - 1] !== '');

    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Native share cancellation and unavailable targets need no reader error state.
    }
  }, [controller.loadState, selectedLocation, surahName]);

  const handleOpenFullStudy = React.useCallback(() => {
    if (!selectedLocation) return;
    const [surah, ayah] = selectedLocation.verseKey.split(':');
    if (!surah || !ayah) return;
    const selectedAnalysis =
      controller.loadState.status === 'ready' ? controller.loadState.analysis : undefined;
    stageWordStudyNavigationHandoff(selectedLocation, selectedAnalysis);
    router.push(`/study/word/${surah}/${ayah}/${selectedLocation.wordPosition}` as never);
  }, [controller.loadState, router, selectedLocation]);

  return (
    <WordQuickSheet
      isOpen={controller.isOpen}
      event={controller.event}
      loadState={controller.loadState}
      surahName={surahName}
      onClose={controller.close}
      onRetry={controller.retry}
      onPresented={controller.reportPresented}
      onPlayWord={handlePlayWord}
      onPlayVerseFromHere={handlePlayVerseFromWord}
      onShare={handleShare}
      onOpenFullStudy={handleOpenFullStudy}
    />
  );
}

function getSurahId(event: WordStudyPressEvent | null): number | null {
  const [surahPart] = event?.verseKey.split(':') ?? [];
  const parsed = Number.parseInt(surahPart ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}
