import React from 'react';
import { Bookmark, BookOpen, Calendar, Info, Settings } from 'lucide-react-native';
import { Link, Tabs } from 'expo-router';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';

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
  return <Icon color={color} size={24} strokeWidth={2.25} />;
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
  const palette = Colors[resolvedTheme];

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
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: palette.background },
        headerTitleStyle: { color: palette.text },
        headerTintColor: palette.text,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Read',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={BookOpen} color={color} />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <Info
                    color={palette.text}
                    size={22}
                    strokeWidth={2.25}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          href: null,
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
