import React, { createContext, useContext, useMemo } from 'react';

import { usePersistentSettings } from '@/providers/hooks/usePersistentSettings';
import { ARABIC_FONTS } from '@/providers/settingsStorage';

import type { Settings } from '@/types';

type SettingsSetters = Pick<
  SettingsContextType,
  | 'setSettings'
  | 'setShowByWords'
  | 'setTajweed'
  | 'setWordLang'
  | 'setWordTranslationId'
  | 'setTafsirIds'
  | 'setTranslationIds'
  | 'setArabicFontSize'
  | 'setTranslationFontSize'
  | 'setTafsirFontSize'
  | 'setArabicFontFace'
  | 'setMushafId'
  | 'setContentLanguage'
>;

const createSetters = (
  dispatch: ReturnType<typeof usePersistentSettings>['dispatch']
): SettingsSetters => ({
  setSettings: (s: Settings): void => dispatch({ type: 'SET_SETTINGS', value: s }),
  setShowByWords: (val: boolean): void => dispatch({ type: 'SET_SHOW_BY_WORDS', value: val }),
  setTajweed: (val: boolean): void => dispatch({ type: 'SET_TAJWEED', value: val }),
  setWordLang: (lang: string): void => dispatch({ type: 'SET_WORD_LANG', value: lang }),
  setWordTranslationId: (id: number): void =>
    dispatch({ type: 'SET_WORD_TRANSLATION_ID', value: id }),
  setTafsirIds: (ids: number[]): void => dispatch({ type: 'SET_TAFSIR_IDS', value: ids }),
  setTranslationIds: (ids: number[]): void => dispatch({ type: 'SET_TRANSLATION_IDS', value: ids }),
  setArabicFontSize: (size: number): void =>
    dispatch({ type: 'SET_ARABIC_FONT_SIZE', value: size }),
  setTranslationFontSize: (size: number): void =>
    dispatch({ type: 'SET_TRANSLATION_FONT_SIZE', value: size }),
  setTafsirFontSize: (size: number): void =>
    dispatch({ type: 'SET_TAFSIR_FONT_SIZE', value: size }),
  setArabicFontFace: (font: string): void => dispatch({ type: 'SET_ARABIC_FONT_FACE', value: font }),
  setMushafId: (mushafId: string): void => dispatch({ type: 'SET_MUSHAF_ID', value: mushafId }),
  setContentLanguage: (language: string): void =>
    dispatch({ type: 'SET_CONTENT_LANGUAGE', value: language }),
});

interface SettingsContextType {
  settings: Settings;
  isHydrated: boolean;
  arabicFonts: { name: string; value: string; category: string }[];
  setSettings: (settings: Settings) => void;
  setShowByWords: (val: boolean) => void;
  setTajweed: (val: boolean) => void;
  setWordLang: (lang: string) => void;
  setWordTranslationId: (id: number) => void;
  setTafsirIds: (ids: number[]) => void;
  setTranslationIds: (ids: number[]) => void;
  setArabicFontSize: (size: number) => void;
  setTranslationFontSize: (size: number) => void;
  setTafsirFontSize: (size: number) => void;
  setArabicFontFace: (font: string) => void;
  setMushafId: (mushafId: string) => void;
  setContentLanguage: (language: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const { settings, dispatch, isHydrated } = usePersistentSettings();
  const setters = useMemo(() => createSetters(dispatch), [dispatch]);
  const contextValue = useMemo<SettingsContextType>(
    () => ({
      settings,
      isHydrated,
      arabicFonts: [...ARABIC_FONTS],
      ...setters,
    }),
    [settings, setters, isHydrated]
  );

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

