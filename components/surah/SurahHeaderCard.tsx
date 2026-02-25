import { Text, View } from 'react-native';

export type SurahHeaderChapter = {
  id: number;
  name_simple: string;
  name_arabic: string;
  translated_name?: { name: string };
  verses_count: number;
  revelation_place: string;
};

export function SurahHeaderCard({ chapter }: { chapter: SurahHeaderChapter }): React.JSX.Element {
  const showBismillah = chapter.id !== 9 && chapter.id !== 1;
  const revelationLabel = chapter.revelation_place === 'makkah' ? 'مكية' : 'مدنية';

  return (
    <View className="mb-4 -mt-1">
      <View className="items-center gap-3 border-b border-border/40 pb-5 dark:border-border-dark/30">
        <Text
          className={[
            'text-xl text-foreground dark:text-foreground-dark',
            'font-semibold',
          ].join(' ')}
          style={{ fontFamily: 'SpaceMono' }}
        >
          {revelationLabel}
        </Text>

        {showBismillah ? (
          <Text
            className="text-3xl text-foreground dark:text-foreground-dark"
            style={{
              fontFamily: 'SpaceMono',
              writingDirection: 'rtl',
              includeFontPadding: false,
            }}
          >
            ﷽
          </Text>
        ) : null}

        <View className="items-center gap-1">
          <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
            {chapter.name_simple}
          </Text>
          <Text className="text-xs text-muted dark:text-muted-dark">
            {chapter.verses_count} verses
          </Text>
        </View>
      </View>
    </View>
  );
}
