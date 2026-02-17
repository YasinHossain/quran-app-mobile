import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';

import { ReorderableSelectionList } from './resource-panel/ReorderableSelectionList';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceTabs } from './resource-panel/ResourceTabs';
import { buildLanguages, filterResources, groupResources, type ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TAFSIR_SELECTIONS = 3;

type Row =
  | { type: 'tabs' }
  | { type: 'section'; language: string }
  | { type: 'resource'; item: ResourceRecord }
  | { type: 'empty'; text: string };

function findEnglishTafsirId(tafsirs: ResourceRecord[]): number | undefined {
  return tafsirs.find((t) => t.lang.toLowerCase() === 'english')?.id;
}

export function ManageTafsirsPanel({
  tafsirs,
  orderedSelection,
  onChangeSelection,
  isLoading,
  errorMessage,
  onRefresh,
  languageSort,
}: {
  tafsirs: ResourceRecord[];
  orderedSelection: number[];
  onChangeSelection: (ids: number[]) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
  languageSort?: (a: string, b: string) => number;
}): React.JSX.Element {
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [showLimitWarning, setShowLimitWarning] = React.useState(false);

  const selectedIds = React.useMemo(() => new Set<number>(orderedSelection ?? []), [orderedSelection]);

  const languages = React.useMemo(
    () => buildLanguages(tafsirs, languageSort),
    [languageSort, tafsirs]
  );

  React.useEffect(() => {
    if (languages.includes(activeFilter)) return;
    setActiveFilter('All');
  }, [activeFilter, languages]);

  const filteredTafsirs = React.useMemo(() => filterResources(tafsirs, searchTerm), [tafsirs, searchTerm]);
  const groupedTafsirs = React.useMemo(() => groupResources(filteredTafsirs), [filteredTafsirs]);

  const resourcesToRender = React.useMemo(() => {
    return activeFilter === 'All' ? filteredTafsirs : groupedTafsirs[activeFilter] ?? [];
  }, [activeFilter, filteredTafsirs, groupedTafsirs]);

  const sectionsToRender = React.useMemo(() => {
    const languageOrder = new Map(languages.map((lang, idx) => [lang, idx]));
    const entries = Object.entries(groupedTafsirs).sort(
      ([a], [b]) => (languageOrder.get(a) ?? Number.POSITIVE_INFINITY) - (languageOrder.get(b) ?? Number.POSITIVE_INFINITY)
    );
    return entries.map(([language, items]) => ({ language, items }));
  }, [groupedTafsirs, languages]);

  const handleToggle = React.useCallback(
    (id: number): boolean => {
      const current = orderedSelection ?? [];
      if (current.includes(id)) {
        onChangeSelection(current.filter((x) => x !== id));
        setShowLimitWarning(false);
        return true;
      }

      if (current.length >= MAX_TAFSIR_SELECTIONS) {
        setShowLimitWarning(true);
        return false;
      }

      onChangeSelection([...current, id]);
      setShowLimitWarning(false);
      return true;
    },
    [onChangeSelection, orderedSelection]
  );

  const handleReset = React.useCallback(() => {
    const englishId = findEnglishTafsirId(tafsirs);
    if (englishId === undefined) return;
    onChangeSelection([englishId]);
    setShowLimitWarning(false);
  }, [onChangeSelection, tafsirs]);

  const rows = React.useMemo<Row[]>(() => {
    const base: Row[] = [{ type: 'tabs' }];

    if (resourcesToRender.length === 0) {
      base.push({
        type: 'empty',
        text: tafsirs.length === 0 && isLoading
          ? 'Loading tafsir resources...'
          : 'No tafsir resources found for the selected filter.',
      });
      return base;
    }

    if (activeFilter === 'All') {
      sectionsToRender.forEach(({ language, items }) => {
        base.push({ type: 'section', language });
        items.forEach((item) => base.push({ type: 'resource', item }));
      });
      return base;
    }

    resourcesToRender.forEach((item) => base.push({ type: 'resource', item }));
    return base;
  }, [activeFilter, isLoading, resourcesToRender, sectionsToRender, tafsirs.length]);

  const renderHeader = React.useCallback((): React.JSX.Element => {
    return (
      <View className="p-4 gap-4">
        <HeaderSearchInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search tafsirs or languages..."
        />

        <ReorderableSelectionList
          variant="tafsir"
          orderedSelection={orderedSelection ?? []}
          resources={tafsirs}
          onRemove={(id) => handleToggle(id)}
          onReorder={onChangeSelection}
          onReset={handleReset}
          maxSelections={MAX_TAFSIR_SELECTIONS}
          emptyText="No tafsirs selected"
          onDragStateChange={setIsReordering}
        />
      </View>
    );
  }, [handleReset, handleToggle, onChangeSelection, orderedSelection, searchTerm, tafsirs]);

  const renderItem = React.useCallback(
    ({ item }: { item: Row }): React.JSX.Element | null => {
      if (item.type === 'tabs') {
        return (
          <View className="py-2 border-b bg-background dark:bg-background-dark border-border dark:border-border-dark">
            <View className="px-4">
              <ResourceTabs
                languages={languages}
                activeFilter={activeFilter}
                onTabPress={setActiveFilter}
              />
            </View>
          </View>
        );
      }

      if (item.type === 'section') {
        return (
          <View className="px-4 pt-4 pb-2">
            <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
              {item.language}
            </Text>
          </View>
        );
      }

      if (item.type === 'empty') {
        return (
          <View className="px-4 py-8 items-center">
            <Text className="text-sm text-muted dark:text-muted-dark text-center">{item.text}</Text>
          </View>
        );
      }

      return (
        <View className="px-4 py-1">
          <ResourceItem
            item={item.item}
            isSelected={selectedIds.has(item.item.id)}
            onToggle={handleToggle}
          />
        </View>
      );
    },
    [activeFilter, handleToggle, languages, selectedIds]
  );

  if (errorMessage && tafsirs.length === 0) {
    return (
      <View className="flex-1 p-4 gap-3">
        <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
        {onRefresh ? (
          <Pressable
            onPress={onRefresh}
            className="self-start rounded-lg bg-interactive dark:bg-interactive-dark border border-border dark:border-border-dark px-4 py-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1">
      {showLimitWarning ? (
        <View className="mx-4 mt-3 mb-1 flex-row items-center rounded-lg border border-error dark:border-error-dark bg-error/90 px-3 py-2">
          <Text className="text-sm text-on-accent dark:text-on-accent-dark">
            Maximum {MAX_TAFSIR_SELECTIONS} tafsirs can be selected
          </Text>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(row) => {
          if (row.type === 'tabs') return 'tabs';
          if (row.type === 'section') return `section:${row.language}`;
          if (row.type === 'empty') return 'empty';
          return `resource:${row.item.id}`;
        }}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        scrollEnabled={!isReordering}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}
