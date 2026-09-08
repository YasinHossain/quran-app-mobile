import { getItem, setItem } from '../storage/appStorage';

import type { VerseSpotlightState } from './contracts';
import { loadHomeSpotlightState, saveSpotlightState } from './persistence';

const appStorage = { getItem, setItem };

// Keep the last hydrated home state in memory. Tab screens can be remounted
// during navigation; re-reading the same tiny preference from storage adds
// latency and makes the spotlight visibly flash on every return.
let memoryState: VerseSpotlightState | null = null;

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
  return saveSpotlightState(appStorage, state);
}
