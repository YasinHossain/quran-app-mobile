import React from 'react';

import { apiFetch } from '@/src/core/infrastructure/api/apiFetch';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

type ApiTranslationResource = {
  id: number;
  name: string;
  author_name?: string;
  language_name?: string;
  translated_name?: { name?: string };
};

type ApiTranslationsResponse = {
  translations: ApiTranslationResource[];
};

export type TranslationResource = {
  id: number;
  name: string;
  authorName: string;
  languageName: string;
};

const cachedByLanguage = new Map<string, TranslationResource[]>();
const cachedPromises = new Map<string, Promise<TranslationResource[]>>();

function normalizeLanguage(value: string | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed.length ? trimmed : 'en';
}

function toPositiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function toTranslationResource(resource: ApiTranslationResource): TranslationResource | null {
  const id = toPositiveInt(resource.id);
  if (!id) return null;

  const name = String(resource.translated_name?.name ?? resource.name ?? '').trim();
  if (!name) return null;

  return {
    id,
    name,
    authorName: String(resource.author_name ?? '').trim(),
    languageName: String(resource.language_name ?? '').trim(),
  };
}

async function loadTranslations(language: string): Promise<TranslationResource[]> {
  const normalizedLanguage = normalizeLanguage(language);
  const cached = cachedByLanguage.get(normalizedLanguage);
  if (cached) return cached;

  const existingPromise = cachedPromises.get(normalizedLanguage);
  if (existingPromise) return existingPromise;

  const promise = apiFetch<ApiTranslationsResponse>(
    '/resources/translations',
    { language: normalizedLanguage },
    'Failed to load translations'
  )
    .then((response) => {
      const translations = (response.translations ?? [])
        .map(toTranslationResource)
        .filter((t): t is TranslationResource => t !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      cachedByLanguage.set(normalizedLanguage, translations);
      cachedPromises.delete(normalizedLanguage);
      return translations;
    })
    .catch((error) => {
      cachedPromises.delete(normalizedLanguage);
      throw error;
    });

  cachedPromises.set(normalizedLanguage, promise);
  return promise;
}

export function useTranslationResources({
  enabled = true,
  language,
}: {
  enabled?: boolean;
  language?: string;
} = {}): {
  translations: TranslationResource[];
  translationsById: Map<number, TranslationResource>;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => void;
} {
  const normalizedLanguage = normalizeLanguage(language);

  const [translations, setTranslations] = React.useState<TranslationResource[]>(
    cachedByLanguage.get(normalizedLanguage) ?? []
  );
  const [isLoading, setIsLoading] = React.useState(
    enabled ? !cachedByLanguage.has(normalizedLanguage) : false
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTranslations(cachedByLanguage.get(normalizedLanguage) ?? []);
    setIsLoading(enabled ? !cachedByLanguage.has(normalizedLanguage) : false);
    setErrorMessage(null);
  }, [enabled, normalizedLanguage]);

  const fetchNow = React.useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await loadTranslations(normalizedLanguage);
      setTranslations(result);
    } catch (error) {
      logger.warn('Failed to load translation resources', { language: normalizedLanguage }, error as Error);
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, normalizedLanguage]);

  React.useEffect(() => {
    void fetchNow();
  }, [fetchNow]);

  const refresh = React.useCallback(() => {
    cachedByLanguage.delete(normalizedLanguage);
    cachedPromises.delete(normalizedLanguage);
    void fetchNow();
  }, [fetchNow, normalizedLanguage]);

  const translationsById = React.useMemo(
    () => new Map<number, TranslationResource>(translations.map((t) => [t.id, t])),
    [translations]
  );

  return { translations, translationsById, isLoading, errorMessage, refresh };
}

