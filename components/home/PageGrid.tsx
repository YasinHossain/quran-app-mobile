import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { PageCard } from './PageCard';

function getNumColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function PageGrid({
  pages,
  listHeader,
  scrollEnabled = true,
}: {
  pages: number[];
  listHeader?: React.ReactElement | null;
  scrollEnabled?: boolean;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  return (
    <FlashList
      key={numColumns}
      style={{ flex: 1 }}
      data={pages}
      scrollEnabled={scrollEnabled}
      keyExtractor={(item) => String(item)}
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
            <PageCard pageNumber={item} />
          </View>
        );
      }}
    />
  );
}
