import React from 'react';
import { Bookmark, Home, Calendar, Search } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import { Easing, Platform, View, type LayoutChangeEvent } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
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

export default function TabLayout() {
  const { resolvedTheme } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const insets = useSafeAreaInsets();
  const bottomPadding = getTabBarBottomPadding(insets.bottom);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Tabs
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
          headerShown: false,
          headerStyle: { backgroundColor: palette.background },
          headerTitleStyle: { color: palette.text },
          headerTintColor: palette.text,
          animation: 'shift',
          transitionSpec: {
            animation: 'timing',
            config: {
              duration: 200,
              easing: Easing.out(Easing.cubic),
            },
          },
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
