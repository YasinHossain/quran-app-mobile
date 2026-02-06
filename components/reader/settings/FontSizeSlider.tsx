import Slider from '@react-native-community/slider';
import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function FontSizeSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-foreground dark:text-foreground-dark">{label}</Text>
        <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
          {Math.round(value)}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={1}
        onValueChange={onChange}
        minimumTrackTintColor={palette.tint}
        maximumTrackTintColor={palette.border}
        thumbTintColor={palette.tint}
      />
    </View>
  );
}
