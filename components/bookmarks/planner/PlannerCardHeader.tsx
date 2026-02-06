import React from 'react';
import { Text, View } from 'react-native';

export function PlannerCardHeader({
  displayPlanName,
  planDetailsText,
}: {
  displayPlanName: string;
  planDetailsText: string | null;
}): React.JSX.Element {
  return (
    <View className="min-w-0 gap-2">
      <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
        {displayPlanName}
      </Text>
      {planDetailsText ? (
        <Text className="text-sm text-muted dark:text-muted-dark">{planDetailsText}</Text>
      ) : null}
    </View>
  );
}

