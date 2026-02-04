import { Platform, Pressable, Text, View } from 'react-native';

export type HomeTab = 'surah' | 'juz';

export function HomeTabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center rounded-full bg-interactive dark:bg-interactive-dark p-1">
      <TabButton
        label="Surah"
        isActive={activeTab === 'surah'}
        onPress={() => onTabChange('surah')}
      />
      <TabButton
        label="Juz"
        isActive={activeTab === 'juz'}
        onPress={() => onTabChange('juz')}
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
        'h-11 w-16 items-center justify-center rounded-full',
        isActive ? 'bg-surface dark:bg-surface-dark' : '',
      ].join(' ')}
      style={({ pressed }) => [isActive ? activeShadow : null, { opacity: pressed ? 0.9 : 1 }]}
    >
      <Text
        className={[
          'text-xs font-semibold',
          isActive
            ? 'text-foreground dark:text-foreground-dark'
            : 'text-muted dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
