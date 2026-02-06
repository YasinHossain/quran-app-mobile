import { Calendar, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function PlannerHeader({ onCreatePlan }: { onCreatePlan: () => void }): React.JSX.Element {
  return (
    <View className="mb-2 gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-3 min-w-0 flex-1">
          <View className="h-9 w-9 rounded-xl bg-accent items-center justify-center">
            <Calendar size={20} strokeWidth={2.25} color="#FFFFFF" />
          </View>
          <View className="min-w-0">
            <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
              Planner
            </Text>
            <Text className="text-xs text-muted dark:text-muted-dark">
              Set and track your reading goals
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onCreatePlan}
          accessibilityRole="button"
          accessibilityLabel="Create Plan"
          className="h-9 w-9 items-center justify-center rounded-xl bg-accent"
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <Plus size={20} strokeWidth={2.25} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
