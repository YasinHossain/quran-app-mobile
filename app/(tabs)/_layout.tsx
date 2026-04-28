import React from 'react';
import { Bookmark, Home, Calendar, Settings, Search } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import { View, type LayoutChangeEvent } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';

function TabBarIcon({
  Icon,
  color,
}: {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
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
  const [height, setHeight] = React.useState(0);

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      setHeight(h);
      setBottomTabBarHeight(h);
    },
    [setBottomTabBarHeight]
  );

  return (
    <View style={{ backgroundColor: 'transparent' }}>
      <View style={{ height, backgroundColor: 'transparent' }} />
      <View 
        onLayout={handleLayout} 
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'transparent' }}
      >
        <BottomTabBar {...props} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <Tabs
      tabBar={(props) => <ReportingTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: palette.tint,
        tabBarInactiveTintColor: palette.tabIconDefault,
        sceneStyle: {
          backgroundColor: palette.background,
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
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: palette.background },
        headerTitleStyle: { color: palette.text },
        headerTintColor: palette.text,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Home} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          href: null,
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Search} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: 'Bookmarks',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Bookmark} color={color} />,
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planner',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Calendar} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Settings} color={color} />,
        }}
      />
    </Tabs>
  );
}
