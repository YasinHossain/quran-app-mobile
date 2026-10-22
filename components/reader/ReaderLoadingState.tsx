import React from 'react';
import { Animated, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/** Skeleton for a translation reader whose content is still being read from storage. */
export function ReaderLoadingState(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const pulseOpacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      pulseOpacity.setValue(1);
      return;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          duration: 850,
          toValue: 0.65,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          duration: 850,
          toValue: 1,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [pulseOpacity, reduceMotion]);

  return (
    <View
      accessibilityLabel="Preparing reader"
      accessibilityRole="progressbar"
      className="flex-1 px-4"
    >
      <Animated.View
        accessibilityElementsHidden
        className="pt-10"
        importantForAccessibility="no-hide-descendants"
        style={{ opacity: pulseOpacity }}
      >
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            className="border-b border-border/40 py-5 dark:border-border-dark/30"
          >
            <View className="mb-5 h-5 w-16 rounded-full bg-border/30 dark:bg-border-dark/30" />
            <View className="mb-6 items-end gap-3">
              <View className="h-10 w-4/5 rounded-xl bg-border/30 dark:bg-border-dark/30" />
              <View className="h-10 w-3/5 rounded-xl bg-border/30 dark:bg-border-dark/30" />
            </View>
            <View className="gap-3">
              <View className="h-4 rounded-full bg-border/30 dark:bg-border-dark/30" />
              <View className="h-4 w-5/6 rounded-full bg-border/30 dark:bg-border-dark/30" />
              <View className="h-4 w-2/3 rounded-full bg-border/30 dark:bg-border-dark/30" />
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
