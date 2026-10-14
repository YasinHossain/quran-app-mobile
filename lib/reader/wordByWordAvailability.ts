export type WordByWordPackStatus =
  | 'queued'
  | 'downloading'
  | 'installed'
  | 'failed'
  | 'deleting';

export type WordByWordAvailability = {
  effectiveEnabled: boolean;
  shouldDisablePersistedPreference: boolean;
};

export function resolveWordByWordAvailability({
  requested,
  isLoading,
  hasIndexError,
  packStatus,
}: {
  requested: boolean;
  isLoading: boolean;
  hasIndexError: boolean;
  packStatus?: WordByWordPackStatus;
}): WordByWordAvailability {
  if (!requested) {
    return {
      effectiveEnabled: false,
      shouldDisablePersistedPreference: false,
    };
  }

  if (isLoading || hasIndexError) {
    return {
      effectiveEnabled: false,
      shouldDisablePersistedPreference: false,
    };
  }

  if (packStatus === 'installed') {
    return {
      effectiveEnabled: true,
      shouldDisablePersistedPreference: false,
    };
  }

  return {
    effectiveEnabled: false,
    shouldDisablePersistedPreference: true,
  };
}
