import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export function MushafMessageState({
  color,
  message,
  showSpinner = false,
}: {
  color: string;
  message: string;
  showSpinner?: boolean;
}): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      {showSpinner ? <ActivityIndicator color={color} /> : null}
      <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
        {message}
      </Text>
    </View>
  );
}
