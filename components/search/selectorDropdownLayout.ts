import { Platform, StatusBar } from 'react-native';

export function getSelectorAndroidVisualOffset(): number {
  if (Platform.OS !== 'android') return 0;
  return Math.max(24, Math.min(30, StatusBar.currentHeight ?? 0));
}

export function getGoToCardSelectorVisualOffset(): number {
  if (Platform.OS !== 'android') return 0;

  // The selector input lives in a second Android dialog window so it can own
  // keyboard focus. That window omits both system-bar insets after the keyboard
  // opens, while measureInWindow() reports coordinates from the app window.
  return getSelectorAndroidVisualOffset() + 21;
}
