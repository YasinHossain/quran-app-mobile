import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import type { Surah } from '@/src/core/domain/entities/Surah';

import { SurahCard } from './SurahCard';

function getNumColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function SurahGrid({
  surahs,
  listHeader,
  scrollEnabled = true,
}: {
  surahs: Surah[];
  listHeader?: React.ReactElement | null;
  scrollEnabled?: boolean;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  return (
    <FlashList
      key={numColumns}
      style={{ flex: 1 }}
      data={surahs}
      scrollEnabled={scrollEnabled}
      keyExtractor={(item) => String(item.id)}
      numColumns={numColumns}
      drawDistance={Platform.OS === 'android' ? 900 : 650}
      overrideProps={{ initialDrawBatchSize: 12, scrollEventThrottle: 16 }}
      contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 12 }}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => {
        return (
          <View
            style={{
              flex: 1,
              marginBottom: 12,
              paddingHorizontal: 6,
            }}
          >
            <SurahCard surah={item} />
          </View>
        );
      }}
    />
  );
}
