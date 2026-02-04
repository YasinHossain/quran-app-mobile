import { Text, View } from 'react-native';

export default function SettingsScreen(): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-xl font-semibold">Settings</Text>
      <Text className="mt-2 text-center text-sm text-gray-600">
        Coming soon: theme, language, reciter, and offline downloads.
      </Text>
    </View>
  );
}

