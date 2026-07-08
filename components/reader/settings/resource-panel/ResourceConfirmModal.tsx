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

import { dialogTransform, useModalTransition } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function ResourceConfirmModal({
  visible,
  title,
  resourceName,
  detailLabel,
  isDetailLoading = false,
  description,
  confirmLabel,
  confirmTone = 'accent',
  mutedColor,
  tintColor,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  resourceName?: string | null;
  detailLabel?: string | null;
  isDetailLoading?: boolean;
  description: string;
  confirmLabel: string;
  confirmTone?: 'accent' | 'danger';
  mutedColor: string;
  tintColor: string;
  onConfirm: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();

  const { visible: isModalVisible, progress, dismissEnabledRef, onModalShow } = useModalTransition(visible);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [dismissEnabledRef, onClose]);

  const confirmClassName =
    confirmTone === 'danger'
      ? 'rounded-lg bg-error px-5 py-2.5 dark:bg-error-dark'
      : 'rounded-lg bg-accent px-5 py-2.5';

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));

  return (
    <Modal
      transparent
      animationType="none"
      visible={isModalVisible}
      onShow={onModalShow}
      onRequestClose={onClose}
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.dialog,
            {
              maxHeight: maxDialogHeight,
              backgroundColor: isDark ? palette.background : palette.surface,
            },
            dialogTransform(progress),
          ]}
          className="rounded-2xl border border-border/50 bg-surface px-5 py-5 dark:border-border-dark/40 dark:bg-background-dark"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <X color={mutedColor} size={18} strokeWidth={2.25} />
            </Pressable>
          </View>

          {resourceName ? (
            <View className="mt-4 rounded-xl border border-border/50 bg-interactive/60 px-4 py-3 dark:border-border-dark/40 dark:bg-interactive-dark/60">
              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                {resourceName}
              </Text>
              {detailLabel || isDetailLoading ? (
                <View className="mt-2 flex-row items-center gap-2">
                  {isDetailLoading ? <ActivityIndicator size="small" color={tintColor} /> : null}
                  <Text className="text-xs text-muted dark:text-muted-dark">
                    {detailLabel ?? ''}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text className="mt-4 text-xs text-muted dark:text-muted-dark">{description}</Text>

          <View className="mt-5 flex-row items-center justify-end gap-3">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="rounded-lg bg-interactive px-5 py-2.5 dark:bg-interactive-dark"
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              className={confirmClassName}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text className="text-sm font-semibold text-on-accent">{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});
