import type React from 'react';
import { Switch, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function ToggleRow({
  disabled = false,
  label,
  rightElement,
  value,
  onChange,
}: {
  disabled?: boolean;
  label: string;
  rightElement?: React.ReactNode;
  value: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-sm text-foreground dark:text-foreground-dark">{label}</Text>
      {rightElement ?? (
        <Switch
          disabled={disabled}
          value={value}
          onValueChange={onChange}
          trackColor={{ false: palette.border, true: palette.tint }}
          thumbColor="#FFFFFF"
        />
      )}
    </View>
  );
}
