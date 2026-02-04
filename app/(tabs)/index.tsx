import { FlatList, Text, View } from 'react-native';
import React from 'react';

import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';

type ApiChaptersResponse = {
  chapters: Array<{
    id: number;
    name_simple: string;
    name_arabic: string;
    translated_name?: { name: string };
    verses_count: number;
    revelation_place: 'makkah' | 'madinah';
    revelation_order?: number;
  }>;
};

const mapChapterToSurah = (chapter: ApiChaptersResponse['chapters'][number]): Surah =>
  new Surah({
    id: chapter.id,
    name: chapter.name_simple,
    arabicName: chapter.name_arabic,
    englishName: chapter.name_simple,
    englishTranslation: chapter.translated_name?.name ?? '',
    numberOfAyahs: chapter.verses_count,
    revelationType:
      chapter.revelation_place === 'makkah' ? RevelationType.MAKKI : RevelationType.MADANI,
    revelationOrder: chapter.revelation_order,
  });

export default function ReadScreen(): React.JSX.Element {
  const [surahs, setSurahs] = React.useState<Surah[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    async function load(): Promise<void> {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const response = await fetch('https://api.quran.com/api/v4/chapters?language=en');
        if (!response.ok) {
          throw new Error(`Failed to load chapters (${response.status})`);
        }
        const json = (await response.json()) as ApiChaptersResponse;
        const mapped = (json.chapters ?? []).map(mapChapterToSurah);
        if (isMounted) setSurahs(mapped);
      } catch (error) {
        if (isMounted) setErrorMessage((error as Error).message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View className="flex-1">
      <View className="px-4 pb-3 pt-6">
        <Text className="text-2xl font-bold">Quran App</Text>
        <Text className="mt-1 text-sm text-gray-600">
          {isLoading
            ? 'Loading Surahs…'
            : errorMessage
              ? `Error: ${errorMessage}`
              : `${surahs.length} Surahs`}
        </Text>
      </View>

      <FlatList
        data={surahs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
            <View className="flex-1 pr-4">
              <Text className="text-base font-semibold">{`${item.id}. ${item.englishName}`}</Text>
              <Text className="mt-0.5 text-xs text-gray-600">{item.englishTranslation}</Text>
            </View>
            <Text className="text-lg font-semibold">{item.arabicName}</Text>
          </View>
        )}
      />
    </View>
  );
}
