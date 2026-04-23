import { X } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

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
  const confirmClassName =
    confirmTone === 'danger' ? 'rounded-lg bg-error px-4 py-2 dark:bg-error-dark' : 'rounded-lg bg-accent px-4 py-2';

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        </Pressable>

        <View
          style={{ width: '100%', maxWidth: 420 }}
          className="rounded-2xl border border-border/50 bg-surface px-5 py-5 dark:border-border-dark/40 dark:bg-surface-dark"
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
              className="rounded-lg bg-interactive px-4 py-2 dark:bg-interactive-dark"
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
        </View>
      </View>
    </Modal>
  );
}
