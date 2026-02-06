import { FlashList } from '@shopify/flash-list';
import { X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Chapter } from '@/types';

export function SurahPickerModal({
  isOpen,
  chapters,
  isLoading,
  errorMessage,
  onRetry,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  chapters: Chapter[];
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onClose: () => void;
  onSelect: (surahId: number) => void;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();

  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(40)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    overlayOpacity.stopAnimation();
    translateY.stopAnimation();

    if (isOpen) {
      dismissEnabledRef.current = false;
      setVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      const enableDismissTimeout = setTimeout(() => {
        if (animationTokenRef.current !== token) return;
        dismissEnabledRef.current = true;
      }, 220);

      return () => clearTimeout(enableDismissTimeout);
    }

    dismissEnabledRef.current = false;
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 40, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [isOpen, overlayOpacity, translateY]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [onClose]);

  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.8));
  const minSheetHeight = Math.min(maxSheetHeight, Math.max(320, Math.round(windowHeight * 0.5)));

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.card,
            { maxHeight: maxSheetHeight, minHeight: minSheetHeight },
            { transform: [{ translateY }] },
          ]}
          className="bg-surface dark:bg-surface-dark border border-border/30 dark:border-border-dark/20"
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View className={isDark ? 'dark' : ''} style={styles.inner}>
              <View className="px-5 py-4 border-b border-border/60 dark:border-border-dark/40 flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                  Select Surah
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <X size={18} strokeWidth={2.25} color={palette.muted} />
                </Pressable>
              </View>

              {isLoading ? (
                <View className="px-5 py-6 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={palette.muted} />
                  <Text className="text-sm text-muted dark:text-muted-dark">Loading…</Text>
                </View>
              ) : errorMessage && chapters.length === 0 ? (
                <View className="px-5 py-6">
                  <Text className="text-sm text-muted dark:text-muted-dark">{errorMessage}</Text>
                  <Pressable
                    onPress={onRetry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry"
                    className="mt-3 self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
                    style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                  >
                    <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                      Retry
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <FlashList
                  data={chapters}
                  keyExtractor={(item) => String(item.id)}
                  contentContainerStyle={{ paddingVertical: 8 }}
                  ItemSeparatorComponent={() => (
                    <View
                      style={{ height: StyleSheet.hairlineWidth }}
                      className="bg-border/40 dark:bg-border-dark/40"
                    />
                  )}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => onSelect(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.id}. ${item.name_simple}`}
                      className="px-5 py-3"
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                        {item.id}. {item.name_simple}
                      </Text>
                      {item.translated_name?.name ? (
                        <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
                          {item.translated_name.name}
                        </Text>
                      ) : null}
                    </Pressable>
                  )}
                />
              )}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  overlay: { flex: 1, backgroundColor: '#00000080' },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  safeArea: { flex: 1 },
  inner: { flex: 1 },
});
