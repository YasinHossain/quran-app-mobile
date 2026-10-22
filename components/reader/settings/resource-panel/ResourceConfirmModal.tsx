import { X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Dialog } from '@/components/motion/Dialog';
import { useValueWhileOpen } from '@/components/motion/modalTransition';

export function ResourceConfirmModal({
  visible,
  title: titleProp,
  resourceName: resourceNameProp,
  detailLabel: detailLabelProp,
  description: descriptionProp,
  confirmLabel,
  confirmTone = 'accent',
  showCancelAction = true,
  secondaryLabel,
  mutedColor,
  onConfirm,
  onSecondary,
  onClose,
}: {
  visible: boolean;
  title: string;
  resourceName?: string | null;
  detailLabel?: string | null;
  description?: string | null;
  confirmLabel: string;
  confirmTone?: 'accent' | 'danger';
  showCancelAction?: boolean;
  secondaryLabel?: string;
  mutedColor: string;
  onConfirm: () => void;
  onSecondary?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  // Callers close by clearing their target; keep showing it until the exit has finished.
  const title = useValueWhileOpen(visible, titleProp);
  const resourceName = useValueWhileOpen(visible, resourceNameProp);
  const detailLabel = useValueWhileOpen(visible, detailLabelProp);
  const description = useValueWhileOpen(visible, descriptionProp);

  const confirmClassName =
    confirmTone === 'danger'
      ? 'rounded-lg bg-error px-5 py-2.5 dark:bg-error-dark'
      : 'rounded-lg bg-accent px-5 py-2.5';

  return (
    <Dialog isOpen={visible} onClose={onClose}>
      <View className="px-5 py-5">
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
            {detailLabel ? (
              <View className="mt-2 flex-row items-center gap-2">
                <Text className="text-xs text-muted dark:text-muted-dark">{detailLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {description ? (
          <Text className="mt-4 text-xs text-muted dark:text-muted-dark">{description}</Text>
        ) : null}

        <View style={styles.actions}>
          {showCancelAction ? (
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
          ) : null}

          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
              className="rounded-lg bg-interactive px-5 py-2.5 dark:bg-interactive-dark"
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}

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
    </Dialog>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
});
