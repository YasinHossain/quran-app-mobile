import { Clock } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

export function LastReadHeader(): React.JSX.Element {
  return (
    <View className="mb-2">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 rounded-xl bg-accent items-center justify-center shadow-sm flex-shrink-0">
          <Clock size={20} strokeWidth={2.25} color="#FFFFFF" />
        </View>
        <View className="min-w-0">
          <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
            Recent
          </Text>
          <Text className="text-xs text-muted dark:text-muted-dark">Last visited</Text>
        </View>
      </View>
    </View>
  );
}
