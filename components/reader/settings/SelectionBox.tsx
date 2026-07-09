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
  const isDark = resolvedTheme === 'dark';
  const surfaceColor = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(51,65,85,0.2)' : 'rgba(229,231,235,0.3)';

  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold" style={{ color: palette.muted }}>
        {label}
      </Text>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
        })}
      >
        <View
          className="flex-row items-center justify-between gap-3 px-4 py-3"
          style={{
            width: '100%',
            backgroundColor: surfaceColor,
            borderColor,
            borderRadius: 12,
            borderWidth: 1,
          }}
        >
          <Text
            numberOfLines={1}
            className="flex-1 text-sm font-semibold"
            style={{ color: palette.text }}
          >
            {value}
          </Text>
          <ChevronRight color={palette.muted} size={18} strokeWidth={2.25} />
        </View>
      </Pressable>
    </View>
  );
}
