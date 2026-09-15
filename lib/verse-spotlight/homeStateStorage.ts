import { getBundledFallbackVerse } from './bundledFallback';
import { HOME_SPOTLIGHT_CONTENT_KEY } from '../home/storageKeys';
import { isValidVerseKey } from './canonicalIndex';
import { HOME_SPOTLIGHT_ROTATION_INTERVAL_MS, VERSE_SPOTLIGHT_STORAGE_KEYS, normalizeSpotlightState } from './engine';
import { getCachedItem, hasCachedItem, getItem, parseJson, setItem } from '../storage/appStorage';

import type { SpotlightVerseContent, VerseSpotlightState } from './contracts';
import { loadHomeSpotlightState, saveSpotlightState } from './persistence';

const appStorage = { getItem, setItem };

// Keep the last hydrated home state in memory. Tab screens can be remounted
// during navigation; re-reading the same tiny preference from storage adds
// latency and makes the spotlight visibly flash on every return.
let memoryState: VerseSpotlightState | null = null;

export function getPreloadedHomeSpotlightSnapshot(requestedTranslationId: number): {
  state: VerseSpotlightState;
  content: SpotlightVerseContent;
} | null {
  const stateKey = VERSE_SPOTLIGHT_STORAGE_KEYS.home;
  if (!hasCachedItem(stateKey)) return null;

  const state = normalizeSpotlightState(parseJson<unknown>(getCachedItem(stateKey)), {
    surface: 'home',
    now: Date.now(),
    rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
    requestedTranslationId,
  });
  memoryState = state;

  const stored = parseJson<Partial<SpotlightVerseContent>>(getCachedItem(HOME_SPOTLIGHT_CONTENT_KEY));
  if (
    stored &&
    isValidVerseKey(stored.verseKey) &&
    stored.verseKey === state.verseKey &&
    stored.requestedTranslationId === requestedTranslationId &&
    (stored.effectiveTranslationId === requestedTranslationId || stored.effectiveTranslationId === 20) &&
    (stored.source === 'installed' || stored.source === 'bundled-fallback') &&
    typeof stored.translationText === 'string' && stored.translationText.trim() &&
    typeof stored.arabicUthmani === 'string' && stored.arabicUthmani.trim()
  ) {
    return { state, content: stored as SpotlightVerseContent };
  }

  const bundled = getBundledFallbackVerse(state.verseKey);
  if (!bundled) return null;
  return {
    state,
    content: {
      verseKey: state.verseKey,
      arabicUthmani: bundled.arabicUthmani,
      translationText: bundled.text,
      requestedTranslationId,
      effectiveTranslationId: 20,
      source: 'bundled-fallback',
    },
  };
}

export function persistHomeSpotlightContent(content: SpotlightVerseContent): Promise<void> {
  const serialized = JSON.stringify(content);
  if (
    hasCachedItem(HOME_SPOTLIGHT_CONTENT_KEY) &&
    getCachedItem(HOME_SPOTLIGHT_CONTENT_KEY) === serialized
  ) {
    return Promise.resolve();
  }
  return setItem(HOME_SPOTLIGHT_CONTENT_KEY, serialized);
}

export function hydrateHomeSpotlightState(params: {
  now: number;
  requestedTranslationId: number;
  random?: () => number;
}): Promise<VerseSpotlightState> {
  if (memoryState && memoryState.requestedTranslationId === params.requestedTranslationId) {
    return Promise.resolve(memoryState);
  }
  return loadHomeSpotlightState({ storage: appStorage, ...params }).then((state) => {
    memoryState = state;
    return state;
  });
}

export function persistHomeSpotlightState(state: VerseSpotlightState): Promise<void> {
  if (state.surface !== 'home') {
    return Promise.reject(new Error('Cannot persist non-Home state in Home Spotlight storage.'));
  }
  memoryState = state;
  if (
    hasCachedItem(VERSE_SPOTLIGHT_STORAGE_KEYS.home) &&
    getCachedItem(VERSE_SPOTLIGHT_STORAGE_KEYS.home) === JSON.stringify(state)
  ) {
    return Promise.resolve();
  }
  return saveSpotlightState(appStorage, state);
}
