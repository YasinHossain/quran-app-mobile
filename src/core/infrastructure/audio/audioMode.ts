import type { AudioLockScreenOptions, AudioMetadata, AudioPlayer } from 'expo-audio';
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { Platform } from 'react-native';

import { logger } from '@/src/core/infrastructure/monitoring/logger';

const DEFAULT_LOCK_SCREEN_OPTIONS: AudioLockScreenOptions = {
  showSeekBackward: true,
  showSeekForward: true,
};

let hasInitializedAudioMode = false;

export async function initializeAudioModeAsync(): Promise<void> {
  if (hasInitializedAudioMode) return;
  hasInitializedAudioMode = true;

  try {
    if (Platform.OS === 'web') return;
    await setIsAudioActiveAsync(true);
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch (error) {
    hasInitializedAudioMode = false;
    logger.error('Failed to initialize audio mode', undefined, error as Error);
  }
}

export function setPlayerActiveForLockScreen(
  player: AudioPlayer,
  metadata?: AudioMetadata,
  options: AudioLockScreenOptions = DEFAULT_LOCK_SCREEN_OPTIONS
): boolean {
  if (Platform.OS === 'web') return false;

  try {
    const fn = (player as unknown as { setActiveForLockScreen?: unknown }).setActiveForLockScreen;
    if (typeof fn !== 'function') return false;
    (
      fn as (this: AudioPlayer, active: boolean, metadata?: AudioMetadata, options?: AudioLockScreenOptions) => void
    ).call(player, true, metadata, options);
    return true;
  } catch (error) {
    logger.error('Failed to enable lock screen controls', undefined, error as Error);
    return false;
  }
}

export function updatePlayerLockScreenMetadata(player: AudioPlayer, metadata: AudioMetadata): boolean {
  if (Platform.OS === 'web') return false;

  try {
    const fn = (player as unknown as { updateLockScreenMetadata?: unknown }).updateLockScreenMetadata;
    if (typeof fn !== 'function') return false;
    (fn as (this: AudioPlayer, metadata: AudioMetadata) => void).call(player, metadata);
    return true;
  } catch (error) {
    logger.error('Failed to update lock screen metadata', undefined, error as Error);
    return false;
  }
}

export function clearPlayerLockScreenControls(player: AudioPlayer): boolean {
  if (Platform.OS === 'web') return false;

  try {
    const fn = (player as unknown as { clearLockScreenControls?: unknown }).clearLockScreenControls;
    if (typeof fn !== 'function') return false;
    (fn as (this: AudioPlayer) => void).call(player);
    return true;
  } catch (error) {
    logger.error('Failed to clear lock screen controls', undefined, error as Error);
    return false;
  }
}
