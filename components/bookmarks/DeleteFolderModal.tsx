import { Trash2, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Dialog } from '@/components/motion/Dialog';
import { useValueWhileOpen } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import type { Folder } from '@/types';

export function DeleteFolderModal({
  isOpen,
  onClose,
  folder: folderProp,
  onConfirmDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder | null;
  onConfirmDelete: (folderId: string) => void;
}): React.JSX.Element {
  const shouldRender = isOpen && Boolean(folderProp);
  // Closing clears the folder; keep showing it until the exit has finished.
  const folder = useValueWhileOpen(shouldRender, folderProp);
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];

  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!shouldRender) return;
    setIsDeleting(false);
  }, [shouldRender]);

  const handleDelete = React.useCallback(() => {
    if (!folder) return;
    if (isDeleting) return;
    setIsDeleting(true);
    onConfirmDelete(folder.id);
  }, [folder, isDeleting, onConfirmDelete]);

  const confirmMessage = folder?.name
    ? t('delete_folder_confirm_named', { name: folder.name })
    : t('delete_folder_confirm');

  return (
    <Dialog isOpen={shouldRender} onClose={onClose}>
      <View style={styles.safeArea}>
        <View className={isDark ? 'dark' : ''} style={styles.inner}>
          <View className="flex-row items-start justify-between px-6 pt-6 pb-5">
            <View className="flex-row items-start gap-3 flex-1 pr-3">
              <View className="pt-0.5">
                <Trash2
                  size={22}
                  strokeWidth={2.25}
                  color={isDark ? '#F87171' : '#DC2626'}
                />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
                  {t('delete_folder')}
                </Text>
                <Text className="text-sm text-muted dark:text-muted-dark mt-1 leading-snug">
                  {confirmMessage}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="p-2 -mr-2 rounded-full"
            >
              <X size={18} strokeWidth={2.25} color={palette.muted} />
            </Pressable>
          </View>

          <View className="px-6 py-3 border-t border-border/60 dark:border-border-dark/40 bg-surface dark:bg-background-dark">
            <View className="flex-row items-center justify-end gap-3">
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                className="px-5 py-2.5 rounded-lg bg-interactive dark:bg-interactive-dark"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  {t('cancel')}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDelete}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel={t('delete')}
                className={[
                  'px-5 py-2.5 rounded-lg bg-error dark:bg-error-dark',
                  isDeleting ? 'opacity-40' : '',
                ].join(' ')}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-on-accent">
                  {isDeleting ? t('loading') : t('delete')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flexShrink: 1,
  },
  inner: {
    flexShrink: 1,
  },
});
