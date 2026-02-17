import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { HeaderSearchInput } from '@/components/search/HeaderSearchInput';

import { ReorderableSelectionList } from './resource-panel/ReorderableSelectionList';
import { ResourceItem } from './resource-panel/ResourceItem';
import { ResourceTabs } from './resource-panel/ResourceTabs';
import { buildLanguages, filterResources, groupResources, type ResourceRecord } from './resource-panel/resourcePanel.utils';

export const MAX_TRANSLATION_SELECTIONS = 5;

const DEFAULT_SAHEEH_ID = 20;

function isSaheehName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('saheeh international') || lower.includes('sahih international');
}

function findSaheehId(translations: ResourceRecord[]): number | undefined {
  return translations.find((t) => isSaheehName(t.name))?.id;
}

function translationLanguageSort(a: string, b: string): number {
  if (a === 'English') return -1;
  if (b === 'English') return 1;
  if (a === 'Bengali') return -1;
  if (b === 'Bengali') return 1;
  return a.localeCompare(b);
}

type Row =
  | { type: 'tabs' }
  | { type: 'section'; language: string }
  | { type: 'resource'; item: ResourceRecord }
  | { type: 'empty'; text: string };

export function ManageTranslationsPanel({
  translations,
  orderedSelection,
  onChangeSelection,
  isLoading,
  errorMessage,
  onRefresh,
}: {
  translations: ResourceRecord[];
  orderedSelection: number[];
  onChangeSelection: (ids: number[]) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
}): React.JSX.Element {
  const [isReordering, setIsReordering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('All');

  const selectedIds = React.useMemo(() => new Set<number>(orderedSelection ?? []), [orderedSelection]);

  const languages = React.useMemo(
    () => buildLanguages(translations, translationLanguageSort),
    [translations]
  );

  React.useEffect(() => {
    if (languages.includes(activeFilter)) return;
    setActiveFilter('All');
  }, [activeFilter, languages]);

  const filteredTranslations = React.useMemo(
    () => filterResources(translations, searchTerm),
    [translations, searchTerm]
  );

  const groupedTranslations = React.useMemo(
    () => groupResources(filteredTranslations),
    [filteredTranslations]
  );

  const resourcesToRender = React.useMemo(() => {
    return activeFilter === 'All' ? filteredTranslations : groupedTranslations[activeFilter] ?? [];
  }, [activeFilter, filteredTranslations, groupedTranslations]);

  const sectionsToRender = React.useMemo(() => {
    const entries = Object.entries(groupedTranslations).sort(([a], [b]) => translationLanguageSort(a, b));
    return entries.map(([language, items]) => ({ language, items }));
  }, [groupedTranslations]);

  const handleToggle = React.useCallback(
    (id: number): boolean => {
      const current = orderedSelection ?? [];
      if (current.includes(id)) {
        onChangeSelection(current.filter((x) => x !== id));
        return true;
      }

      if (current.length >= MAX_TRANSLATION_SELECTIONS) return false;

      onChangeSelection([...current, id]);
      return true;
    },
    [onChangeSelection, orderedSelection]
  );

  const handleReset = React.useCallback(() => {
    const sahihId = findSaheehId(translations);
    onChangeSelection(sahihId !== undefined ? [sahihId] : [DEFAULT_SAHEEH_ID]);
  }, [onChangeSelection, translations]);

  const rows = React.useMemo<Row[]>(() => {
    const base: Row[] = [{ type: 'tabs' }];

    if (resourcesToRender.length === 0) {
      base.push({ type: 'empty', text: 'No translation resources found for the selected filter.' });
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
  }, [activeFilter, resourcesToRender, sectionsToRender]);

  const renderHeader = React.useCallback((): React.JSX.Element => {
    return (
      <View className="p-4 gap-4">
        <HeaderSearchInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search translations or languages..."
        />

        <ReorderableSelectionList
          variant="translation"
          orderedSelection={orderedSelection ?? []}
          resources={translations}
          onRemove={(id) => handleToggle(id)}
          onReorder={onChangeSelection}
          onReset={handleReset}
          maxSelections={MAX_TRANSLATION_SELECTIONS}
          emptyText="No translations selected"
          removeAccessibilityLabel="Remove translation"
          onDragStateChange={setIsReordering}
        />
      </View>
    );
  }, [handleReset, handleToggle, onChangeSelection, orderedSelection, searchTerm, translations]);

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

  if (errorMessage && translations.length === 0) {
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

  if (isLoading && translations.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="text-sm text-muted dark:text-muted-dark">Loading translations...</Text>
      </View>
    );
  }

  return (
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
  );
}
