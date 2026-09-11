import { Calendar, Minus, Plus, X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  dialogTransform,
  useModalTransition,
} from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useBookmarks } from '@/providers/BookmarkContext';
import { OverlayPortalProvider } from '@/providers/OverlayPortalContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { SurahVerseSelectorRow } from '@/components/search/SurahVerseSelectorRow';
import {
  buildChapterLookup,
  buildPlannerPlanDefinitions,
  getPlannerStats,
} from './create-planner-modal/utils';

import type { PlanFormData } from './create-planner-modal/types';
import type { Chapter } from '@/types';

const resetFormState = (): PlanFormData => ({
  planName: '',
  startSurah: undefined,
  startVerse: undefined,
  endSurah: undefined,
  endVerse: undefined,
  estimatedDays: 5,
});

const clampDays = (value: number): number => Math.max(1, Math.min(365, Math.round(value)));

export function CreatePlannerModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();

  const { chapters, isLoading: isChaptersLoading, errorMessage, refresh } = useChapters();
  const { planner, createPlannerPlan } = useBookmarks();

  const [formData, setFormData] = React.useState<PlanFormData>(resetFormState);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const inputRef = React.useRef<TextInput | null>(null);
  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    onAfterOpen: () => inputRef.current?.focus(),
    onAfterClose: () => {
      setFormData(resetFormState());
      setIsSubmitting(false);
      setOpenSelectorId(null);
    },
  });

  const chapterLookup = React.useMemo(() => buildChapterLookup(chapters), [chapters]);

  const stats = React.useMemo(() => getPlannerStats(chapters, formData), [chapters, formData]);
  const planDefinitions = React.useMemo(
    () => buildPlannerPlanDefinitions(formData, chapters),
    [chapters, formData]
  );

  const duplicatePlanName = React.useMemo(() => {
    if (planDefinitions.length === 0) return null;
    const trimmedInputName = formData.planName.trim();
    if (trimmedInputName.length === 0) return null;
    const normalizedInput = trimmedInputName.toLowerCase();

    const hasConflict = Object.values(planner).some((plan) => {
      const rawName = plan.notes?.trim();
      if (!rawName) return false;
      let normalizedExisting = rawName.toLowerCase();

      const chapter = chapters.find((c) => c.id === plan.surahId);
      const chapterName = chapter?.name_simple?.trim();
      if (chapterName) {
        const suffix = ` - ${chapterName}`.toLowerCase();
        if (normalizedExisting.endsWith(suffix)) {
          normalizedExisting = normalizedExisting
            .slice(0, normalizedExisting.length - suffix.length)
            .trim();
        }
      }

      return normalizedExisting === normalizedInput;
    });

    return hasConflict ? trimmedInputName : null;
  }, [chapters, formData.planName, planDefinitions.length, planner]);

  const canSubmit =
    !isSubmitting &&
    chapters.length > 0 &&
    formData.planName.trim().length > 0 &&
    stats.isValidRange &&
    stats.totalVerses > 0 &&
    !duplicatePlanName;

  const [openSelectorId, setOpenSelectorId] = React.useState<'start' | 'end' | null>(null);
  const [selectorDismissRequest, setSelectorDismissRequest] = React.useState(0);
  const isSelectorOpen = openSelectorId !== null;

  const dismissOpenSelector = React.useCallback(() => {
    Keyboard.dismiss();
    setSelectorDismissRequest((current) => current + 1);
  }, []);

  const handleStartSelectorOpenChange = React.useCallback((isOpen: boolean) => {
    setOpenSelectorId((current) => (isOpen ? 'start' : current === 'start' ? null : current));
  }, []);

  const handleEndSelectorOpenChange = React.useCallback((isOpen: boolean) => {
    setOpenSelectorId((current) => (isOpen ? 'end' : current === 'end' ? null : current));
  }, []);

  const handleClose = React.useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const updateFormData = React.useCallback((updates: Partial<PlanFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleOverlayPress = React.useCallback(() => {
    if (isSelectorOpen) {
      dismissOpenSelector();
      return;
    }
    if (!dismissEnabledRef.current) return;
    handleClose();
  }, [dismissEnabledRef, dismissOpenSelector, handleClose, isSelectorOpen]);

  const handleSelectStartSurah = React.useCallback(
    (surahId: number) => {
      updateFormData({
        startSurah: surahId,
        startVerse: undefined,
      });
    },
    [updateFormData]
  );

  const handleSelectStartVerse = React.useCallback(
    (verseNumber: number) => {
      updateFormData({
        startVerse: verseNumber,
      });
    },
    [updateFormData]
  );

  const handleSelectEndSurah = React.useCallback(
    (surahId: number) => {
      updateFormData({
        endSurah: surahId,
        endVerse: undefined,
      });
    },
    [updateFormData]
  );

  const handleSelectEndVerse = React.useCallback(
    (verseNumber: number) => {
      updateFormData({
        endVerse: verseNumber,
      });
    },
    [updateFormData]
  );

  const setEstimatedDays = React.useCallback(
    (next: number) => {
      updateFormData({ estimatedDays: clampDays(next) });
    },
    [updateFormData]
  );

  const handleSubmit = React.useCallback(() => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    for (const definition of planDefinitions) {
      createPlannerPlan(
        definition.surahId,
        definition.versesCount,
        definition.planName,
        formData.estimatedDays,
        { startVerse: definition.startVerse, endVerse: definition.endVerse }
      );
    }

    handleClose();
  }, [canSubmit, createPlannerPlan, formData.estimatedDays, handleClose, planDefinitions]);

  const maxName = 50;
  const currentLength = Math.min(maxName, formData.planName.length);
  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));

  return (
    <Modal
      transparent
      hardwareAccelerated
      visible={visible}
      onShow={onModalShow}
      onRequestClose={handleClose}
      animationType="none"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
    >
      <OverlayPortalProvider>
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
                  <View className="px-5 py-5">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <View className="h-12 w-12 rounded-xl items-center justify-center bg-interactive dark:bg-interactive-dark">
                          <Calendar size={22} strokeWidth={2.25} color={palette.tint} />
                        </View>
                        <View>
                          <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">
                            {t('binder_tab_planner')}
                          </Text>
                          <Text
                            className="text-sm text-muted dark:text-muted-dark"
                            style={{ marginTop: -2 }}
                          >
                            {t('planner_create_new_plan')}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={handleClose}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('close')}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        className="p-2 rounded-full"
                      >
                        <X size={18} strokeWidth={2.25} color={palette.muted} />
                      </Pressable>
                    </View>
                  </View>

                  <ScrollView
                    style={styles.flex}
                    keyboardShouldPersistTaps="handled"
                    onScrollBeginDrag={dismissOpenSelector}
                    contentContainerStyle={styles.scrollContent}
                  >
                    <View className="px-5 gap-6" style={styles.formContent}>
                      {isSelectorOpen ? (
                        <Pressable
                          onPress={dismissOpenSelector}
                          accessibilityRole="button"
                          accessibilityLabel="Close selector list"
                          style={styles.selectorDismissLayer}
                        />
                      ) : null}
                      <View>
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                            {t('planner_set_plan_name')}
                          </Text>
                          <Text className="text-sm text-muted dark:text-muted-dark">
                            {currentLength}/{maxName}
                          </Text>
                        </View>
                        <View className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-3 py-2">
                          <TextInput
                            ref={inputRef}
                            value={formData.planName}
                            onChangeText={(planName) => updateFormData({ planName })}
                            placeholder={t('planner_enter_plan_name')}
                            placeholderTextColor={palette.muted}
                            maxLength={maxName}
                            returnKeyType="done"
                            className="text-base text-foreground dark:text-foreground-dark"
                          />
                        </View>
                        {duplicatePlanName ? (
                          <Text className="mt-2 text-sm text-error dark:text-error-dark">
                            {t('planner_duplicate_name_error', { name: duplicatePlanName })}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.selectorsSection} className="gap-4">
                        <SurahVerseSelectorRow
                          chapters={chapters}
                          isLoading={isChaptersLoading}
                          surahLabel={t('start')}
                          verseLabel={t('verse')}
                          selectedSurah={formData.startSurah}
                          selectedVerse={formData.startVerse}
                          onSelectSurah={handleSelectStartSurah}
                          onSelectVerse={handleSelectStartVerse}
                          autoAdvanceToVerse
                          floatingDropdown
                          onOpenChange={handleStartSelectorOpenChange}
                          dismissRequest={selectorDismissRequest}
                        />

                        <SurahVerseSelectorRow
                          chapters={chapters}
                          isLoading={isChaptersLoading}
                          surahLabel={t('end')}
                          verseLabel={t('verse')}
                          selectedSurah={formData.endSurah}
                          selectedVerse={formData.endVerse}
                          onSelectSurah={handleSelectEndSurah}
                          onSelectVerse={handleSelectEndVerse}
                          autoAdvanceToVerse
                          floatingDropdown
                          onOpenChange={handleEndSelectorOpenChange}
                          dismissRequest={selectorDismissRequest}
                        />
                      </View>

                      <View>
                        <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark mb-2">
                          {t('planner_estimated_days')}
                        </Text>
                        <View className="flex-row items-center justify-between rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-3 py-2">
                          <Pressable
                            onPress={() => setEstimatedDays(formData.estimatedDays - 1)}
                            accessibilityRole="button"
                            accessibilityLabel="Decrease"
                            className="h-9 w-9 items-center justify-center rounded-lg bg-interactive dark:bg-interactive-dark"
                            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                          >
                            <Minus size={16} strokeWidth={2.25} color={palette.muted} />
                          </Pressable>
                          <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                            {formData.estimatedDays}
                          </Text>
                          <Pressable
                            onPress={() => setEstimatedDays(formData.estimatedDays + 1)}
                            accessibilityRole="button"
                            accessibilityLabel="Increase"
                            className="h-9 w-9 items-center justify-center rounded-lg bg-interactive dark:bg-interactive-dark"
                            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                          >
                            <Plus size={16} strokeWidth={2.25} color={palette.muted} />
                          </Pressable>
                        </View>
                      </View>

                      {stats.isValidRange && stats.totalVerses > 0 ? (
                        <View className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-4">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-sm text-muted dark:text-muted-dark">
                              {t('planner_total_verses')}:
                            </Text>
                            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                              {stats.totalVerses}
                            </Text>
                          </View>
                          <View className="mt-2 flex-row items-center justify-between">
                            <Text className="text-sm text-muted dark:text-muted-dark">
                              {t('planner_verses_per_day')}:
                            </Text>
                            <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                              {stats.versesPerDay}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {chapters.length === 0 ? (
                        <View className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-4 py-3">
                          <View className="flex-row items-center gap-2">
                            {isChaptersLoading ? (
                              <ActivityIndicator size="small" color={palette.muted} />
                            ) : null}
                            <Text className="text-sm text-muted dark:text-muted-dark">
                              {isChaptersLoading
                                ? t('loading_surah')
                                : errorMessage
                                  ? errorMessage
                                  : t('no_verses_found')}
                            </Text>
                          </View>
                          {errorMessage ? (
                            <Pressable
                              onPress={refresh}
                              accessibilityRole="button"
                              accessibilityLabel="Retry"
                              className="mt-3 self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
                              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                            >
                              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                                {t('search_error_title')}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </ScrollView>

                  <View className="px-5 py-3 border-t border-border/60 dark:border-border-dark/40 bg-surface dark:bg-background-dark">
                    <View className="flex-row items-center justify-end gap-3">
                      <Pressable
                        onPress={handleClose}
                        accessibilityRole="button"
                        accessibilityLabel={t('cancel')}
                        className="px-5 py-2.5 rounded-lg bg-interactive dark:bg-interactive-dark"
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                          {t('cancel')}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                        accessibilityRole="button"
                        accessibilityLabel={t('planner_create_plan')}
                        className={[
                          'px-5 py-2.5 rounded-lg bg-accent',
                          !canSubmit ? 'opacity-50' : '',
                        ].join(' ')}
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <Text className="text-sm font-semibold text-on-accent">
                          {isSubmitting ? t('loading') : t('planner_create_plan')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </OverlayPortalProvider>
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
  flex: { flexShrink: 1 },
  scrollContent: { paddingBottom: 10 },
  formContent: {
    position: 'relative',
  },
  selectorDismissLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  selectorsSection: {
    zIndex: 2,
  },
});
