import type {
  KeyValueStorage,
  VerseSpotlightState,
  VerseSpotlightSurface,
} from './contracts';
import {
  HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
  VERSE_SPOTLIGHT_STORAGE_KEYS,
  normalizeSpotlightState,
} from './engine';

export async function loadSpotlightState(params: {
  storage: KeyValueStorage;
  surface: VerseSpotlightSurface;
  now: number;
  rotationIntervalMs: number | null;
  requestedTranslationId: number;
  random?: () => number;
}): Promise<VerseSpotlightState> {
  let parsed: unknown = null;
  try {
    const serialized = await params.storage.getItem(VERSE_SPOTLIGHT_STORAGE_KEYS[params.surface]);
    parsed = serialized ? JSON.parse(serialized) : null;
  } catch {
    parsed = null;
  }

  return normalizeSpotlightState(parsed, {
    surface: params.surface,
    now: params.now,
    rotationIntervalMs: params.rotationIntervalMs,
    requestedTranslationId: params.requestedTranslationId,
    random: params.random,
  });
}

export async function saveSpotlightState(
  storage: KeyValueStorage,
  state: VerseSpotlightState
): Promise<void> {
  await storage.setItem(VERSE_SPOTLIGHT_STORAGE_KEYS[state.surface], JSON.stringify(state));
}

export function loadHomeSpotlightState(params: {
  storage: KeyValueStorage;
  now: number;
  requestedTranslationId: number;
  random?: () => number;
}): Promise<VerseSpotlightState> {
  return loadSpotlightState({
    ...params,
    surface: 'home',
    rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
  });
}
