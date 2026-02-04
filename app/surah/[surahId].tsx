import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function SurahScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ surahId?: string | string[] }>();
  const surahId = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;

  return (
    <View className="flex-1 bg-background dark:bg-background-dark px-4 py-6">
      <Stack.Screen options={{ title: surahId ? `Surah ${surahId}` : 'Surah' }} />

      <Text className="text-2xl font-bold text-foreground dark:text-foreground-dark">
        {surahId ? `Surah ${surahId}` : 'Surah'}
      </Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
        Reader screen is next.
      </Text>
    </View>
  );
}

