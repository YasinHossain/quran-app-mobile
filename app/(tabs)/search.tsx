import { Text, TextInput, View } from 'react-native';

export default function SearchScreen(): React.JSX.Element {
  return (
    <View className="flex-1 px-4 py-6">
      <Text className="text-xl font-semibold">Search</Text>
      <Text className="mt-2 text-sm text-gray-600">Search across Surah names and verses.</Text>

      <TextInput
        placeholder="Search…"
        className="mt-6 rounded-xl border border-gray-300 px-4 py-3 text-base"
      />
    </View>
  );
}

