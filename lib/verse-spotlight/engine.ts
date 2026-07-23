import { CURATED_ANCHOR_KEYS, VERSE_SPOTLIGHT_POOL_VERSION } from './anchorPool';
import { isValidVerseKey } from './canonicalIndex';
import type { VerseKey, VerseSpotlightState, VerseSpotlightSurface } from './contracts';

export const VERSE_SPOTLIGHT_STATE_SCHEMA_VERSION = 1;
export const HOME_SPOTLIGHT_ROTATION_INTERVAL_MS = 5 * 60 * 1000;
export const ANDROID_WIDGET_ROTATION_INTERVAL_MS = 4 * 60 * 60 * 1000;

export const VERSE_SPOTLIGHT_STORAGE_KEYS: Readonly<Record<VerseSpotlightSurface, string>> = {
  home: 'quranApp:verseSpotlight:home:v1',
  'android-widget': 'quranApp:verseSpotlight:androidWidget:v1',
};

function normalizeUnitRandom(randomValue: number): number {
  if (!Number.isFinite(randomValue) || randomValue <= 0) return 0;
  if (randomValue >= 1) return 1 - Number.EPSILON;
  return randomValue;
}

function normalizePositiveTranslationId(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

export function selectRandomAnchor(
  currentVerseKey: string | null | undefined,
  random: () => number = Math.random,
  pool: readonly VerseKey[] = CURATED_ANCHOR_KEYS
): VerseKey {
  if (pool.length === 0) {
    throw new Error('Cannot select a Verse Spotlight anchor from an empty pool.');
  }

  const currentIndex = currentVerseKey ? pool.indexOf(currentVerseKey as VerseKey) : -1;
  if (pool.length === 1 || currentIndex < 0) {
    return pool[Math.floor(normalizeUnitRandom(random()) * pool.length)] as VerseKey;
  }

  const alternativeIndex = Math.floor(normalizeUnitRandom(random()) * (pool.length - 1));
  return pool[alternativeIndex >= currentIndex ? alternativeIndex + 1 : alternativeIndex] as VerseKey;
}

export function calculateNextRandomAt(
  selectedAt: number,
  rotationIntervalMs: number | null
): number | null {
  if (rotationIntervalMs === null) return null;
  if (
    !Number.isFinite(selectedAt) ||
    !Number.isFinite(rotationIntervalMs) ||
    rotationIntervalMs <= 0
  ) {
    throw new Error('Verse Spotlight expiration inputs must be finite and positive.');
  }
  return selectedAt + rotationIntervalMs;
}

export function isSpotlightStateExpired(
  state: Pick<VerseSpotlightState, 'nextRandomAt'>,
  now: number
): boolean {
  return state.nextRandomAt !== null && Number.isFinite(now) && now >= state.nextRandomAt;
}

export function createSpotlightState(params: {
  surface: VerseSpotlightSurface;
  verseKey: VerseKey;
  selectedAt: number;
  rotationIntervalMs: number | null;
  requestedTranslationId: number;
  effectiveTranslationId: number;
  poolVersion?: string;
}): VerseSpotlightState {
  return {
    schemaVersion: VERSE_SPOTLIGHT_STATE_SCHEMA_VERSION,
    surface: params.surface,
    verseKey: params.verseKey,
    selectedAt: params.selectedAt,
    nextRandomAt: calculateNextRandomAt(params.selectedAt, params.rotationIntervalMs),
    requestedTranslationId: normalizePositiveTranslationId(params.requestedTranslationId, 20),
    effectiveTranslationId: normalizePositiveTranslationId(params.effectiveTranslationId, 20),
    poolVersion: params.poolVersion ?? VERSE_SPOTLIGHT_POOL_VERSION,
  };
}

function isStoredStateValid(
  value: unknown,
  surface: VerseSpotlightSurface,
  poolVersion: string
): value is VerseSpotlightState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<VerseSpotlightState>;
  return (
    state.schemaVersion === VERSE_SPOTLIGHT_STATE_SCHEMA_VERSION &&
    state.surface === surface &&
    isValidVerseKey(state.verseKey) &&
    typeof state.selectedAt === 'number' &&
    Number.isFinite(state.selectedAt) &&
    (state.nextRandomAt === null ||
      (typeof state.nextRandomAt === 'number' && Number.isFinite(state.nextRandomAt))) &&
    typeof state.requestedTranslationId === 'number' &&
    Number.isInteger(state.requestedTranslationId) &&
    state.requestedTranslationId > 0 &&
    typeof state.effectiveTranslationId === 'number' &&
    Number.isInteger(state.effectiveTranslationId) &&
    state.effectiveTranslationId > 0 &&
    state.poolVersion === poolVersion
  );
}

export function normalizeSpotlightState(
  value: unknown,
  params: {
    surface: VerseSpotlightSurface;
    now: number;
    rotationIntervalMs: number | null;
    requestedTranslationId: number;
    fallbackTranslationId?: number;
    poolVersion?: string;
    random?: () => number;
  }
): VerseSpotlightState {
  const poolVersion = params.poolVersion ?? VERSE_SPOTLIGHT_POOL_VERSION;
  const fallbackTranslationId = normalizePositiveTranslationId(
    params.fallbackTranslationId,
    20
  );
  const requestedTranslationId = normalizePositiveTranslationId(
    params.requestedTranslationId,
    fallbackTranslationId
  );

  if (isStoredStateValid(value, params.surface, poolVersion)) {
    const requestedTranslationChanged =
      value.requestedTranslationId !== requestedTranslationId;
    return {
      ...value,
      requestedTranslationId,
      effectiveTranslationId: requestedTranslationChanged
        ? fallbackTranslationId
        : value.effectiveTranslationId,
    };
  }

  return createSpotlightState({
    surface: params.surface,
    verseKey: selectRandomAnchor(null, params.random),
    selectedAt: params.now,
    rotationIntervalMs: params.rotationIntervalMs,
    requestedTranslationId,
    effectiveTranslationId: fallbackTranslationId,
    poolVersion,
  });
}

export function withResolvedTranslation(
  state: VerseSpotlightState,
  requestedTranslationId: number,
  effectiveTranslationId: number
): VerseSpotlightState {
  return {
    ...state,
    requestedTranslationId: normalizePositiveTranslationId(requestedTranslationId, 20),
    effectiveTranslationId: normalizePositiveTranslationId(effectiveTranslationId, 20),
  };
}
