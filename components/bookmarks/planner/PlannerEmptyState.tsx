import { Calendar } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export function PlannerEmptyState(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];

  return (
    <View className="items-center py-16">
      <View className="h-16 w-16 rounded-full bg-surface dark:bg-surface-dark items-center justify-center mb-4">
        <Calendar size={32} strokeWidth={2.25} color={palette.muted} />
      </View>
      <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">
        {t('planner_empty_title')}
      </Text>
      <Text className="text-muted dark:text-muted-dark text-center px-6">
        {t('planner_empty_description')}
      </Text>
    </View>
  );
}
