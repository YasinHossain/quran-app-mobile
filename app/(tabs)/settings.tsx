import { Stack, Link } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export default function SettingsScreen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-background dark:bg-background-dark px-4 py-6">
      <Stack.Screen options={{ title: 'Settings' }} />

      <Text className="text-2xl font-bold text-foreground dark:text-foreground-dark">Settings</Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
        Manage app preferences and offline downloads.
      </Text>

      <View className="mt-6 gap-12">
        <View className="gap-3">
          <Link href="/downloads" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open downloads"
              className={[
                'rounded-2xl border px-4 py-4',
                'border-border/50 dark:border-border-dark/40',
                'bg-surface dark:bg-surface-dark',
              ].join(' ')}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                Downloads
              </Text>
              <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                Download and delete translations for offline use.
              </Text>
            </Pressable>
          </Link>
        </View>

        <Text className="text-xs text-muted dark:text-muted-dark">
          More settings coming soon: theme, language, reciter, and offline search.
        </Text>
      </View>
    </View>
  );
}
