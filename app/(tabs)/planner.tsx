import { Stack } from 'expo-router';
import { ChevronUp } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  CreatePlannerModal,
  DeletePlannerModal,
  PlannerSection,
  type DeletePlannerTarget,
} from '@/components/bookmarks/planner';
import { AppHeader } from '@/components/navigation/AppHeader';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import Colors from '@/constants/Colors';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export default function PlannerScreen(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const { planner, isHydrated, removeFromPlanner } = useBookmarks();

  const plannerScrollToTopRef = React.useRef<(() => void) | null>(null);
  const [isCreatePlannerOpen, setIsCreatePlannerOpen] = React.useState(false);
  const [deletePlannerTarget, setDeletePlannerTarget] =
    React.useState<DeletePlannerTarget | null>(null);

  const registerPlannerScrollToTop = React.useCallback((handler: (() => void) | null) => {
    plannerScrollToTopRef.current = handler;
  }, []);

  const handleScrollToTop = React.useCallback(() => {
    plannerScrollToTopRef.current?.();
  }, []);

  const handleCreatePlannerPlan = React.useCallback(() => {
    setIsCreatePlannerOpen(true);
  }, []);

  const handleDeletePlannerPlan = React.useCallback((target: DeletePlannerTarget) => {
    const uniqueIds = Array.from(new Set(target.planIds)).filter((id) => id.trim().length > 0);
    if (uniqueIds.length === 0) return;
    setDeletePlannerTarget({ ...target, planIds: uniqueIds });
  }, []);

  const closeDeletePlannerModal = React.useCallback(() => {
    setDeletePlannerTarget(null);
  }, []);

  const handleConfirmDeletePlanner = React.useCallback(
    (planIds: string[]) => {
      planIds.forEach((id) => removeFromPlanner(id));
      setDeletePlannerTarget(null);
    },
    [removeFromPlanner]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <AppHeader
        title={t('binder_tab_planner')}
        right={
          <HeaderActionButton
            accessibilityLabel="Scroll to planner cards"
            onPress={handleScrollToTop}
          >
            <ChevronUp color={palette.text} size={22} strokeWidth={2.25} />
          </HeaderActionButton>
        }
      />

      {!isHydrated ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.text} />
          <Text className="mt-2 text-sm text-muted dark:text-muted-dark">{t('loading')}</Text>
        </View>
      ) : (
        <PlannerSection
          planner={planner}
          onCreatePlan={handleCreatePlannerPlan}
          onDeletePlan={handleDeletePlannerPlan}
          registerScrollToTop={registerPlannerScrollToTop}
        />
      )}

      <CreatePlannerModal isOpen={isCreatePlannerOpen} onClose={() => setIsCreatePlannerOpen(false)} />
      <DeletePlannerModal
        isOpen={Boolean(deletePlannerTarget)}
        onClose={closeDeletePlannerModal}
        target={deletePlannerTarget}
        onConfirmDelete={handleConfirmDeletePlanner}
      />
    </View>
  );
}
