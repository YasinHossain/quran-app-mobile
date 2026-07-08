import { X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { dialogTransform, useModalTransition } from '@/components/motion/modalTransition';
import { useChapters } from '@/hooks/useChapters';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAppTheme } from '@/providers/ThemeContext';

import {
  buildChapterLookup,
  buildGroupRangeLabel,
  getChapterDisplayName,
  groupPlannerPlans,
} from '@/components/bookmarks/planner/utils/planGrouping';
import {
  clampActualVerseToPlanRange,
  convertActualVerseToPlanProgress,
  getPlanEndVerse,
  getPlanStartVerse,
} from '@/components/bookmarks/planner/utils/planRange';

import { PlannerCardsSection } from './PlannerCardsSection';

import type { Chapter, PlannerPlan } from '@/types';

export interface VerseSummaryDetails {
  verseKey: string;
  surahId?: number;
  arabicText?: string;
  translationText?: string;
}

export interface PlannerCardViewModel {
  id: string;
  planName: string;
  verseRangeLabel: string;
  estimatedDays?: number;
  planIds: string[];
  reactKey: string;
}

const extractSurahId = (surahId: number | undefined, verseKey: string): number | undefined => {
  if (typeof surahId === 'number') return surahId;
  const [surahPart] = verseKey.split(':');
  const parsed = Number(surahPart);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractVerseNumber = (verseKey: string): number | undefined => {
  const [, ayahPart] = verseKey.split(':');
  if (!ayahPart) return undefined;
  const parsed = Number(ayahPart);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

function useVerseHeaderLabel(
  verseSummary: VerseSummaryDetails,
  chapterLookup: Map<number, Chapter>
): { title: string; subtitle: string } {
  return React.useMemo(() => {
    const verseSurahId = extractSurahId(verseSummary.surahId, verseSummary.verseKey);
    const verseChapter = typeof verseSurahId === 'number' ? chapterLookup.get(verseSurahId) : undefined;
    const fallbackSurahName =
      verseChapter?.name_simple ??
      verseChapter?.translated_name?.name ??
      verseChapter?.name_arabic ??
      (typeof verseSurahId === 'number' ? `Surah ${verseSurahId}` : 'Surah');

    return {
      title: 'Add to Plan',
      subtitle: `${fallbackSurahName} ${verseSummary.verseKey}`,
    };
  }, [chapterLookup, verseSummary.surahId, verseSummary.verseKey]);
}

function usePlannerCards(
  planner: Record<string, PlannerPlan>,
  chapterLookup: Map<number, Chapter>,
  currentSurahId: number | undefined
): PlannerCardViewModel[] {
  return React.useMemo(() => {
    const groups = groupPlannerPlans(planner, chapterLookup);
    return groups.map((group) => {
      const matchingPlan =
        typeof currentSurahId === 'number'
          ? group.plans.find((plan) => plan.surahId === currentSurahId)
          : undefined;
      const primaryPlan = matchingPlan ?? group.plans[0];
      const card: PlannerCardViewModel = {
        id: primaryPlan?.id ?? group.planIds[0] ?? group.key,
        planName: group.planName,
        verseRangeLabel: buildGroupRangeLabel(group.surahIds, chapterLookup),
        planIds: group.planIds,
        reactKey: group.key,
      };
      if (primaryPlan && typeof primaryPlan.estimatedDays === 'number') {
        card.estimatedDays = primaryPlan.estimatedDays;
      }
      return card;
    });
  }, [planner, chapterLookup, currentSurahId]);
}

export function AddToPlannerModal({
  isOpen,
  onClose,
  verseSummary,
}: {
  isOpen: boolean;
  onClose: () => void;
  verseSummary: VerseSummaryDetails;
}): React.JSX.Element | null {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const { planner, updatePlannerProgress } = useBookmarks();
  const { chapters, isLoading: isChaptersLoading, errorMessage, refresh } = useChapters();

  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);

  const chapterLookup = React.useMemo(() => buildChapterLookup(chapters), [chapters]);
  const verseSurahId = React.useMemo(
    () => extractSurahId(verseSummary.surahId, verseSummary.verseKey),
    [verseSummary.surahId, verseSummary.verseKey]
  );
  const verseNumber = React.useMemo(() => extractVerseNumber(verseSummary.verseKey), [verseSummary.verseKey]);

  const { title, subtitle } = useVerseHeaderLabel(verseSummary, chapterLookup);
  const plannerCards = usePlannerCards(planner, chapterLookup, verseSurahId);

  const plansById = React.useMemo(
    () =>
      Object.values(planner).reduce<Map<string, PlannerPlan>>((acc, plan) => {
        acc.set(plan.id, plan);
        return acc;
      }, new Map<string, PlannerPlan>()),
    [planner]
  );

  const selectedPlan = React.useMemo(
    () => (selectedPlanId ? plansById.get(selectedPlanId) ?? null : null),
    [plansById, selectedPlanId]
  );

  const hasValidReference = typeof verseSurahId === 'number' && typeof verseNumber === 'number';

  const isOutOfRange = React.useMemo(() => {
    if (!selectedPlanId || !selectedPlan || !hasValidReference) return false;

    const groups = groupPlannerPlans(planner, chapterLookup);
    const group = groups.find((g) => g.planIds.includes(selectedPlanId));
    if (!group) return true;

    if (typeof verseSurahId === 'number') {
      const startSurahId = group.surahIds[0];
      const endSurahId = group.surahIds[group.surahIds.length - 1];
      if (verseSurahId < startSurahId || verseSurahId > endSurahId) {
        return true;
      }
      if (!group.surahIds.includes(verseSurahId)) {
        return true;
      }
    }

    const planForSurah = group.plans.find((p) => p.surahId === verseSurahId);
    if (!planForSurah) return true;

    if (typeof verseNumber === 'number') {
      const start = getPlanStartVerse(planForSurah);
      const end = getPlanEndVerse(planForSurah);
      if (verseNumber < start || verseNumber > end) {
        return true;
      }
    }
    return false;
  }, [selectedPlanId, selectedPlan, hasValidReference, planner, chapterLookup, verseSurahId, verseNumber]);

  const canSave = Boolean(selectedPlanId && hasValidReference && !isOutOfRange);

  const helperMessage = React.useMemo(() => {
    if (!selectedPlanId) return null;
    if (!selectedPlan) return null;
    if (!hasValidReference) {
      return 'Unable to determine the current verse reference for this planner.';
    }

    const groups = groupPlannerPlans(planner, chapterLookup);
    const group = groups.find((g) => g.planIds.includes(selectedPlanId));
    if (!group) return 'Planner not found.';

    if (typeof verseSurahId === 'number') {
      const startSurahId = group.surahIds[0];
      const endSurahId = group.surahIds[group.surahIds.length - 1];
      
      if (verseSurahId < startSurahId) {
        const startChapter = chapterLookup.get(startSurahId);
        const startName = startChapter ? getChapterDisplayName(group.plans[0], startChapter) : `Surah ${startSurahId}`;
        return `This planner starts from ${startName}. This verse cannot be added right now.`;
      }
      if (verseSurahId > endSurahId) {
        const endChapter = chapterLookup.get(endSurahId);
        const endName = endChapter ? getChapterDisplayName(group.plans[group.plans.length - 1], endChapter) : `Surah ${endSurahId}`;
        return `This planner ends at ${endName}. This verse cannot be added right now.`;
      }
      if (!group.surahIds.includes(verseSurahId)) {
        return 'This verse is out of the range of this planner.';
      }
    }

    const planForSurah = group.plans.find((p) => p.surahId === verseSurahId);
    if (!planForSurah) return 'Planner details not found.';

    if (typeof verseNumber === 'number') {
      const start = getPlanStartVerse(planForSurah);
      const end = getPlanEndVerse(planForSurah);
      if (verseNumber < start) {
        return `This planner starts at verse ${start}. This verse cannot be added right now.`;
      }
      if (verseNumber > end) {
        return `This planner ends at verse ${end}. This verse cannot be added right now.`;
      }
    }
    return null;
  }, [chapterLookup, hasValidReference, selectedPlan, selectedPlanId, verseNumber, planner, verseSurahId]);

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedPlanId(null);
    }
  }, [isOpen]);

  const handlePlanSelect = React.useCallback((planId: string) => {
    setSelectedPlanId((prev) => (prev === planId ? null : planId));
  }, []);

  const handleSave = React.useCallback(() => {
    if (!selectedPlanId) return;

    const plan = plansById.get(selectedPlanId);
    if (!plan) return;

    if (!hasValidReference || typeof verseSurahId !== 'number' || plan.surahId !== verseSurahId) {
      return;
    }

    if (typeof verseNumber !== 'number') {
      return;
    }

    const groups = groupPlannerPlans(planner, chapterLookup);
    const group = groups.find((g) => g.planIds.includes(plan.id));

    if (!group) {
      const normalizedVerse = clampActualVerseToPlanRange(plan, verseNumber);
      const planProgress = convertActualVerseToPlanProgress(plan, normalizedVerse);
      const nextCompleted = Math.max(plan.completedVerses, planProgress);
      if (nextCompleted !== plan.completedVerses) {
        updatePlannerProgress(plan.id, nextCompleted);
      }
    } else {
      const selectedSurahId = verseSurahId;
      for (const p of group.plans) {
        if (p.surahId < selectedSurahId) {
          const newCompleted = Math.max(0, Math.min(p.targetVerses, p.targetVerses));
          if (newCompleted !== p.completedVerses) {
            updatePlannerProgress(p.id, newCompleted);
          }
        } else if (p.surahId === selectedSurahId) {
          const normalizedVerse = clampActualVerseToPlanRange(p, verseNumber);
          const planProgress = convertActualVerseToPlanProgress(p, normalizedVerse);
          const nextCompleted = Math.max(p.completedVerses, planProgress);
          if (nextCompleted !== p.completedVerses) {
            updatePlannerProgress(p.id, nextCompleted);
          }
        }
      }
    }

    setSelectedPlanId(null);
    onClose();
  }, [
    chapterLookup,
    hasValidReference,
    onClose,
    planner,
    plansById,
    selectedPlanId,
    updatePlannerProgress,
    verseNumber,
    verseSurahId,
  ]);

  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [dismissEnabledRef, onClose]);

  if (!visible) return null;

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));
  const minDialogHeight = Math.min(maxDialogHeight, Math.max(320, Math.round(windowHeight * 0.45)));

  return (
    <Modal
      transparent
      visible={visible}
      onShow={onModalShow}
      onRequestClose={onClose}
      animationType="none"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: maxDialogHeight,
                backgroundColor: isDark ? palette.background : palette.surface,
                borderColor: palette.border,
              },
              dialogTransform(progress),
            ]}
            className="border"
          >
            <View style={styles.safeArea}>
              <View className={isDark ? 'dark' : ''} style={styles.inner}>
                <View className="px-5 pt-5 pb-4 border-b border-border/40 dark:border-border-dark/20">
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1 min-w-0">
                      <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
                        {title}
                      </Text>
                      <Text className="mt-1 text-sm text-muted dark:text-muted-dark">{subtitle}</Text>
                      {isChaptersLoading && chapters.length === 0 ? (
                        <View className="mt-2 flex-row items-center gap-2">
                          <ActivityIndicator size="small" color={palette.muted} />
                          <Text className="text-xs text-muted dark:text-muted-dark">Loading surahs…</Text>
                        </View>
                      ) : errorMessage ? (
                        <Pressable
                          onPress={refresh}
                          accessibilityRole="button"
                          accessibilityLabel="Retry"
                          className="mt-2 self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
                          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                        >
                          <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                            Retry loading surahs
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={onClose}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                      className="h-8 w-8 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
                    >
                      <X size={16} strokeWidth={2.25} color={palette.muted} />
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  className="px-5"
                  keyboardShouldPersistTaps="handled"
                >
                  <PlannerCardsSection
                    plannerCards={plannerCards}
                    verseSummary={verseSummary}
                    selectedPlanId={selectedPlanId}
                    onPlanSelect={handlePlanSelect}
                  />

                  {helperMessage ? (
                    <Text className="mt-3 text-sm text-muted dark:text-muted-dark">
                      {helperMessage}
                    </Text>
                  ) : null}
                </ScrollView>

                <View className="px-5 pt-3 pb-5 border-t border-border/40 dark:border-border-dark/20">
                  <Pressable
                    onPress={handleSave}
                    disabled={!canSave}
                    accessibilityRole="button"
                    accessibilityLabel="Save"
                    className={['w-full rounded-xl bg-accent px-5 py-2.5', !canSave ? 'opacity-50' : ''].join(' ')}
                    style={({ pressed }) => ({ opacity: !canSave ? 0.5 : pressed ? 0.9 : 1 })}
                  >
                    <Text className="text-sm font-semibold text-on-accent text-center">Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  overlay: { flex: 1, backgroundColor: '#00000080' },
  sheetWrap: { flex: 1, justifyContent: 'center', width: '100%' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  safeArea: { flexShrink: 1 },
  inner: { flexShrink: 1 },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 16,
  },
});
