import { Text, View } from 'react-native';

export default function SettingsScreen(): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center bg-background dark:bg-background-dark px-6">
      <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
        Settings
      </Text>
      <Text className="mt-2 text-center text-sm text-muted dark:text-muted-dark">
        Coming soon: theme, language, reciter, and offline downloads.
      </Text>
    </View>
  );
}
