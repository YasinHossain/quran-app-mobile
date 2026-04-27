import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export type HomeTab = 'surah' | 'juz' | 'page';

const TABS: HomeTab[] = ['surah', 'juz', 'page'];

export function HomeTabToggle({
  activeTab,
  width,
  onTabChange,
}: {
  activeTab: HomeTab;
  width?: number;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const activeIndex = Math.max(0, TABS.indexOf(activeTab));
  const indicatorPosition = useSharedValue(activeIndex);
  const containerWidth = width ?? measuredWidth;

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
    if (containerWidth === 0) return { opacity: 0 };
    const tabWidth = (containerWidth - 8) / TABS.length;
    return {
      width: tabWidth,
      opacity: 1,
      transform: [{ translateX: indicatorPosition.value * tabWidth }],
    };
  });

  return (
    <View
      onLayout={(event) => {
        if (width !== undefined) return;
        const nextWidth = event.nativeEvent.layout.width;
        setMeasuredWidth((currentWidth) =>
          Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth
        );
      }}
      className="relative flex-row items-center rounded-[24px] border border-border/30 bg-interactive p-1 dark:border-border-dark/30 dark:bg-interactive-dark"
      style={width !== undefined ? { width } : undefined}
    >
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-1 left-1 top-1 rounded-full bg-surface-navigation dark:bg-surface-navigation-dark"
        style={[animatedIndicatorStyle, activeShadow]}
      />
      {TABS.map((tab) => (
        <TabButton
          key={tab}
          label={tab.charAt(0).toUpperCase() + tab.slice(1)}
          isActive={activeTab === tab}
          onPress={() => onTabChange(tab)}
        />
      ))}
    </View>
  );
}

function TabButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      className="z-10 h-10 flex-1 items-center justify-center rounded-full px-2"
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Text
        className={[
          'text-[13px] font-semibold',
          isActive
            ? 'text-content-primary dark:text-content-primary-dark'
            : 'text-content-secondary dark:text-content-secondary-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
