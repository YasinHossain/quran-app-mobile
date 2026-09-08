import { Clipboard, Platform, ToastAndroid } from 'react-native';

/**
 * Copies plain text to the clipboard across mobile and web platforms.
 * Optionally displays a native Toast message on Android.
 */
export async function copyTextToClipboard(text: string, feedbackMessage?: string): Promise<boolean> {
  try {
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(text);
      if (feedbackMessage && Platform.OS === 'android') {
        ToastAndroid.show(feedbackMessage, ToastAndroid.SHORT);
      }
      return true;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('Failed to copy text to clipboard', error);
  }

  return false;
}
