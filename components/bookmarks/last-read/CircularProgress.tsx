import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function CircularProgress({
  percentage,
  size = 100,
  strokeWidth = 10,
  label = 'Completed',
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.border}
          strokeWidth={strokeWidth}
          fill="transparent"
          opacity={0.6}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.tint}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>

      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-base font-bold text-foreground dark:text-foreground-dark">
          {Math.round(clamped)}%
        </Text>
        <Text className="text-[10px] font-medium text-muted dark:text-muted-dark">{label}</Text>
      </View>
    </View>
  );
}
