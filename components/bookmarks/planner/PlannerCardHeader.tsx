import React from 'react';
import { Text, View } from 'react-native';

import { localizePlannerText } from '@/lib/i18n/plannerText';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export function PlannerCardHeader({
  displayPlanName,
  planDetailsText,
}: {
  displayPlanName: string;
  planDetailsText: string | null;
}): React.JSX.Element {
  const i18n = useUiTranslation();

  return (
    <View className="min-w-0 gap-2">
      <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
        {localizePlannerText(displayPlanName, i18n)}
      </Text>
      {planDetailsText ? (
        <Text className="text-sm text-muted dark:text-muted-dark">{localizePlannerText(planDetailsText, i18n)}</Text>
      ) : null}
    </View>
  );
}
