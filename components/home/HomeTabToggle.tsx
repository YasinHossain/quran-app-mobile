import { Platform, Pressable, Text, View } from 'react-native';

export type HomeTab = 'surah' | 'juz' | 'page';

export function HomeTabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center rounded-[24px] border border-border/15 bg-surface-navigation p-1 dark:border-border-dark/15 dark:bg-surface-navigation-dark">
      <TabButton
        label="Page"
        isActive={activeTab === 'page'}
        onPress={() => onTabChange('page')}
      />
      <TabButton
        label="Juz"
        isActive={activeTab === 'juz'}
        onPress={() => onTabChange('juz')}
      />
      <TabButton
        label="Surah"
        isActive={activeTab === 'surah'}
        onPress={() => onTabChange('surah')}
      />
    </View>
  );
}

function TabButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const activeShadow =
    Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        };

  return (
    <Pressable
      onPress={onPress}
      className={[
        'h-10 flex-1 items-center justify-center rounded-full px-2',
        isActive ? 'bg-interactive dark:bg-interactive-dark' : '',
      ].join(' ')}
      style={({ pressed }) => [isActive ? activeShadow : null, { opacity: pressed ? 0.9 : 1 }]}
    >
      <Text
        className={[
          'text-[13px] font-semibold',
          isActive
            ? 'text-content-primary dark:text-content-primary-dark'
            : 'text-content-secondary dark:text-content-secondary-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
