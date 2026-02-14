import React from 'react';
import { Text, View } from 'react-native';

import { RevelationType, Surah } from '@/src/core/domain/entities/Surah';
import { HomeTabToggle, type HomeTab } from '@/components/home/HomeTabToggle';
import { JuzGrid } from '@/components/home/JuzGrid';
import { SurahGrid } from '@/components/home/SurahGrid';
import { useChapters } from '@/hooks/useChapters';
import juzData from '../../src/data/juz.json';

import type { Chapter } from '@/types';

const mapChapterToSurah = (chapter: Chapter): Surah =>
  new Surah({
    id: chapter.id,
    name: chapter.name_simple,
    arabicName: chapter.name_arabic,
    englishName: chapter.name_simple,
    englishTranslation: chapter.translated_name?.name ?? '',
    numberOfAyahs: chapter.verses_count,
    revelationType:
      chapter.revelation_place === 'makkah' ? RevelationType.MAKKI : RevelationType.MADANI,
  });

export default function ReadScreen(): React.JSX.Element {
  const [activeTab, setActiveTab] = React.useState<HomeTab>('surah');
  const { chapters, isLoading, errorMessage } = useChapters();
  const surahs = React.useMemo(() => chapters.map(mapChapterToSurah), [chapters]);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <View className="px-4 pb-3 pt-6">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-2xl font-bold text-content-primary dark:text-content-primary-dark">
            {activeTab === 'surah' ? 'All Surahs' : 'All Juz'}
          </Text>
          <HomeTabToggle activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      </View>

      <View className="flex-1 px-4">
        {activeTab === 'surah' ? (
          surahs.length === 0 && errorMessage ? (
            <Text className="mt-4 text-sm text-error dark:text-error-dark">{errorMessage}</Text>
          ) : surahs.length === 0 && isLoading ? (
            <Text className="mt-4 text-sm text-muted dark:text-muted-dark">Loading…</Text>
          ) : (
            <SurahGrid surahs={surahs} />
          )
        ) : (
          <JuzGrid juzs={juzData} />
        )}
      </View>
    </View>
  );
}
