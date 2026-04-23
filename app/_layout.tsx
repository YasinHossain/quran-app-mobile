import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { AudioPlayerBar } from '@/components/audio/AudioPlayerBar';
import Colors from '@/constants/Colors';
import { BookmarkProvider } from '@/providers/BookmarkContext';
import { ChaptersProvider } from '@/providers/ChaptersContext';
import { AudioPlayerProvider } from '@/providers/AudioPlayerContext';
import { LayoutMetricsProvider } from '@/providers/LayoutMetricsContext';
import { SettingsProvider } from '@/providers/SettingsContext';
import { StartupResourcePrefetch } from '@/providers/StartupResourcePrefetch';
import { AppThemeProvider, useAppTheme } from '@/providers/ThemeContext';
import { initializeAudioModeAsync } from '@/src/core/infrastructure/audio/audioMode';
import { initializeAppDbAsync } from '@/src/core/infrastructure/db';
import { STARTUP_FONT_ASSETS } from '@/src/core/infrastructure/fonts/arabicFonts';
import { bootstrapBundledMushafPacksAsync } from '@/src/core/infrastructure/mushaf/bootstrapBundledPacks';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(STARTUP_FONT_ASSETS);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAsync(): Promise<void> {
      try {
        await Promise.all([
          initializeAudioModeAsync(),
          initializeAppDbAsync(),
          bootstrapBundledMushafPacksAsync(),
        ]);
      } finally {
        if (!cancelled) {
          setIsBootstrapped(true);
        }
      }
    }

    void bootstrapAsync();

    return () => {
      cancelled = true;
    };
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && isBootstrapped) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, isBootstrapped]);

  if (!loaded || !isBootstrapped) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppThemeProvider>
        <SettingsProvider>
          <StartupResourcePrefetch />
          <ChaptersProvider>
            <BookmarkProvider>
              <AudioPlayerProvider>
                <LayoutMetricsProvider>
                  <RootLayoutNav />
                </LayoutMetricsProvider>
              </AudioPlayerProvider>
            </BookmarkProvider>
          </ChaptersProvider>
        </SettingsProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { resolvedTheme } = useAppTheme();
  const isDark = resolvedTheme === 'dark';
  const palette = Colors[isDark ? 'dark' : 'light'];
  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: palette.tint,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.tint,
    },
  } as const;

  return (
    <ThemeProvider value={theme}>
      <View className={isDark ? 'flex-1 dark' : 'flex-1'} style={{ backgroundColor: palette.background }}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: palette.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <AudioPlayerBar />
      </View>
    </ThemeProvider>
  );
}
