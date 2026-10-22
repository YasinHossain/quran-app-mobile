import Slider from '@react-native-community/slider';
import React from 'react';
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
  const [draftValue, setDraftValue] = React.useState(value);
  const isSlidingRef = React.useRef(false);

  React.useEffect(() => {
    if (!isSlidingRef.current) {
      setDraftValue(value);
    }
  }, [value]);

  const handleSlidingComplete = React.useCallback(
    (next: number) => {
      const rounded = Math.round(next);
      isSlidingRef.current = false;
      setDraftValue(rounded);
      React.startTransition(() => onChange(rounded));
    },
    [onChange]
  );

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm" style={{ color: palette.text }}>
          {label}
        </Text>
        <Text className="text-sm font-semibold" style={{ color: palette.tint }}>
          {Math.round(draftValue)}
        </Text>
      </View>
      <Slider
        value={draftValue}
        minimumValue={min}
        maximumValue={max}
        step={1}
        onSlidingStart={() => {
          isSlidingRef.current = true;
        }}
        onValueChange={setDraftValue}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={palette.tint}
        maximumTrackTintColor={resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}
        thumbTintColor={palette.tint}
      />
    </View>
  );
}
