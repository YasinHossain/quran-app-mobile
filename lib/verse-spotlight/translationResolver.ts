import {
  BUNDLED_SAHIH_TRANSLATION_ID,
  getBundledFallbackVerse,
} from './bundledFallback';
import { isValidVerseKey } from './canonicalIndex';
import type {
  SpotlightVerseContent,
  TranslationDownloadIndexReader,
  TranslationVerseReader,
} from './contracts';

function normalizeRequestedTranslationId(value: number): number {
  if (!Number.isFinite(value)) return BUNDLED_SAHIH_TRANSLATION_ID;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : BUNDLED_SAHIH_TRANSLATION_ID;
}

function resolveBundled(verseKey: string, requestedTranslationId: number): SpotlightVerseContent {
  const fallback = getBundledFallbackVerse(verseKey);
  if (!fallback || !isValidVerseKey(verseKey)) {
    throw new Error(`Cannot resolve invalid Verse Spotlight key: ${verseKey}`);
  }
  return {
    verseKey,
    arabicUthmani: fallback.arabicUthmani,
    translationText: fallback.text,
    requestedTranslationId,
    effectiveTranslationId: BUNDLED_SAHIH_TRANSLATION_ID,
    source: 'bundled-fallback',
  };
}

export async function resolveSpotlightVerse(params: {
  requestedTranslationId: number;
  verseKey: string;
  downloadIndex: TranslationDownloadIndexReader;
  offlineTranslations: TranslationVerseReader;
}): Promise<SpotlightVerseContent> {
  const requestedTranslationId = normalizeRequestedTranslationId(params.requestedTranslationId);
  if (!isValidVerseKey(params.verseKey)) {
    throw new Error(`Cannot resolve invalid Verse Spotlight key: ${params.verseKey}`);
  }

  if (requestedTranslationId === BUNDLED_SAHIH_TRANSLATION_ID) {
    return resolveBundled(params.verseKey, requestedTranslationId);
  }

  try {
    const downloadItem = await params.downloadIndex.get({
      kind: 'translation',
      translationId: requestedTranslationId,
    });
    if (downloadItem?.status !== 'installed' || downloadItem.error) {
      return resolveBundled(params.verseKey, requestedTranslationId);
    }

    const offlineVerse = await params.offlineTranslations.getVerseWithTranslations(
      params.verseKey,
      [requestedTranslationId]
    );
    const translation = offlineVerse?.translations.find(
      (item) =>
        item.translationId === requestedTranslationId &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0
    );

    if (
      offlineVerse?.verseKey !== params.verseKey ||
      !offlineVerse.arabicUthmani?.trim() ||
      !translation
    ) {
      return resolveBundled(params.verseKey, requestedTranslationId);
    }

    return {
      verseKey: params.verseKey,
      arabicUthmani: offlineVerse.arabicUthmani,
      translationText: translation.text,
      requestedTranslationId,
      effectiveTranslationId: requestedTranslationId,
      source: 'installed',
    };
  } catch {
    return resolveBundled(params.verseKey, requestedTranslationId);
  }
}
