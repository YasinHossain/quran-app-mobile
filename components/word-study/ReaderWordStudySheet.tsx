import { useRouter } from 'expo-router';
import React from 'react';

import { WordQuickSheet, type WordQuickSheetTabs } from './WordQuickSheet';
import type { WordStudyPressEvent } from './WordStudyPressEvent';
import { stageWordStudyNavigationHandoff } from './full-study/wordStudyNavigationHandoff';
import type { ReaderStudySheetController } from './useReaderStudySheet';
import type { WordQuickSheetController } from './useWordQuickSheetController';
import {
  VerseActionsFooter,
  VerseTranslationContent,
  type StudySheetVerseActions,
} from './VerseTranslationPanel';

type WordAudioAction = (location: { verseKey: string; wordPosition: number }) => void;

export function ReaderWordStudySheet({
  controller,
  resolveSurahName,
  playWord,
  playVerseFromWord,
  studySheet,
  verseActions,
  onChooseTranslation,
}: {
  controller: WordQuickSheetController;
  resolveSurahName: (surahId: number) => string;
  playWord: WordAudioAction;
  playVerseFromWord: WordAudioAction;
  /** Mushaf readers: one sheet with Word and Translation tabs, owned by this controller. */
  studySheet?: ReaderStudySheetController;
  verseActions?: StudySheetVerseActions;
  onChooseTranslation?: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const selectedLocation = controller.event;
  const surahId = getSurahId(studySheet?.verse ?? selectedLocation);
  const surahName = surahId ? resolveSurahName(surahId) : 'Surah';

  const handlePlayWord = React.useCallback(() => {
    if (selectedLocation) playWord(selectedLocation);
  }, [playWord, selectedLocation]);

  const handlePlayVerseFromWord = React.useCallback(() => {
    if (selectedLocation) playVerseFromWord(selectedLocation);
  }, [playVerseFromWord, selectedLocation]);

  const handleOpenFullStudy = React.useCallback(() => {
    if (!selectedLocation) return;
    const [surah, ayah] = selectedLocation.verseKey.split(':');
    if (!surah || !ayah) return;
    const selectedAnalysis =
      controller.loadState.status === 'ready' ? controller.loadState.analysis : undefined;
    stageWordStudyNavigationHandoff(
      selectedLocation,
      selectedAnalysis,
      controller.verseAnalyses
    );
    controller.close();
    router.push(`/study/word/${surah}/${ayah}/${selectedLocation.wordPosition}` as never);
  }, [controller, router, selectedLocation]);

  const tabs = React.useMemo<WordQuickSheetTabs | undefined>(() => {
    if (!studySheet?.verse || !verseActions) return undefined;
    return {
      active: studySheet.tab,
      onChange: studySheet.setTab,
      verseKey: studySheet.verse.verseKey,
      showSwitch: studySheet.selectedWordPosition !== null,
      translationContent: (
        <VerseTranslationContent
          state={studySheet.translation}
          hasSelectedTranslations={studySheet.hasSelectedTranslations}
          onRetry={studySheet.retryTranslation}
          onChooseTranslation={
            onChooseTranslation
              ? () => {
                  studySheet.close();
                  onChooseTranslation();
                }
              : undefined
          }
        />
      ),
      renderTranslationFooter: (controls) => (
        <VerseActionsFooter actions={verseActions} controls={controls} />
      ),
    };
  }, [onChooseTranslation, studySheet, verseActions]);

  return (
    <WordQuickSheet
      isOpen={studySheet ? studySheet.isOpen : controller.isOpen}
      event={controller.event}
      loadState={controller.loadState}
      surahName={surahName}
      onClose={studySheet ? studySheet.close : controller.close}
      onRetry={controller.retry}
      onPresented={controller.reportPresented}
      onPlayWord={handlePlayWord}
      onPlayVerseFromHere={handlePlayVerseFromWord}
      onOpenFullStudy={handleOpenFullStudy}
      tabs={tabs}
    />
  );
}

function getSurahId(event: Pick<WordStudyPressEvent, 'verseKey'> | null): number | null {
  const [surahPart] = event?.verseKey.split(':') ?? [];
  const parsed = Number.parseInt(surahPart ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}
