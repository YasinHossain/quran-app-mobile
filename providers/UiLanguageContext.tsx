import React, { createContext, useContext, useMemo } from 'react';

import arCommon from '@/locales/ar/common.json';
import bnCommon from '@/locales/bn/common.json';
import enCommon from '@/locales/en/common.json';
import hiCommon from '@/locales/hi/common.json';
import urCommon from '@/locales/ur/common.json';
import { formatLocalizedNumber, localizeDigits } from '@/lib/i18n/localizeNumbers';
import { isUiLanguageCode, type UiLanguageCode } from '@/lib/i18n/uiLanguages';
import { useSettings } from '@/providers/SettingsContext';

type TranslationDictionary = Record<string, unknown>;

const COMMON_TRANSLATIONS: Record<UiLanguageCode, TranslationDictionary> = {
  en: enCommon,
  bn: bnCommon,
  ar: arCommon,
  ur: urCommon,
  hi: hiCommon,
};

type TranslationValues = Record<string, string | number | undefined>;

interface UiLanguageContextType {
  language: UiLanguageCode;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  localizeDigits: (value: string) => string;
  t: (key: string, values?: TranslationValues) => string;
}

const UiLanguageContext = createContext<UiLanguageContextType | undefined>(undefined);

function interpolate(
  template: string,
  language: UiLanguageCode,
  values?: TranslationValues
): string {
  if (!values) return template;

  return template.replace(/<count>{{count,\s*number(?:-group)?}}<\/count>|{{\s*([^,\s}]+)\s*(?:,\s*number(?:-group)?)?\s*}}/g, (match, key) => {
    if (match.startsWith('<count>')) {
      const count = values.count;
      return typeof count === 'number' ? formatLocalizedNumber(count, language) : String(count ?? match);
    }
    const value = values[key];
    if (typeof value === 'number') return formatLocalizedNumber(value, language);
    return value === undefined ? match : String(value);
  });
}

function resolveNestedValue(dictionary: TranslationDictionary, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];

  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, dictionary);
}

export function UiLanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { settings } = useSettings();
  const language = isUiLanguageCode(settings.uiLanguage) ? settings.uiLanguage : 'en';

  const value = useMemo<UiLanguageContextType>(() => {
    const active = COMMON_TRANSLATIONS[language] ?? COMMON_TRANSLATIONS.en;

    return {
      language,
      formatNumber: (numberValue, options) => formatLocalizedNumber(numberValue, language, options),
      localizeDigits: (text) => localizeDigits(text, language),
      t: (key, values) => {
        const activeValue = resolveNestedValue(active, key);
        const fallbackValue = resolveNestedValue(COMMON_TRANSLATIONS.en, key);
        const explicitFallback = values?.fallback;
        const template =
          typeof activeValue === 'string'
            ? activeValue
            : typeof fallbackValue === 'string'
              ? fallbackValue
              : typeof explicitFallback === 'string'
                ? explicitFallback
              : key;
        return localizeDigits(interpolate(template, language, values), language);
      },
    };
  }, [language]);

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiTranslation(): UiLanguageContextType {
  const ctx = useContext(UiLanguageContext);
  if (!ctx) throw new Error('useUiTranslation must be used within UiLanguageProvider');
  return ctx;
}
