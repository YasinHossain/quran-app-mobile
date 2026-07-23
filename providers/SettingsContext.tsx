import React, { createContext, useContext, useEffect, useMemo } from 'react';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { syncAndroidVerseSpotlightWidget } from '@/lib/verse-spotlight/androidWidgetSync';
import { usePersistentSettings } from '@/providers/hooks/usePersistentSettings';
import { ARABIC_FONTS } from '@/providers/settingsStorage';
import { getDownloadKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { container } from '@/src/core/infrastructure/di/container';
import { loadArabicSupportFontsAsync } from '@/src/core/infrastructure/fonts/arabicFonts';

import type { MushafPackId, MushafScaleStep, Settings } from '@/types';

type SettingsSetters = Pick<
  SettingsContextType,
  | 'setSettings'
  | 'setShowByWords'
  | 'setTajweed'
  | 'setTajweedMushaf'
  | 'setWordLang'
  | 'setWordTranslationId'
  | 'setTafsirIds'
  | 'setTranslationIds'
  | 'setArabicFontSize'
  | 'setTranslationFontSize'
  | 'setTafsirFontSize'
  | 'setArabicFontFace'
  | 'setMushafId'
  | 'setMushafScaleStep'
  | 'setContentLanguage'
  | 'setUiLanguage'
  | 'setReadingMode'
>;

const createSetters = (
  dispatch: ReturnType<typeof usePersistentSettings>['dispatch']
): SettingsSetters => ({
  setSettings: (s: Settings): void => dispatch({ type: 'SET_SETTINGS', value: s }),
  setShowByWords: (val: boolean): void => dispatch({ type: 'SET_SHOW_BY_WORDS', value: val }),
  setTajweed: (val: boolean): void => dispatch({ type: 'SET_TAJWEED', value: val }),
  setTajweedMushaf: (tajweed: boolean, mushafId: MushafPackId): void =>
    dispatch({ type: 'SET_TAJWEED_MUSHAF', value: { tajweed, mushafId } }),
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
  setMushafId: (mushafId: MushafPackId | undefined): void =>
    dispatch({ type: 'SET_MUSHAF_ID', value: mushafId }),
  setMushafScaleStep: (step: MushafScaleStep): void =>
    dispatch({ type: 'SET_MUSHAF_SCALE_STEP', value: step }),
  setContentLanguage: (language: string): void =>
    dispatch({ type: 'SET_CONTENT_LANGUAGE', value: language }),
  setUiLanguage: (language: string): void =>
    dispatch({ type: 'SET_UI_LANGUAGE', value: language }),
  setReadingMode: (mode: 'translations' | 'mushaf'): void =>
    dispatch({ type: 'SET_READING_MODE', value: mode }),
});

interface SettingsContextType {
  settings: Settings;
  isHydrated: boolean;
  arabicFonts: { name: string; value: string; category: string }[];
  setSettings: (settings: Settings) => void;
  setShowByWords: (val: boolean) => void;
  setTajweed: (val: boolean) => void;
  setTajweedMushaf: (tajweed: boolean, mushafId: MushafPackId) => void;
  setWordLang: (lang: string) => void;
  setWordTranslationId: (id: number) => void;
  setTafsirIds: (ids: number[]) => void;
  setTranslationIds: (ids: number[]) => void;
  setArabicFontSize: (size: number) => void;
  setTranslationFontSize: (size: number) => void;
  setTafsirFontSize: (size: number) => void;
  setArabicFontFace: (font: string) => void;
  setMushafId: (mushafId: MushafPackId | undefined) => void;
  setMushafScaleStep: (step: MushafScaleStep) => void;
  setContentLanguage: (language: string) => void;
  setUiLanguage: (language: string) => void;
  setReadingMode: (mode: 'translations' | 'mushaf') => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const { settings, dispatch, isHydrated } = usePersistentSettings();
  const setters = useMemo(() => createSetters(dispatch), [dispatch]);
  const selectedTafsirIds = settings.tafsirIds ?? [];
  const selectedTafsirIdsKey = useMemo(() => selectedTafsirIds.join(','), [selectedTafsirIds]);
  const [verifiedTafsirSelectionKey, setVerifiedTafsirSelectionKey] = React.useState('');
  const requestedTranslationId = Array.isArray(settings.translationIds)
    ? (settings.translationIds[0] ?? null)
    : (settings.translationId ?? null);
  const {
    itemsByKey: downloadItemsByKey,
    isLoading: isDownloadIndexLoading,
    errorMessage: downloadIndexErrorMessage,
    refresh: refreshDownloadIndex,
  } = useDownloadIndexItems({
    enabled: isHydrated && selectedTafsirIds.length > 0,
    pollIntervalMs: 0,
  });

  useEffect(() => {
    void loadArabicSupportFontsAsync(settings.arabicFontFace);
  }, [settings.arabicFontFace]);

  useEffect(() => {
    if (!isHydrated) return;

    const repository = container.getDownloadIndexRepository();
    const synchronize = (): void => {
      void syncAndroidVerseSpotlightWidget(requestedTranslationId);
    };

    synchronize();
    return repository.subscribe(synchronize);
  }, [isHydrated, requestedTranslationId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (selectedTafsirIds.length === 0) {
      setVerifiedTafsirSelectionKey('');
      return;
    }

    let cancelled = false;
    setVerifiedTafsirSelectionKey('');

    refreshDownloadIndex().finally(() => {
      if (cancelled) return;
      setVerifiedTafsirSelectionKey(selectedTafsirIdsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [
    isHydrated,
    refreshDownloadIndex,
    selectedTafsirIds.length,
    selectedTafsirIdsKey,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    if (selectedTafsirIds.length === 0) return;
    if (isDownloadIndexLoading || downloadIndexErrorMessage) return;
    if (verifiedTafsirSelectionKey !== selectedTafsirIdsKey) return;

    const installedTafsirIds = selectedTafsirIds.filter((tafsirId) => {
      const item = downloadItemsByKey.get(getDownloadKey({ kind: 'tafsir', tafsirId }));
      return item?.status === 'installed';
    });

    const unchanged =
      installedTafsirIds.length === selectedTafsirIds.length &&
      installedTafsirIds.every((id, index) => id === selectedTafsirIds[index]);

    if (unchanged) return;
    dispatch({ type: 'SET_TAFSIR_IDS', value: installedTafsirIds });
  }, [
    dispatch,
    downloadIndexErrorMessage,
    downloadItemsByKey,
    isDownloadIndexLoading,
    isHydrated,
    selectedTafsirIds,
    selectedTafsirIdsKey,
    verifiedTafsirSelectionKey,
  ]);

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
