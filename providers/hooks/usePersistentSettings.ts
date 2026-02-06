import { Dispatch, useEffect, useReducer, useRef } from 'react';

import { settingsReducer, type SettingsAction } from '@/providers/settingsReducer';
import { defaultSettings, loadSettings, saveSettings } from '@/providers/settingsStorage';

import type { Settings } from '@/types';

const PERSIST_DEBOUNCE_MS = 300;

interface UsePersistentSettingsReturn {
  settings: Settings;
  dispatch: Dispatch<SettingsAction>;
  isHydrated: boolean;
}

export function usePersistentSettings(): UsePersistentSettingsReturn {
  const [settings, dispatch] = useReducer(settingsReducer, defaultSettings);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSettings = useRef(settings);
  const hasLoadedFromStorage = useRef(false);
  const [isHydrated, setIsHydrated] = useReducer(() => true, false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const loaded = await loadSettings(defaultSettings);
      if (cancelled) return;
      hasLoadedFromStorage.current = true;
      dispatch({ type: 'SET_SETTINGS', value: loaded });
      latestSettings.current = loaded;
      setIsHydrated();
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    latestSettings.current = settings;
    if (!hasLoadedFromStorage.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      void saveSettings(settings);
      timeoutRef.current = null;
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [settings]);

  useEffect(() => {
    return () => {
      if (!timeoutRef.current) return;
      clearTimeout(timeoutRef.current);
      void saveSettings(latestSettings.current);
      timeoutRef.current = null;
    };
  }, []);

  return { settings, dispatch, isHydrated };
}

