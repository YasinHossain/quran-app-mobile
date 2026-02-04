import React from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';

import type { Surah } from '@/src/core/domain/entities/Surah';

import { SurahCard } from './SurahCard';

function getNumColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function SurahGrid({ surahs }: { surahs: Surah[] }): React.JSX.Element {
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  return (
    <FlatList
      key={numColumns}
      style={{ flex: 1 }}
      data={surahs}
      keyExtractor={(item) => String(item.id)}
      numColumns={numColumns}
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item, index }) => {
        const gap = 12;
        const isLastInRow = numColumns === 1 ? true : (index + 1) % numColumns === 0;

        return (
          <View
            style={{
              flex: 1,
              marginBottom: gap,
              marginRight: isLastInRow ? 0 : gap,
            }}
          >
            <SurahCard surah={item} />
          </View>
        );
      }}
    />
  );
}
