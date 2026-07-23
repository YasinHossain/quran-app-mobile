import payloadJson from '../../../../dist/translation-packs/translations/20/2026-04-23/payload.json';

import type { TranslationPackPayload, TranslationPackPayloadVerse } from '@/types';
import { container } from '@/src/core/infrastructure/di/container';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

export const BUNDLED_SAHEEH_TRANSLATION_ID = 20;
export const BUNDLED_SAHEEH_VERSION = '2026-04-23';

const EXPECTED_VERSE_COUNT = 6236;
const payload = payloadJson as TranslationPackPayload;

function validatePayload(): TranslationPackPayloadVerse[] {
  if (
    payload.translationId !== BUNDLED_SAHEEH_TRANSLATION_ID ||
    payload.version !== BUNDLED_SAHEEH_VERSION ||
    payload.format !== 'translation-json-v1' ||
    !Array.isArray(payload.verses) ||
    payload.verses.length !== EXPECTED_VERSE_COUNT
  ) {
    throw new Error('Bundled Saheeh International payload metadata is invalid.');
  }

  const verseKeys = new Set<string>();
  for (const verse of payload.verses) {
    const expectedVerseKey = `${verse.surahId}:${verse.ayahNumber}`;
    if (
      verse.verseKey !== expectedVerseKey ||
      !verse.arabicUthmani?.trim() ||
      !verse.text?.trim() ||
      verseKeys.has(verse.verseKey)
    ) {
      throw new Error(`Bundled Saheeh International contains an invalid verse: ${verse.verseKey}`);
    }
    verseKeys.add(verse.verseKey);
  }

  return payload.verses;
}

export async function bootstrapBundledSaheehInternationalAsync(): Promise<void> {
  const content = {
    kind: 'translation' as const,
    translationId: BUNDLED_SAHEEH_TRANSLATION_ID,
  };
  const downloadIndex = container.getDownloadIndexRepository();
  const existing = await downloadIndex.get(content);
  if (existing?.status === 'installed' && !existing.error) return;

  const verses = validatePayload();
  const offlineStore = container.getTranslationOfflineStore();

  try {
    await offlineStore.upsertBundledTranslationPack({
      translationId: BUNDLED_SAHEEH_TRANSLATION_ID,
      verses,
    });

    await downloadIndex.upsert(content, {
      status: 'installed',
      progress: null,
      error: null,
    });
  } catch (error) {
    logger.error('Failed to bootstrap bundled Saheeh International', undefined, error as Error);
    throw error;
  }
}

export function getBundledSaheehVerses(): readonly TranslationPackPayloadVerse[] {
  return payload.verses;
}
