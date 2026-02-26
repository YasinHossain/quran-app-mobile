import { Stack } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function SettingsScreen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-background dark:bg-background-dark px-4 py-6">
      <Stack.Screen options={{ title: 'Settings' }} />

      <Text className="text-2xl font-bold text-foreground dark:text-foreground-dark">Settings</Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
        Manage app preferences.
      </Text>

      <View className="mt-6 gap-12">
        <Text className="text-xs text-muted dark:text-muted-dark">
          Offline translation downloads are managed in Reader Settings → Translations.
        </Text>

        <Text className="text-xs text-muted dark:text-muted-dark">
          More settings coming soon: theme, language, reciter, and offline search.
        </Text>
      </View>
    </View>
  );
}
