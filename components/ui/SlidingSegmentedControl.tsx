import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export type SlidingSegment<T extends string> = {
  key: T;
  label: string;
};

export function SlidingSegmentedControl<T extends string>({
  items,
  selectedKey,
  width,
  labelFontSize = 13,
  onSelect,
}: {
  items: readonly SlidingSegment<T>[];
  selectedKey: T;
  width?: number;
  labelFontSize?: number;
  onSelect: (key: T) => void;
}): React.JSX.Element {
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === selectedKey));
  const indicatorPosition = useSharedValue(activeIndex);
  const containerWidth = width ?? measuredWidth;
  const segmentWidth = containerWidth > 0 && items.length > 0
    ? (containerWidth - 8) / items.length
    : undefined;

  React.useEffect(() => {
    indicatorPosition.value = withSpring(activeIndex, {
      damping: 22,
      stiffness: 180,
      mass: 0.55,
    });
  }, [activeIndex, indicatorPosition]);

  const activeShadow =
    Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        };

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    if (containerWidth === 0 || items.length === 0) return { opacity: 0 };
    const segmentWidth = (containerWidth - 8) / items.length;
    return {
      width: segmentWidth,
      opacity: 1,
      transform: [{ translateX: indicatorPosition.value * segmentWidth }],
    };
  });

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => {
        if (width !== undefined) return;
        const nextWidth = event.nativeEvent.layout.width;
        setMeasuredWidth((currentWidth) =>
          Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth
        );
      }}
      style={[
        styles.track,
        {
          backgroundColor: palette.interactive,
          borderColor: `${palette.border}55`,
        },
        width !== undefined ? { width } : undefined,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          animatedIndicatorStyle,
          activeShadow,
          { backgroundColor: palette.surfaceNavigation },
        ]}
      />
      {items.map((item) => {
        const selected = item.key === selectedKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.key)}
            style={[
              styles.segment,
              segmentWidth === undefined ? styles.segmentFlexible : { width: segmentWidth },
            ]}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.74}
              numberOfLines={1}
              style={[styles.label, { color: selected ? palette.text : palette.muted, fontSize: labelFontSize }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'relative', width: '100%', alignSelf: 'stretch', minHeight: 50, padding: 4, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  indicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 22 },
  segment: { zIndex: 1, height: 40, minWidth: 0, borderRadius: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  segmentFlexible: { flex: 1, flexBasis: 0 },
  label: { lineHeight: 18, fontWeight: '600', textAlign: 'center' },
});
