import React from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';

import type { JuzSummary } from './JuzCard';

import { JuzCard } from './JuzCard';

function getNumColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function JuzGrid({ juzs }: { juzs: JuzSummary[] }): React.JSX.Element {
  const { width } = useWindowDimensions();
  const numColumns = React.useMemo(() => getNumColumns(width), [width]);

  return (
    <FlatList
      key={numColumns}
      style={{ flex: 1 }}
      data={juzs}
      keyExtractor={(item) => String(item.number)}
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
            <JuzCard juz={item} />
          </View>
        );
      }}
    />
  );
}

