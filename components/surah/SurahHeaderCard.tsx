import { Text, View } from 'react-native';

import { RevelationPlaceIllustration } from './RevelationPlaceIllustration';
import { BismillahDisplay } from './BismillahDisplay';
import {
  getSurahHeaderPresentation,
  type SurahHeaderData,
} from './surahHeaderPresentation';

export type SurahHeaderChapter = SurahHeaderData & {
  name_arabic: string;
  translated_name?: { name: string };
};

export function SurahHeaderCard({ chapter }: { chapter: SurahHeaderChapter }): React.JSX.Element {
  const { infoLabel, showBismillah, surahName } = getSurahHeaderPresentation(chapter);

  return (
    <View className="mb-4 -mt-1 px-1">
      <View className="border-b border-border/40 pb-5 dark:border-border-dark/30">
        <View className="min-h-[104px] flex-row items-center justify-between gap-4 px-2">
          {/* Left Side: Surah Name and Metadata */}
          <View className="min-w-0 flex-1 items-start justify-center pt-3">
            <Text
              numberOfLines={2}
              style={{ fontSize: 26, lineHeight: 32 }}
              className="text-left font-bold text-foreground dark:text-foreground-dark"
            >
              {surahName}
            </Text>
            <Text className="mt-0.5 text-left text-sm text-muted dark:text-muted-dark">
              {infoLabel}
            </Text>
          </View>

          {/* Right Side: Illustration */}
          <View className="shrink-0 items-center justify-center">
            <RevelationPlaceIllustration place={chapter.revelation_place} />
          </View>
        </View>

        {showBismillah ? (
          <View className="mt-5 items-center px-2">
            <BismillahDisplay />
          </View>
        ) : null}
      </View>
    </View>
  );
}
