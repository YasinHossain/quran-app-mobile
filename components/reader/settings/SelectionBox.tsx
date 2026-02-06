import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function SelectionBox({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold text-content-secondary dark:text-content-secondary-dark">
        {label}
      </Text>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        className={[
          'flex-row items-center justify-between gap-3 rounded-xl border',
          'border-border/30 dark:border-border-dark/20',
          'bg-interactive dark:bg-interactive-dark',
          'px-4 py-3',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      >
        <Text
          numberOfLines={1}
          className="flex-1 text-sm font-semibold text-foreground dark:text-foreground-dark"
        >
          {value}
        </Text>
        <ChevronRight color={palette.muted} size={18} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}
