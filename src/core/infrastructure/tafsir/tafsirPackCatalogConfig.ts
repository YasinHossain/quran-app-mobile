import Constants from 'expo-constants';

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getTafsirPackCatalogUrl(): string | null {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') return null;
  return asNonEmptyString((extra as Record<string, unknown>).tafsirPackCatalogUrl);
}
