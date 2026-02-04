import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function JuzScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ juzNumber?: string | string[] }>();
  const juzNumber = Array.isArray(params.juzNumber) ? params.juzNumber[0] : params.juzNumber;

  return (
    <View className="flex-1 bg-background dark:bg-background-dark px-4 py-6">
      <Stack.Screen options={{ title: juzNumber ? `Juz ${juzNumber}` : 'Juz' }} />

      <Text className="text-2xl font-bold text-foreground dark:text-foreground-dark">
        {juzNumber ? `Juz ${juzNumber}` : 'Juz'}
      </Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">Reader screen is next.</Text>
    </View>
  );
}

