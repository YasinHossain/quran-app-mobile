import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { Platform, StatusBar as NativeStatusBar, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { AudioPlayerBar } from '@/components/audio/AudioPlayerBar';
import Colors from '@/constants/Colors';
import { BookmarkProvider } from '@/providers/BookmarkContext';
import { ChaptersProvider } from '@/providers/ChaptersContext';
import { AudioPlayerProvider } from '@/providers/AudioPlayerContext';
import { LayoutMetricsProvider } from '@/providers/LayoutMetricsContext';
import { SettingsProvider } from '@/providers/SettingsContext';
import { StartupResourcePrefetch } from '@/providers/StartupResourcePrefetch';
import { UiLanguageProvider } from '@/providers/UiLanguageContext';
import { StatusBar } from 'expo-status-bar';
import { AppThemeProvider, useAppTheme, THEME_STORAGE_KEY, ThemePreference } from '@/providers/ThemeContext';
import { getCachedItem, preloadItems } from '@/lib/storage/appStorage';
import { HOME_SPOTLIGHT_CONTENT_KEY, QUICK_LINKS_STORAGE_KEY } from '@/lib/home/storageKeys';
import { VERSE_SPOTLIGHT_STORAGE_KEYS } from '@/lib/verse-spotlight/engine';
import { LAST_READ_STORAGE_KEY } from '@/providers/bookmarks/constants';
import { SETTINGS_KEY } from '@/providers/settingsStorage';
import { initializeAudioModeAsync } from '@/src/core/infrastructure/audio/audioMode';
import {
  DEFAULT_ARABIC_FONT_FAMILY,
  getFirstFontFamily,
  isAppFontFamily,
  loadFontFamilyAsync,
  STARTUP_FONT_ASSETS,
} from '@/src/core/infrastructure/fonts/arabicFonts';
import { bootstrapBundledSaheehInternationalAsync } from '@/src/core/infrastructure/translations/bundledSaheehInternational';
import { WELCOME_COMPLETED_STORAGE_KEY } from '@/lib/onboarding/initialSetup';
import { WelcomeProvider, useWelcome } from '@/providers/WelcomeContext';
import { OverlayPortalProvider } from '@/providers/OverlayPortalContext';
import { getCachedSettings } from '@/providers/settingsStorage';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

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
  const [startupState, setStartupState] = useState<{
    themePreference: ThemePreference;
    hasCompletedWelcome: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStartupStateAsync(): Promise<void> {
      await preloadItems([
        THEME_STORAGE_KEY,
        SETTINGS_KEY,
        WELCOME_COMPLETED_STORAGE_KEY,
        LAST_READ_STORAGE_KEY,
        QUICK_LINKS_STORAGE_KEY,
        VERSE_SPOTLIGHT_STORAGE_KEYS.home,
        HOME_SPOTLIGHT_CONTENT_KEY,
      ]);

      const selectedFont = getFirstFontFamily(getCachedSettings()?.arabicFontFace);
      if (
        selectedFont &&
        selectedFont !== DEFAULT_ARABIC_FONT_FAMILY &&
        isAppFontFamily(selectedFont)
      ) {
        try {
          await loadFontFamilyAsync(selectedFont);
        } catch (fontError) {
          logger.error('Failed to load selected Arabic font', undefined, fontError as Error);
        }
      }

      if (cancelled) return;
      const storedTheme = getCachedItem(THEME_STORAGE_KEY);
      setStartupState({
        themePreference:
          storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
            ? storedTheme
            : 'system',
        hasCompletedWelcome: getCachedItem(WELCOME_COMPLETED_STORAGE_KEY) === 'true',
      });
    }

    void loadStartupStateAsync();

    return () => {
      cancelled = true;
    };
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!loaded || !startupState) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void SplashScreen.hideAsync().catch((hideError) => {
      logger.warn('Failed to hide startup splash screen', undefined, hideError as Error);
    }).then(() => {
      if (cancelled) return;
      // Let Home paint before opening SQLite and configuring audio.
      timer = setTimeout(() => {
        void initializeAudioModeAsync();
        void bootstrapBundledSaheehInternationalAsync().catch((bootstrapError) => {
          logger.error('Failed to initialize bundled translation', undefined, bootstrapError as Error);
        });
      }, 250);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loaded, startupState]);

  if (!loaded || !startupState) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppThemeProvider initialPreference={startupState.themePreference}>
        <WelcomeProvider initialCompleted={startupState.hasCompletedWelcome}>
          <SettingsProvider>
            <UiLanguageProvider>
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
            </UiLanguageProvider>
          </SettingsProvider>
        </WelcomeProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const reduceMotion = Boolean(useReducedMotion());
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
  const router = useRouter();
  const pathname = usePathname();
  const { hasCompletedWelcome } = useWelcome();
  const readerScreenAnimation = reduceMotion || Platform.OS === 'android'
    ? 'none'
    : 'default';

  useEffect(() => {
    if (!hasCompletedWelcome && pathname !== '/welcome') {
      router.replace('/welcome');
    } else if (hasCompletedWelcome && pathname === '/welcome') {
      router.replace('/');
    }
  }, [hasCompletedWelcome, pathname, router]);

  useEffect(() => {
    NativeStatusBar.setBackgroundColor(palette.background, true);
  }, [palette.background]);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OverlayPortalProvider>
        <View className={isDark ? 'flex-1 dark' : 'flex-1'} style={{ backgroundColor: palette.background }}>
          <Stack
            initialRouteName={hasCompletedWelcome ? '(tabs)' : 'welcome'}
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="surah/[surahId]"
              options={{ animation: readerScreenAnimation }}
            />
            <Stack.Screen
              name="juz/[juzNumber]"
              options={{ animation: readerScreenAnimation }}
            />
            <Stack.Screen
              name="page/[pageNumber]"
              options={{ animation: readerScreenAnimation }}
            />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            <Stack.Screen name="downloads" options={{ presentation: 'modal' }} />
            <Stack.Screen name="manage-word-study" options={{ presentation: 'modal' }} />
            <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="word-study-sources" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="study/word/[surah]/[ayah]/[position]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
          </Stack>
          {hasCompletedWelcome ? <AudioPlayerBar /> : null}
        </View>
      </OverlayPortalProvider>
    </ThemeProvider>
  );
}
