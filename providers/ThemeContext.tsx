import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
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

const THEME_STORAGE_KEY = 'quranAppThemePreference';

export function AppThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const systemScheme = (useSystemColorScheme() ?? 'light') as ResolvedTheme;
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    colorScheme.set(preference);
  }, [preference]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const stored = (await getItem(THEME_STORAGE_KEY)) as ThemePreference | null;
      if (cancelled) return;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedTheme: ResolvedTheme = preference === 'system' ? systemScheme : preference;
  const isDark = resolvedTheme === 'dark';

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void setItem(THEME_STORAGE_KEY, next);
  }, []);

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
