import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function PageScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ pageNumber?: string | string[] }>();
  const pageNumber = Array.isArray(params.pageNumber) ? params.pageNumber[0] : params.pageNumber;

  return (
    <View className="flex-1 bg-background dark:bg-background-dark px-4 py-6">
      <Stack.Screen options={{ title: pageNumber ? `Page ${pageNumber}` : 'Page' }} />

      <Text className="text-2xl font-bold text-foreground dark:text-foreground-dark">
        {pageNumber ? `Page ${pageNumber}` : 'Page'}
      </Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
        Page reader screen is coming next.
      </Text>
    </View>
  );
}

