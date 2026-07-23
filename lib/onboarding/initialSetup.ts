import { getItem, setItem } from '@/lib/storage/appStorage';
import type { UiLanguageCode } from '@/lib/i18n/uiLanguages';
import { DownloadTranslationUseCase } from '@/src/core/application/use-cases/DownloadTranslation';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';
import initialLanguageDefaults from '../../src/data/initial-language-defaults.json';

export const WELCOME_COMPLETED_STORAGE_KEY = 'quranAppWelcomeCompleted_v1';

export const INITIAL_TRANSLATION_BY_UI_LANGUAGE =
  initialLanguageDefaults as Record<UiLanguageCode, number | null>;

export async function hasCompletedWelcomeAsync(): Promise<boolean> {
  return (await getItem(WELCOME_COMPLETED_STORAGE_KEY)) === 'true';
}

export async function markWelcomeCompletedAsync(): Promise<void> {
  await setItem(WELCOME_COMPLETED_STORAGE_KEY, 'true');
}

export async function silentlyInstallInitialTranslationAsync(params: {
  language: UiLanguageCode;
  wordLanguage?: string;
}): Promise<boolean> {
  const translationId = INITIAL_TRANSLATION_BY_UI_LANGUAGE[params.language];
  if (!translationId || translationId === 20) return false;

  const content = { kind: 'translation' as const, translationId };
  const index = container.getDownloadIndexRepository();

  try {
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
  }
}
