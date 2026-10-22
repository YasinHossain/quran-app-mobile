import { ChevronDown, Sparkles, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { localizePlannerText } from '@/lib/i18n/plannerText';
import { warmSurahReaderBeforeNavigation } from '@/lib/surah/surahReaderWarmup';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { DailyFocusSection } from './DailyFocusSection';
import { PlannerCardHeader } from './PlannerCardHeader';
import { PlannerStatsSection } from './PlannerStatsSection';
import { createPlannerCardViewModel } from './utils/plannerCard';

import type { PlannerCardProps } from './PlannerCard.types';
import type { PlannerCardViewModel } from './utils/plannerCard';

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

/**
 * Reanimated timings run on the UI thread against real frame timestamps, so unlike React Native's
 * native-driver timing they advance on every 90/120 Hz frame. Closing is shorter, like the sheets.
 */
const EXPAND_TIMING = { duration: 280, easing: Easing.bezier(0.2, 0, 0, 1) };
const COLLAPSE_TIMING = { duration: 200, easing: Easing.bezier(0.3, 0, 0.2, 1) };
const DETAILS_LIFT = 8;

export function PlannerCard({
  surahId,
  plan,
  chapter,
  precomputedViewModel,
  progressLabel,
  continueVerse,
  onDelete,
}: PlannerCardProps & { onDelete?: () => void }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const i18n = useUiTranslation();
  const { t, formatNumber } = i18n;
  const palette = Colors[resolvedTheme];
  const reduceMotion = useReducedMotion();

  const [isExpanded, setIsExpanded] = React.useState(false);
  const expandProgress = useSharedValue(0);
  const detailsHeight = useSharedValue(0);

  React.useEffect(() => {
    const target = isExpanded ? 1 : 0;
    expandProgress.value = reduceMotion
      ? target
      : withTiming(target, isExpanded ? EXPAND_TIMING : COLLAPSE_TIMING);
  }, [expandProgress, isExpanded, reduceMotion]);

  const handleDetailsLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      detailsHeight.value = event.nativeEvent.layout.height;
    },
    [detailsHeight]
  );

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expandProgress.value * 180}deg` }],
  }));

  // Only the clip height is a layout prop; the details themselves move with opacity and transform.
  const detailsClipStyle = useAnimatedStyle(() => ({
    height: expandProgress.value * detailsHeight.value,
  }));

  const detailsContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [0.15, 1], [0, 1], 'clamp'),
    transform: [{ translateY: (1 - expandProgress.value) * -DETAILS_LIFT }],
  }));

  const toggleExpand = React.useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const viewModel = usePlannerViewModel({
    surahId,
    plan,
    ...(chapter ? { chapter } : {}),
    ...(precomputedViewModel ? { precomputedViewModel } : {}),
  });
  const handleNavigate = usePlannerNavigation(surahId, continueVerse);

  const verseLine =
    typeof progressLabel === 'string' && progressLabel.length > 0
      ? progressLabel
      : `${viewModel.planInfo.surahLabel} ${surahId}:${viewModel.progress.currentVerse}`;
  const percentLabel = `${formatNumber(viewModel.progress.percent)}%`;
  const localizedVerseLine = localizePlannerText(verseLine, i18n);
  const localizedSecondaryText = viewModel.progress.currentSecondaryText
    ? localizePlannerText(viewModel.progress.currentSecondaryText, i18n)
    : null;
  const toggleLabel = isExpanded ? 'Collapse details' : 'Expand details';

  return (
    <View
      style={cardShadow}
      className="relative min-w-0 rounded-2xl border border-border/50 bg-surface px-3 pb-3 pt-4 dark:border-border-dark/40 dark:bg-surface-dark"
    >
      {/* Header Row */}
      <View className="flex-row items-start justify-between gap-3 px-2">
        <Pressable
          onPress={toggleExpand}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded: isExpanded }}
          className="flex-1 min-w-0"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <PlannerCardHeader
            displayPlanName={viewModel.planInfo.displayPlanName}
            planDetailsText={viewModel.planInfo.planDetailsText}
          />
        </Pressable>

        <View className="flex-row items-center gap-2">
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={t('planner_delete_plan')}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="h-8 w-8 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
            >
              <X size={16} strokeWidth={2.25} color={palette.muted} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={toggleExpand}
            accessibilityRole="button"
            accessibilityLabel={toggleLabel}
            accessibilityState={{ expanded: isExpanded }}
            hitSlop={10}
            className="h-8 w-8 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Animated.View style={chevronStyle}>
              <ChevronDown size={18} strokeWidth={2.25} color={palette.muted} />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* Current position stays anchored in both states; details unfold beneath it. */}
      <View className="mt-4 gap-4 rounded-xl border border-border/60 bg-background/60 p-4 dark:border-border-dark/50 dark:bg-background-dark/40">
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Sparkles size={16} strokeWidth={2.25} color={palette.tint} />
              <Text className="text-sm font-semibold text-muted dark:text-muted-dark">
                {t('planner_currently_at')}
              </Text>
            </View>
            <Text className="text-xs font-semibold text-muted dark:text-muted-dark">
              {percentLabel}
            </Text>
          </View>

          <View>
            <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
              {localizedVerseLine}
            </Text>
            {localizedSecondaryText ? (
              <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                {localizedSecondaryText}
              </Text>
            ) : null}
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ now: viewModel.progress.percent, min: 0, max: 100 }}
            className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border dark:bg-border-dark"
          >
            <View
              className="h-full rounded-full bg-accent dark:bg-accent-dark"
              style={{ width: `${Math.max(0, Math.min(100, viewModel.progress.percent))}%` }}
            />
          </View>
        </View>

        <Pressable
          onPress={handleNavigate}
          accessibilityRole="button"
          accessibilityLabel={t('planner_continue_reading')}
          className="w-full items-center justify-center rounded-xl bg-accent px-4 py-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <Text className="text-sm font-semibold text-on-accent">{t('planner_continue_reading')}</Text>
        </Pressable>
      </View>

      {/* Details stay mounted so their height is known before the first expand. */}
      <Animated.View
        style={detailsClipStyle}
        className="overflow-hidden"
        accessibilityElementsHidden={!isExpanded}
        importantForAccessibility={isExpanded ? 'auto' : 'no-hide-descendants'}
        pointerEvents={isExpanded ? 'auto' : 'none'}
      >
        <Animated.View
          onLayout={handleDetailsLayout}
          style={detailsContentStyle}
          className="absolute left-0 right-0 top-0 gap-3 pt-3"
        >
          <DailyFocusSection focus={viewModel.focus} />
          <PlannerStatsSection stats={viewModel.stats} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function usePlannerViewModel({
  surahId,
  plan,
  chapter,
  precomputedViewModel,
}: Pick<PlannerCardProps, 'surahId' | 'plan' | 'chapter' | 'precomputedViewModel'>): PlannerCardViewModel {
  return React.useMemo<PlannerCardViewModel>(() => {
    if (precomputedViewModel) {
      return precomputedViewModel;
    }
    const params: PlannerCardProps = chapter ? { surahId, plan, chapter } : { surahId, plan };
    return createPlannerCardViewModel(params);
  }, [chapter, plan, precomputedViewModel, surahId]);
}

function usePlannerNavigation(
  surahId: string,
  continueVerse: PlannerCardProps['continueVerse']
): () => void {
  const router = useRouter();
  const { settings } = useSettings();

  return React.useCallback(() => {
    const parsedSurahId = Number.parseInt(surahId, 10);
    const fallbackSurahId = Number.isFinite(parsedSurahId) ? parsedSurahId : Number(surahId);
    const resolvedSurahId =
      typeof continueVerse?.surahId === 'number' ? continueVerse.surahId : fallbackSurahId;
    const resolvedStartVerse =
      typeof continueVerse?.verse === 'number' && continueVerse.verse > 0 ? continueVerse.verse : undefined;

    if (!Number.isFinite(resolvedSurahId) || resolvedSurahId <= 0) {
      return;
    }

    void (async () => {
      await warmSurahReaderBeforeNavigation({
        surahId: resolvedSurahId,
        verseNumber: resolvedStartVerse,
        settings,
      });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(resolvedSurahId),
          ...(resolvedStartVerse ? { startVerse: String(resolvedStartVerse) } : {}),
        },
      });
    })();
  }, [continueVerse?.surahId, continueVerse?.verse, router, settings, surahId]);
}
