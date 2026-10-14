import React from 'react';
import { Bookmark, Home, Calendar, Search } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import {
  I18nManager,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type PressableProps,
} from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarButtonProps,
  type BottomTabBarProps,
  type BottomTabNavigationOptions,
} from 'expo-router/js-tabs';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { horizontalSlideSceneStyle, modalSpringConfig } from '@/components/motion/modalTransition';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

const MIN_TAB_BAR_BOTTOM_PADDING = 12;
const MAX_ANDROID_TAB_BAR_BOTTOM_PADDING = 48;

function getTabBarBottomPadding(bottomInset: number): number {
  const safeBottomInset =
    Platform.OS === 'android'
      ? Math.min(bottomInset, MAX_ANDROID_TAB_BAR_BOTTOM_PADDING)
      : bottomInset;

  return Math.max(safeBottomInset, MIN_TAB_BAR_BOTTOM_PADDING);
}

// Native-driver spring (not timing, which Android samples at 60 fps and judders on 90/120 Hz
// screens) for the pager-style tab slide.
const TAB_TRANSITION_SPEC: BottomTabNavigationOptions['transitionSpec'] = {
  animation: 'spring',
  config: modalSpringConfig('open', 260),
};

function TabBarIcon({
  Icon,
  color,
}: {
  Icon: React.ComponentType<{ color?: any; size?: number; strokeWidth?: number }>;
  color: any;
}) {
  return (
    <Icon 
      color={color} 
      size={24} 
      strokeWidth={1.5} 
    />
  );
}

function ReportingTabBar(props: BottomTabBarProps): React.JSX.Element {
  const { setBottomTabBarHeight } = useLayoutMetrics();
  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      setBottomTabBarHeight(event.nativeEvent.layout.height);
    },
    [setBottomTabBarHeight]
  );

  return (
    <View onLayout={handleLayout}>
      <BottomTabBar {...props} />
    </View>
  );
}

function TabBarButton({
  android_ripple: _androidRipple,
  href: _href,
  hoverEffect: _hoverEffect,
  pressColor: _pressColor,
  pressOpacity: _pressOpacity,
  ref: _ref,
  onPress,
  ...props
}: BottomTabBarButtonProps): React.JSX.Element {
  return <Pressable {...props} onPress={onPress as PressableProps['onPress']} />;
}

export default function TabLayout() {
  const { resolvedTheme } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  // Tabs after the active one sit on the trailing side, which is the left in RTL layouts.
  const slideDistance = I18nManager.isRTL ? -windowWidth : windowWidth;
  const tabTransition = React.useMemo<
    Pick<BottomTabNavigationOptions, 'transitionSpec' | 'sceneStyleInterpolator'>
  >(
    () => ({
      transitionSpec: TAB_TRANSITION_SPEC,
      sceneStyleInterpolator: ({ current }) => ({
        sceneStyle: horizontalSlideSceneStyle(current.progress, slideDistance),
      }),
    }),
    [slideDistance]
  );
  const bottomPadding = getTabBarBottomPadding(insets.bottom);

  return (
    // The tab scene paints the page background; another full-screen fill here only adds GPU work.
    <View style={{ flex: 1 }}>
      <Tabs
        // Keep visited tabs attached. Re-attaching a detached screen rebuilds its display lists
        // and re-uploads its textures on the first frames of the switch, which stalled the
        // slide; hidden tabs sit off-screen, so they are not drawn.
        detachInactiveScreens={false}
        tabBar={(props) => <ReportingTabBar {...props} />}
        screenOptions={{
          tabBarActiveTintColor: palette.tint,
          tabBarInactiveTintColor: palette.tabIconDefault,
          sceneStyle: {
            backgroundColor: palette.background,
            overflow: 'hidden',
          },
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            height: 54 + bottomPadding,
            paddingBottom: bottomPadding,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
          tabBarButton: (props) => <TabBarButton {...props} />,
          headerShown: false,
          headerStyle: { backgroundColor: palette.background },
          headerTitleStyle: { color: palette.text },
          headerTintColor: palette.text,
          ...(reduceMotion ? { animation: 'none' as const } : tabTransition),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('home'),
            tabBarIcon: ({ color }) => <TabBarIcon Icon={Home} color={color} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: t('search'),
            href: null,
            tabBarIcon: ({ color }) => <TabBarIcon Icon={Search} color={color} />,
          }}
        />
        <Tabs.Screen
          name="bookmarks"
          options={{
            title: t('bookmarks'),
            tabBarIcon: ({ color }) => <TabBarIcon Icon={Bookmark} color={color} />,
          }}
        />
        <Tabs.Screen
          name="planner"
          options={{
            title: t('binder_tab_planner'),
            tabBarIcon: ({ color }) => <TabBarIcon Icon={Calendar} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
