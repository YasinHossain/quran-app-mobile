import { X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function DownloadProgressRing({
  percent,
  tintColor,
  trackColor,
  crossColor,
  emphasized = false,
}: {
  percent: number;
  tintColor: string;
  trackColor: string;
  crossColor: string;
  emphasized?: boolean;
}): React.JSX.Element {
  const ringSize = 24;
  const strokeWidth = 3;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (clampPercent(percent) / 100) * circumference;

  return (
    <View
      style={[
        styles.container,
        emphasized && styles.emphasized,
      ]}
    >
      <Svg
        width={ringSize}
        height={ringSize}
        style={styles.ring}
      >
        <Circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          stroke={tintColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.cross}>
        <X color={crossColor} size={12} strokeWidth={2.75} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emphasized: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
  },
  ring: {
    transform: [{ rotate: '-90deg' }],
  },
  cross: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
