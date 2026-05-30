import { ChevronDown, Sparkles, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  LinearTransition,
  FadeInUp,
  FadeOutDown,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { DailyFocusSection } from './DailyFocusSection';
import { PlannerCardHeader } from './PlannerCardHeader';
import { PlannerStatsSection } from './PlannerStatsSection';
import { createPlannerCardViewModel } from './utils/plannerCard';

import type { PlannerCardProps } from './PlannerCard.types';
import type { PlannerCardViewModel } from './utils/plannerCard';

import { Platform } from 'react-native';

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

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
  const palette = Colors[resolvedTheme];

  const [isExpanded, setIsExpanded] = React.useState(false);
  const rotateValue = useSharedValue(0);
  const expandProgress = useSharedValue(0);

  React.useEffect(() => {
    rotateValue.value = withSpring(isExpanded ? 1 : 0, {
      damping: 22,
      stiffness: 180,
      mass: 0.8,
    });
    expandProgress.value = withSpring(isExpanded ? 1 : 0, {
      damping: 22,
      stiffness: 180,
      mass: 0.8,
    });
  }, [isExpanded, rotateValue, expandProgress]);

  const animatedChevronStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateValue.value * 180}deg` }],
    };
  });

  const animatedProgressSectionStyle = useAnimatedStyle(() => {
    const paddingH = expandProgress.value * 16;
    const paddingV = expandProgress.value * 16;
    const borderRadius = expandProgress.value * 12;

    // Force opacity to rise faster (reaching 100% opacity when expandProgress is 0.5)
    // so that the box borders and backgrounds are solid early during the opening slide.
    const opacityMultiplier = Math.min(1, expandProgress.value * 2.0);

    const bgColor = resolvedTheme === 'dark'
      ? `rgba(15, 23, 42, ${opacityMultiplier * 0.4})`
      : `rgba(247, 249, 249, ${opacityMultiplier * 0.6})`;

    const borderColor = resolvedTheme === 'dark'
      ? `rgba(51, 65, 85, ${opacityMultiplier * 0.5})`
      : `rgba(229, 231, 235, ${opacityMultiplier * 0.6})`;

    return {
      paddingHorizontal: paddingH,
      paddingVertical: paddingV,
      borderRadius,
      backgroundColor: bgColor,
      borderColor,
      borderWidth: expandProgress.value > 0 ? 1 : 0,
    };
  });

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
  const percentLabel = `${viewModel.progress.percent}%`;

  return (
    <Animated.View
      style={cardShadow}
      className="relative min-w-0 rounded-2xl border border-border/50 bg-surface px-5 py-5 dark:border-border-dark/40 dark:bg-surface-dark"
    >
      <View className="gap-5">
        {/* Header Row */}
        <View className="flex-row items-start justify-between gap-3">
          <Pressable
            onPress={toggleExpand}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? 'Collapse details' : 'Expand details'}
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
                accessibilityLabel="Delete planner"
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
              accessibilityLabel={isExpanded ? 'Collapse details' : 'Expand details'}
              className="h-8 w-8 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <Animated.View style={animatedChevronStyle}>
                <ChevronDown size={18} strokeWidth={2.25} color={palette.muted} />
              </Animated.View>
            </Pressable>
          </View>
        </View>

        {/* Expanded Focus & Stats */}
        {isExpanded ? (
          <Animated.View
            entering={FadeInUp.duration(300)}
            exiting={FadeOutDown.duration(200)}
            className="gap-5"
          >
            <DailyFocusSection focus={viewModel.focus} />
            <PlannerStatsSection stats={viewModel.stats} />
          </Animated.View>
        ) : null}

        {/* Progress & Action Section (Animated transition from flat to boxed container) */}
        <Animated.View
          style={animatedProgressSectionStyle}
          className="gap-4"
        >
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} strokeWidth={2.25} color={palette.tint} />
                <Text className="text-sm font-semibold text-muted dark:text-muted-dark">
                  Currently at
                </Text>
              </View>
              <Text className="text-xs font-semibold text-muted dark:text-muted-dark">
                {percentLabel}
              </Text>
            </View>

            <View>
              <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                {verseLine}
              </Text>
              {viewModel.progress.currentSecondaryText ? (
                <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                  {viewModel.progress.currentSecondaryText}
                </Text>
              ) : null}
            </View>

            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ now: viewModel.progress.percent, min: 0, max: 100 }}
              className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border/40 dark:bg-border-dark/40"
            >
              <View
                className="h-full rounded-full bg-accent dark:bg-accent-dark"
                style={{ width: `${Math.max(0, Math.min(100, viewModel.progress.percent))}%` }}
              />
            </View>
          </View>

          {/* Continue Reading Action */}
          <Pressable
            onPress={handleNavigate}
            accessibilityRole="button"
            accessibilityLabel="Continue reading"
            className="w-full items-center justify-center rounded-xl bg-accent px-4 py-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <Text className="text-sm font-semibold text-on-accent">Continue reading</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
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

  return React.useCallback(async () => {
    const parsedSurahId = Number.parseInt(surahId, 10);
    const fallbackSurahId = Number.isFinite(parsedSurahId) ? parsedSurahId : Number(surahId);
    const resolvedSurahId =
      typeof continueVerse?.surahId === 'number' ? continueVerse.surahId : fallbackSurahId;
    const resolvedStartVerse =
      typeof continueVerse?.verse === 'number' && continueVerse.verse > 0 ? continueVerse.verse : undefined;

    if (!Number.isFinite(resolvedSurahId) || resolvedSurahId <= 0) {
      return;
    }

    await preloadOfflineSurahNavigationPage({
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
  }, [continueVerse?.surahId, continueVerse?.verse, router, settings, surahId]);
}
