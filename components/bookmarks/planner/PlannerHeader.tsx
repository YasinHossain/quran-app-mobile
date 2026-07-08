import { Calendar, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useUiTranslation } from '@/providers/UiLanguageContext';

export function PlannerHeader({ onCreatePlan }: { onCreatePlan: () => void }): React.JSX.Element {
  const { t } = useUiTranslation();

  return (
    <View className="mb-2 gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-3 min-w-0 flex-1">
          <View className="h-9 w-9 rounded-xl bg-accent items-center justify-center">
            <Calendar size={20} strokeWidth={2.25} color="#FFFFFF" />
          </View>
          <View className="min-w-0">
            <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
              {t('binder_tab_planner')}
            </Text>
            <Text className="text-xs text-muted dark:text-muted-dark">
              {t('planner_header_description')}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onCreatePlan}
          accessibilityRole="button"
          accessibilityLabel={t('planner_create_plan')}
          className="h-9 w-9 items-center justify-center rounded-xl bg-accent"
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <Plus size={20} strokeWidth={2.25} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
