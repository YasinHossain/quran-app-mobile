import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { getTafsirCached } from '@/lib/tafsir/tafsirCache';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import { TafsirHtml } from './TafsirHtml';

const MAX_TAFSIR_TABS = 3;

type TafsirTab = { id: number; name: string };

let globalLastActiveTafsirId: number | undefined;

export function TafsirTabs({
  verseKey,
  tafsirIds,
  onAddTafsir,
  onActiveTafsirChange,
}: {
  verseKey: string;
  tafsirIds: number[];
  onAddTafsir?: () => void;
  onActiveTafsirChange?: (tafsirId: number) => void;
}): React.JSX.Element {
  const { settings } = useSettings();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const { tafsirById, isLoading: isResourcesLoading, errorMessage } = useTafsirResources({
    enabled: true,
  });

  const tabs: TafsirTab[] = React.useMemo(() => {
    const sanitizedIds = (tafsirIds ?? [])
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      .slice(0, MAX_TAFSIR_TABS);

    return sanitizedIds.map((id) => ({
      id,
      name: tafsirById.get(id)?.displayName ?? `Tafsir ${id}`,
    }));
  }, [tafsirById, tafsirIds]);

  const [activeId, setActiveId] = React.useState<number | undefined>(() => {
    if (globalLastActiveTafsirId && tafsirIds.includes(globalLastActiveTafsirId)) {
      return globalLastActiveTafsirId;
    }
    return tafsirIds[0];
  });

  React.useEffect(() => {
    if (activeId) globalLastActiveTafsirId = activeId;
  }, [activeId]);

  React.useEffect(() => {
    if (typeof activeId !== 'number') return;
    onActiveTafsirChange?.(activeId);
  }, [activeId, onActiveTafsirChange]);

  React.useEffect(() => {
    if (tabs.length === 0) return;
    const isValid = typeof activeId === 'number' && tabs.some((t) => t.id === activeId);
    if (isValid) return;

    if (globalLastActiveTafsirId && tabs.some((t) => t.id === globalLastActiveTafsirId)) {
      setActiveId(globalLastActiveTafsirId);
      return;
    }

    setActiveId(tabs[0]!.id);
  }, [activeId, tabs]);

  const [contents, setContents] = React.useState<Record<number, string>>({});
  const [loadingById, setLoadingById] = React.useState<Record<number, boolean>>({});

  React.useEffect(() => {
    setContents({});
    setLoadingById({});
  }, [verseKey]);

  React.useEffect(() => {
    if (!activeId) return;
    if (typeof contents[activeId] !== 'undefined') return;

    let canceled = false;
    setLoadingById((prev) => ({ ...prev, [activeId]: true }));
    getTafsirCached(verseKey, activeId)
      .then((text) => {
        if (canceled) return;
        setContents((prev) => ({ ...prev, [activeId]: text }));
      })
      .catch(() => {
        if (canceled) return;
        setContents((prev) => ({ ...prev, [activeId]: 'Error loading tafsir.' }));
      })
      .finally(() => {
        if (canceled) return;
        setLoadingById((prev) => ({ ...prev, [activeId]: false }));
      });

    return () => {
      canceled = true;
    };
  }, [activeId, contents, verseKey]);

  if (isResourcesLoading && tabs.length === 0) {
    return (
      <View className="mt-4 flex-row items-center gap-3">
        <ActivityIndicator color={palette.text} />
        <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsir…</Text>
      </View>
    );
  }

  if (tabs.length === 0) {
    return (
      <Text className="mt-3 text-sm text-muted dark:text-muted-dark">
        No tafsir resources available.
      </Text>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0]!;
  const activeHtml = activeTab ? contents[activeTab.id] ?? '' : '';
  const isLoading = activeTab
    ? Boolean(loadingById[activeTab.id] || typeof contents[activeTab.id] === 'undefined')
    : false;

  return (
    <View className="mt-4">
      {errorMessage ? (
        <Text className="mb-3 text-sm text-error dark:text-error-dark">{errorMessage}</Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
        className="rounded-full bg-interactive dark:bg-interactive-dark border border-border/60 dark:border-border-dark/30 px-2 py-2"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveId(tab.id)}
              className={[
                'rounded-full px-4 py-2',
                isActive
                  ? 'bg-surface dark:bg-surface-dark'
                  : 'bg-transparent',
              ].join(' ')}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              accessibilityRole="button"
              accessibilityLabel={`Select ${tab.name}`}
            >
              <Text
                numberOfLines={1}
                className={[
                  'text-xs font-semibold',
                  isActive
                    ? 'text-foreground dark:text-foreground-dark'
                    : 'text-muted dark:text-muted-dark',
                ].join(' ')}
              >
                {tab.name}
              </Text>
            </Pressable>
          );
        })}

        {onAddTafsir && tabs.length < MAX_TAFSIR_TABS ? (
          <Pressable
            onPress={onAddTafsir}
            className="rounded-full px-4 py-2 border border-dashed border-border/70 dark:border-border-dark/40"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Add tafsir"
          >
            <Text numberOfLines={1} className="text-xs font-semibold text-muted dark:text-muted-dark">
              Add tafsir
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View className="mt-4">
        <Text className="mb-5 text-center text-lg font-bold text-foreground dark:text-foreground-dark">
          {activeTab.name}
        </Text>

        {isLoading ? (
          <View className="flex-row items-center gap-3">
            <ActivityIndicator color={palette.text} />
            <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsir…</Text>
          </View>
        ) : (
          <TafsirHtml
            html={activeHtml}
            fontSize={settings.tafsirFontSize || 18}
            contentKey={`${verseKey}-${activeTab.id}`}
          />
        )}
      </View>
    </View>
  );
}
