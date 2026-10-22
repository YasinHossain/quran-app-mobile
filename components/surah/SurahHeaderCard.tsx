import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { RevelationPlaceIllustration } from './RevelationPlaceIllustration';
import { BismillahDisplay } from './BismillahDisplay';
import {
  getSurahHeaderPresentation,
  type SurahHeaderData,
} from './surahHeaderPresentation';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export type SurahHeaderChapter = SurahHeaderData & {
  name_arabic: string;
  translated_name?: { name: string };
};

export function SurahHeaderCard({ chapter }: { chapter: SurahHeaderChapter }): React.JSX.Element {
  const { t } = useUiTranslation();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { infoLabel, showBismillah, surahName } = getSurahHeaderPresentation(chapter, t);

  return (
    <View className="mb-4 -mt-1">
      <View className="border-b pb-5" style={{ borderBottomColor: `${palette.border}66` }}>
        <View className="min-h-[84px] flex-row items-center justify-between gap-3">
          {/* Left Side: Surah Name and Metadata */}
          <View className="min-w-0 flex-1 items-start justify-center pt-2">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.88}
              style={{ color: palette.text, fontSize: 21, lineHeight: 28 }}
              className="text-left font-bold"
            >
              {surahName}
            </Text>
            <Text className="mt-1 text-left text-sm" style={{ color: palette.muted }}>
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
