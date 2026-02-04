import { Link } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';

export type JuzSummary = {
  number: number;
  surahRange: string;
};

const cardShadow =
  Platform.OS === 'android'
    ? { elevation: 3 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
      };

export function JuzCard({ juz }: { juz: JuzSummary }): React.JSX.Element {
  return (
    <Link href={{ pathname: '/juz/[juzNumber]', params: { juzNumber: String(juz.number) } }} asChild>
      <Pressable
        className={[
          'h-20 w-full rounded-xl border border-border/30 dark:border-border-dark/20',
          'bg-surface-navigation dark:bg-surface-navigation-dark',
          'px-4 py-4',
        ].join(' ')}
        style={({ pressed }) => [cardShadow, { opacity: pressed ? 0.92 : 1 }]}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-number-badge dark:bg-number-badge-dark">
            <Text className="text-lg font-bold text-accent dark:text-accent-dark">
              {juz.number}
            </Text>
          </View>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-content-primary dark:text-content-primary-dark"
            >
              {`Juz ${juz.number}`}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-content-secondary dark:text-content-secondary-dark"
            >
              {juz.surahRange}
            </Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
