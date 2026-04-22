import React from 'react';

import { getItem, parseJson, setItem } from '@/lib/storage/appStorage';
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

type StoredTranslationResourcePayload = {
  version: 1;
  language: string;
  updatedAt: number;
  translations: TranslationResource[];
};

const STORAGE_KEY_PREFIX = 'quranApp:translations:resources:v1:';
const STORAGE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const cachedByLanguage = new Map<string, TranslationResource[]>();
const cachedMetaByLanguage = new Map<string, { updatedAt: number }>();
const cachedPromises = new Map<string, Promise<TranslationResource[]>>();
const cachedStoragePromises = new Map<string, Promise<TranslationResource[] | null>>();

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

function isStale(updatedAt: number): boolean {
  return Date.now() - updatedAt > STORAGE_TTL_MS;
}

function storageKey(language: string): string {
  return `${STORAGE_KEY_PREFIX}${normalizeLanguage(language)}`;
}

function toStoredTranslationResource(value: unknown): TranslationResource | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = toPositiveInt(record.id);
  if (!id) return null;
  const name = String(record.name ?? '').trim();
  if (!name) return null;

  return {
    id,
    name,
    authorName: String(record.authorName ?? '').trim(),
    languageName: String(record.languageName ?? '').trim(),
  };
}

async function hydrateTranslationsFromStorage(language: string): Promise<TranslationResource[] | null> {
  const normalizedLanguage = normalizeLanguage(language);
  const cached = cachedByLanguage.get(normalizedLanguage);
  if (cached) return cached;

  const existingPromise = cachedStoragePromises.get(normalizedLanguage);
  if (existingPromise) return existingPromise;

  const promise = getItem(storageKey(normalizedLanguage))
    .then((raw) => {
      const parsed = parseJson<StoredTranslationResourcePayload>(raw);
      if (!parsed || parsed.version !== 1) return null;
      if (normalizeLanguage(parsed.language) !== normalizedLanguage) return null;
      if (!Array.isArray(parsed.translations)) return null;

      const translations = parsed.translations
        .map(toStoredTranslationResource)
        .filter((t): t is TranslationResource => t !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (translations.length === 0) return null;

      cachedByLanguage.set(normalizedLanguage, translations);
      const updatedAt =
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) && parsed.updatedAt > 0
          ? parsed.updatedAt
          : 0;
      cachedMetaByLanguage.set(normalizedLanguage, { updatedAt });
      return translations;
    })
    .catch(() => null)
    .finally(() => {
      cachedStoragePromises.delete(normalizedLanguage);
    });

  cachedStoragePromises.set(normalizedLanguage, promise);
  return promise;
}

async function persistTranslations(language: string, translations: TranslationResource[]): Promise<void> {
  const normalizedLanguage = normalizeLanguage(language);
  const payload: StoredTranslationResourcePayload = {
    version: 1,
    language: normalizedLanguage,
    updatedAt: Date.now(),
    translations,
  };

  await setItem(storageKey(normalizedLanguage), JSON.stringify(payload));
}

async function loadTranslations(
  language: string,
  options?: {
    force?: boolean;
  }
): Promise<TranslationResource[]> {
  const normalizedLanguage = normalizeLanguage(language);
  if (!options?.force) {
    const cached = cachedByLanguage.get(normalizedLanguage);
    if (cached) return cached;
  }

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
      cachedMetaByLanguage.set(normalizedLanguage, { updatedAt: Date.now() });
      cachedPromises.delete(normalizedLanguage);
      void persistTranslations(normalizedLanguage, translations);
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

  const fetchNow = React.useCallback(async (options?: { force?: boolean }): Promise<void> => {
    if (!enabled) return;
    setErrorMessage(null);

    const force = options?.force ?? false;

    try {
      const cached = cachedByLanguage.get(normalizedLanguage);
      if (cached && cached.length > 0 && !force) {
        setTranslations(cached);
        setIsLoading(false);
        const meta = cachedMetaByLanguage.get(normalizedLanguage);
        if (meta && isStale(meta.updatedAt)) {
          void loadTranslations(normalizedLanguage, { force: true })
            .then((result) => setTranslations(result))
            .catch((error) => {
              logger.warn(
                'Failed to refresh translation resources',
                { language: normalizedLanguage },
                error as Error
              );
            });
        }
        return;
      }

      if (!force) {
        const stored = await hydrateTranslationsFromStorage(normalizedLanguage);
        if (stored && stored.length > 0) {
          setTranslations(stored);
          setIsLoading(false);
          const meta = cachedMetaByLanguage.get(normalizedLanguage);
          if (meta && isStale(meta.updatedAt)) {
            void loadTranslations(normalizedLanguage, { force: true })
              .then((result) => setTranslations(result))
              .catch((error) => {
                logger.warn(
                  'Failed to refresh translation resources',
                  { language: normalizedLanguage },
                  error as Error
                );
              });
          }
          return;
        }
      }

      setIsLoading(true);
      const result = await loadTranslations(normalizedLanguage, { force });
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
    void fetchNow({ force: true });
  }, [fetchNow]);

  const translationsById = React.useMemo(
    () => new Map<number, TranslationResource>(translations.map((t) => [t.id, t])),
    [translations]
  );

  return { translations, translationsById, isLoading, errorMessage, refresh };
}
