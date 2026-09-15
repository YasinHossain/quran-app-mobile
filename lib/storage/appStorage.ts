import AsyncStorage from '@react-native-async-storage/async-storage';

const startupItems = new Map<string, string | null>();

export async function preloadItems(keys: readonly string[]): Promise<void> {
  try {
    const entries = await AsyncStorage.multiGet([...keys]);
    for (const [key, value] of entries) startupItems.set(key, value);
  } catch {
    for (const key of keys) startupItems.set(key, null);
  }
}

export function hasCachedItem(key: string): boolean {
  return startupItems.has(key);
}

export function getCachedItem(key: string): string | null {
  return startupItems.get(key) ?? null;
}

export async function getItem(key: string): Promise<string | null> {
  if (startupItems.has(key)) return startupItems.get(key) ?? null;
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (startupItems.has(key)) startupItems.set(key, value);
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (e.g. restricted mode / quota).
  }
}

export async function removeItem(key: string): Promise<void> {
  if (startupItems.has(key)) startupItems.set(key, null);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
