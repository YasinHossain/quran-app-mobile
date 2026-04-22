import { Platform, StatusBar } from 'react-native';

export function getSelectorAndroidVisualOffset(): number {
  if (Platform.OS !== 'android') return 0;
  return Math.max(24, Math.min(30, StatusBar.currentHeight ?? 0));
}
