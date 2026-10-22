import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import type { JuzSummary } from './JuzCard';

import { JuzCard } from './JuzCard';

function getNumColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function JuzGrid({
  juzs,
  listHeader,
  scrollEnabled = true,
}: {
  juzs: JuzSummary[];
  listHeader?: React.ReactElement | null;
  scrollEnabled?: boolean;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  return (
    <FlashList
      key={numColumns}
      style={{ flex: 1 }}
      data={juzs}
      scrollEnabled={scrollEnabled}
      keyExtractor={(item) => String(item.number)}
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
            <JuzCard juz={item} />
          </View>
        );
      }}
    />
  );
}
