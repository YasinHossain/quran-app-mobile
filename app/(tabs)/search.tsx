import { Text, TextInput, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export default function SearchScreen(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="flex-1 bg-background dark:bg-background-dark px-4 py-6">
      <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
        Search
      </Text>
      <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
        Search across Surah names and verses.
      </Text>

      <TextInput
        placeholder="Search…"
        placeholderTextColor={palette.muted}
        className="mt-6 rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-4 py-3 text-base text-foreground dark:text-foreground-dark"
      />
    </View>
  );
}
