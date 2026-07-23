import { getItem, setItem } from '../storage/appStorage';

import type { VerseSpotlightState } from './contracts';
import { loadHomeSpotlightState, saveSpotlightState } from './persistence';

const appStorage = { getItem, setItem };

export function hydrateHomeSpotlightState(params: {
  now: number;
  requestedTranslationId: number;
  random?: () => number;
}): Promise<VerseSpotlightState> {
  return loadHomeSpotlightState({ storage: appStorage, ...params });
}

export function persistHomeSpotlightState(state: VerseSpotlightState): Promise<void> {
  if (state.surface !== 'home') {
    return Promise.reject(new Error('Cannot persist non-Home state in Home Spotlight storage.'));
  }
  return saveSpotlightState(appStorage, state);
}
