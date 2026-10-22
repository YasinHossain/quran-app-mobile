import { NativeModules, Platform } from 'react-native';

import { CANONICAL_VERSE_KEYS } from './canonicalIndex';
import { BUNDLED_SAHIH_TRANSLATION_ID } from './bundledFallback';
import { container } from '@/src/core/infrastructure/di/container';
import { getAppDbAsync } from '@/src/core/infrastructure/db';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

type NativeVerseSpotlightWidgetModule = {
  syncContent(payloadJson: string): Promise<void>;
};

type WidgetCachedTranslation = {
  translationId: number;
  verses: Array<{ verseKey: string; text: string }>;
};

export type AndroidWidgetSyncPayload = {
  schemaVersion: 1;
  requestedTranslationId: number;
  translationSelected: boolean;
  cachedTranslation: WidgetCachedTranslation | null;
  updatedAt: number;
};

const nativeModule = NativeModules.VerseSpotlightWidget as
  | NativeVerseSpotlightWidgetModule
  | undefined;

let syncQueue: Promise<void> = Promise.resolve();
let lastFingerprint = '';

function normalizeTranslationId(value: number): number {
  if (!Number.isFinite(value)) return BUNDLED_SAHIH_TRANSLATION_ID;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : BUNDLED_SAHIH_TRANSLATION_ID;
}

async function readCompleteTranslation(
  translationId: number
): Promise<WidgetCachedTranslation | null> {
  if (translationId === BUNDLED_SAHIH_TRANSLATION_ID) return null;

  const db = await getAppDbAsync();
  const rows = await db.getAllAsync<{ verse_key: string; text: string }>(
    `
    SELECT verse_key, text
    FROM offline_translations
    WHERE translation_id = ?
    ORDER BY verse_key;
    `,
    [translationId]
  );

  if (rows.length !== CANONICAL_VERSE_KEYS.length) return null;

  const textByKey = new Map(
    rows
      .filter((row) => row.verse_key && row.text?.trim())
      .map((row) => [row.verse_key, row.text.trim()] as const)
  );
  if (textByKey.size !== CANONICAL_VERSE_KEYS.length) return null;

  const verses: WidgetCachedTranslation['verses'] = [];
  for (const verseKey of CANONICAL_VERSE_KEYS) {
    const text = textByKey.get(verseKey);
    if (!text) return null;
    verses.push({ verseKey, text });
  }

  return {
    translationId,
    verses,
  };
}

async function buildPayload(
  requestedTranslationId: number | null
): Promise<AndroidWidgetSyncPayload> {
  const translationSelected = requestedTranslationId != null;
  const normalizedId = normalizeTranslationId(
    requestedTranslationId ?? BUNDLED_SAHIH_TRANSLATION_ID
  );
  if (!translationSelected) {
    return {
      schemaVersion: 1,
      requestedTranslationId: normalizedId,
      translationSelected: false,
      cachedTranslation: null,
      updatedAt: Date.now(),
    };
  }

  const item = await container
    .getDownloadIndexRepository()
    .get({ kind: 'translation', translationId: normalizedId });
  const isInstalled = item?.status === 'installed';

  return {
    schemaVersion: 1,
    requestedTranslationId: normalizedId,
    translationSelected: true,
    cachedTranslation: isInstalled ? await readCompleteTranslation(normalizedId) : null,
    updatedAt: Date.now(),
  };
}

export function syncAndroidVerseSpotlightWidget(
  requestedTranslationId: number | null,
  options: { force?: boolean } = {}
): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule?.syncContent) {
    return Promise.resolve();
  }

  const translationSelected = requestedTranslationId != null;
  const normalizedId = normalizeTranslationId(
    requestedTranslationId ?? BUNDLED_SAHIH_TRANSLATION_ID
  );
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(async () => {
      const item = translationSelected
        ? await container
            .getDownloadIndexRepository()
            .get({ kind: 'translation', translationId: normalizedId })
        : null;
      const fingerprint = `${translationSelected}:${normalizedId}:${item?.status ?? 'missing'}`;
      if (!options.force && fingerprint === lastFingerprint) return;

      const payload = await buildPayload(translationSelected ? normalizedId : null);
      await nativeModule.syncContent(JSON.stringify(payload));
      lastFingerprint = fingerprint;
    })
    .catch((error) => {
      logger.warn(
        'Failed to synchronize the Android Verse Spotlight widget cache',
        { requestedTranslationId: normalizedId, translationSelected },
        error as Error
      );
    });

  return syncQueue;
}
