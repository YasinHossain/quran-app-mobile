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
        <Text className="text-sm" style={{ color: palette.text }}>
          {label}
        </Text>
        <Text className="text-sm font-semibold" style={{ color: palette.tint }}>
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
        maximumTrackTintColor={resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}
        thumbTintColor={palette.tint}
      />
    </View>
  );
}
