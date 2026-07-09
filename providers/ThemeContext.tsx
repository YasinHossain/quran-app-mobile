import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import { colorScheme } from 'nativewind';

import { getItem, setItem } from '@/lib/storage/appStorage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
  setDarkModeEnabled: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = 'quranAppThemePreference';

function getSystemTheme(): ResolvedTheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function resolveThemePreference(
  preference: ThemePreference,
  systemScheme: ResolvedTheme
): ResolvedTheme {
  return preference === 'system' ? systemScheme : preference;
}

export function AppThemeProvider({
  children,
  initialPreference = 'system',
}: {
  children: React.ReactNode;
  initialPreference?: ThemePreference;
}): React.JSX.Element {
  const [systemScheme, setSystemScheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    colorScheme.set(resolveThemePreference(initialPreference, systemScheme));
    return initialPreference;
  });

  const resolvedTheme = resolveThemePreference(preference, systemScheme);
  const isDark = resolvedTheme === 'dark';

  useLayoutEffect(() => {
    colorScheme.set(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme: nextColorScheme }) => {
      const nextSystemScheme: ResolvedTheme = nextColorScheme === 'dark' ? 'dark' : 'light';
      colorScheme.set(resolveThemePreference(preference, nextSystemScheme));
      setSystemScheme(nextSystemScheme);
    });

    return () => {
      subscription.remove();
    };
  }, [preference]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const stored = (await getItem(THEME_STORAGE_KEY)) as ThemePreference | null;
      if (cancelled) return;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        colorScheme.set(resolveThemePreference(stored, systemScheme));
        setPreferenceState(stored);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [systemScheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      colorScheme.set(resolveThemePreference(next, systemScheme));
      setPreferenceState(next);
      void setItem(THEME_STORAGE_KEY, next);
    },
    [systemScheme]
  );

  const setDarkModeEnabled = useCallback(
    (enabled: boolean) => setPreference(enabled ? 'dark' : 'light'),
    [setPreference]
  );

  const value = useMemo<ThemeContextType>(
    () => ({
      preference,
      resolvedTheme,
      isDark,
      setPreference,
      setDarkModeEnabled,
    }),
    [preference, resolvedTheme, isDark, setPreference, setDarkModeEnabled]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}
