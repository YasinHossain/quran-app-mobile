import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useUiTranslation } from '@/providers/UiLanguageContext';

export type ArabicFontFilter = 'Uthmani' | 'IndoPak';

export function ArabicFontFilterToggle({
  activeFilter,
  onChange,
}: {
  activeFilter: ArabicFontFilter;
  onChange: (filter: ArabicFontFilter) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center rounded-full bg-interactive dark:bg-interactive-dark p-1 border border-border/30 dark:border-border-dark/20">
      <FilterTab
        label="Uthmani"
        isActive={activeFilter === 'Uthmani'}
        onPress={() => onChange('Uthmani')}
      />
      <FilterTab
        label="IndoPak"
        isActive={activeFilter === 'IndoPak'}
        onPress={() => onChange('IndoPak')}
      />
    </View>
  );
}

function FilterTab({
  label,
  isActive,
  onPress,
}: {
  label: ArabicFontFilter;
  isActive: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  const activeShadow =
    Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        };

  const displayLabel = label === 'Uthmani'
    ? t('uthmani', { fallback: 'Uthmani' })
    : t('indopak', { fallback: 'IndoPak' });

  return (
    <Pressable
      onPress={onPress}
      className={[
        'h-11 flex-1 items-center justify-center rounded-full px-3',
        isActive ? 'bg-surface dark:bg-surface-dark' : '',
      ].join(' ')}
      style={({ pressed }) => [isActive ? activeShadow : null, { opacity: pressed ? 0.9 : 1 }]}
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
        {displayLabel}
      </Text>
    </Pressable>
  );
}

