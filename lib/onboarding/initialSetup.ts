import { getItem, setItem } from '@/lib/storage/appStorage';
import type { UiLanguageCode } from '@/lib/i18n/uiLanguages';
import {
  DownloadTranslationUseCase,
  requestTranslationDownloadCancel,
} from '@/src/core/application/use-cases/DownloadTranslation';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import initialLanguageDefaults from '../../src/data/initial-language-defaults.json';

export const WELCOME_COMPLETED_STORAGE_KEY = 'quranAppWelcomeCompleted_v1';

export const INITIAL_TRANSLATION_BY_UI_LANGUAGE =
  initialLanguageDefaults as Record<UiLanguageCode, number | null>;

export type InitialTranslationStatus =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'installed'
  | 'failed'
  | 'deleting';

export type InitialTranslationProgress = {
  percent: number;
  status: InitialTranslationStatus;
};

export async function hasCompletedWelcomeAsync(): Promise<boolean> {
  return (await getItem(WELCOME_COMPLETED_STORAGE_KEY)) === 'true';
}

export async function markWelcomeCompletedAsync(): Promise<void> {
  await setItem(WELCOME_COMPLETED_STORAGE_KEY, 'true');
}

export function subscribeInitialTranslationProgress(
  language: UiLanguageCode,
  listener: (progress: InitialTranslationProgress) => void
): () => void {
  const translationId = INITIAL_TRANSLATION_BY_UI_LANGUAGE[language];
  if (!translationId || translationId === 20) {
    listener({ percent: 100, status: 'installed' });
    return () => {};
  }

  const content = { kind: 'translation' as const, translationId };
  const index = container.getDownloadIndexRepository();

  let active = true;

  const emitLatest = () => {
    void index.get(content).then((item) => {
      if (!active) return;
      if (!item) {
        listener({ percent: 0, status: 'idle' });
        return;
      }
      let percent = 0;
      if (item.status === 'installed') {
        percent = 100;
      } else if (item.progress?.kind === 'percent') {
        percent = Math.max(0, Math.min(100, item.progress.percent));
      } else if (item.progress?.kind === 'items' && item.progress.total > 0) {
        percent = Math.max(
          0,
          Math.min(100, Math.round((item.progress.completed / item.progress.total) * 100))
        );
      }
      listener({ percent, status: item.status });
    });
  };

  emitLatest();
  const unsubscribe = index.subscribe(emitLatest);
  return () => {
    active = false;
    unsubscribe();
  };
}

const inFlightInstalls = new Map<number, Promise<boolean>>();

export async function silentlyInstallInitialTranslationAsync(params: {
  language: UiLanguageCode;
  wordLanguage?: string;
  onProgress?: (progress: InitialTranslationProgress) => void;
}): Promise<boolean> {
  const translationId = INITIAL_TRANSLATION_BY_UI_LANGUAGE[params.language];
  if (!translationId || translationId === 20) {
    params.onProgress?.({ percent: 100, status: 'installed' });
    return true;
  }

  let unsubscribeProgress: (() => void) | undefined;
  if (params.onProgress) {
    unsubscribeProgress = subscribeInitialTranslationProgress(params.language, params.onProgress);
  }

  const existingPromise = inFlightInstalls.get(translationId);
  if (existingPromise) {
    try {
      return await existingPromise;
    } finally {
      unsubscribeProgress?.();
    }
  }

  const content = { kind: 'translation' as const, translationId };
  const index = container.getDownloadIndexRepository();

  const installPromise = (async () => {
    try {
      const existing = await index.get(content);
      if (existing?.status === 'installed') {
        return true;
      }

      const useCase = new DownloadTranslationUseCase(
        index,
        container.getTranslationOfflineStore(),
        container.getTranslationDownloadRepository(),
        logger,
        container.getTranslationPackRepository()
      );
      await useCase.execute(translationId, params.wordLanguage);
      return (await index.get(content))?.status === 'installed';
    } catch (error) {
      // Initial setup is intentionally silent and makes exactly one best-effort attempt.
      await index.remove(content).catch(() => undefined);
      logger.info(
        'Initial preferred translation was not installed; continuing with bundled Saheeh',
        { language: params.language, translationId },
        error as Error
      );
      return false;
    } finally {
      inFlightInstalls.delete(translationId);
    }
  })();

  inFlightInstalls.set(translationId, installPromise);

  try {
    return await installPromise;
  } finally {
    unsubscribeProgress?.();
  }
}

export function cancelInitialTranslationAsync(language: UiLanguageCode): void {
  const translationId = INITIAL_TRANSLATION_BY_UI_LANGUAGE[language];
  if (!translationId || translationId === 20) return;
  requestTranslationDownloadCancel(translationId);
  inFlightInstalls.delete(translationId);
}

export function preloadInitialTranslationAsync(params: {
  language: UiLanguageCode;
  wordLanguage?: string;
  onProgress?: (progress: InitialTranslationProgress) => void;
}): Promise<boolean> {
  return silentlyInstallInitialTranslationAsync(params);
}

