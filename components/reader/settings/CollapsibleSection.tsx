import { ChevronDown } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function CollapsibleSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="overflow-hidden rounded-2xl bg-transparent">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between gap-3 px-2 py-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <View className="flex-row items-center gap-3">
          {icon}
          <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
            {title}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
          <ChevronDown color={palette.muted} size={18} strokeWidth={2.25} />
        </View>
      </Pressable>
      {isOpen ? <View className="px-2 pb-3 pt-1">{children}</View> : null}
    </View>
  );
}

