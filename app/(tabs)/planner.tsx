import { Stack } from 'expo-router';
import { ChevronUp } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { CreatePlannerModal, PlannerSection } from '@/components/bookmarks/planner';
import Colors from '@/constants/Colors';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAppTheme } from '@/providers/ThemeContext';

export default function PlannerScreen(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { planner, isHydrated, removeFromPlanner } = useBookmarks();

  const plannerScrollToTopRef = React.useRef<(() => void) | null>(null);
  const [isCreatePlannerOpen, setIsCreatePlannerOpen] = React.useState(false);

  const registerPlannerScrollToTop = React.useCallback((handler: (() => void) | null) => {
    plannerScrollToTopRef.current = handler;
  }, []);

  const handleScrollToTop = React.useCallback(() => {
    plannerScrollToTopRef.current?.();
  }, []);

  const handleCreatePlannerPlan = React.useCallback(() => {
    setIsCreatePlannerOpen(true);
  }, []);

  const handleDeletePlannerPlan = React.useCallback(
    (planIds: string[]) => {
      const uniqueIds = Array.from(new Set(planIds)).filter((id) => id.trim().length > 0);
      if (uniqueIds.length === 0) return;
      Alert.alert(
        'Delete Planner',
        'This action cannot be undone.\n\nAre you sure you want to permanently delete this planner?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              uniqueIds.forEach((id) => removeFromPlanner(id));
            },
          },
        ]
      );
    },
    [removeFromPlanner]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          title: 'Planner',
          headerRight: () => (
            <Pressable
              onPress={handleScrollToTop}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Scroll to planner cards"
            >
              {({ pressed }) => (
                <ChevronUp
                  color={palette.text}
                  size={22}
                  strokeWidth={2.25}
                  style={{ marginRight: 12, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
        }}
      />

      {!isHydrated ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.text} />
          <Text className="mt-2 text-sm text-muted dark:text-muted-dark">Loading…</Text>
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
    </View>
  );
}
