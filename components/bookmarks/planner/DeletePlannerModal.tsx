import { Calendar, Trash2, X } from 'lucide-react-native';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Dialog } from '@/components/motion/Dialog';
import { useValueWhileOpen } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export interface DeletePlannerTarget {
  planIds: string[];
  title: string;
  details?: string | null;
}

export function DeletePlannerModal({
  isOpen,
  onClose,
  target: targetProp,
  onConfirmDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  target: DeletePlannerTarget | null;
  onConfirmDelete: (planIds: string[]) => void;
}): React.JSX.Element {
  const shouldRender = isOpen && Boolean(targetProp?.planIds.length);
  // Closing clears the target; keep showing it until the exit has finished.
  const target = useValueWhileOpen(shouldRender, targetProp);
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!shouldRender) return;
    setIsDeleting(false);
  }, [shouldRender]);

  const handleDelete = React.useCallback(() => {
    if (!target || isDeleting) return;
    const uniqueIds = Array.from(new Set(target.planIds)).filter((id) => id.trim().length > 0);
    if (uniqueIds.length === 0) return;
    setIsDeleting(true);
    onConfirmDelete(uniqueIds);
  }, [isDeleting, onConfirmDelete, target]);

  return (
    <Dialog isOpen={shouldRender} onClose={onClose} minHeight={280}>
      <View style={styles.safeArea}>
        <View className={isDark ? 'dark' : ''} style={styles.inner}>
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 rounded-xl bg-error/10 items-center justify-center">
                <Trash2
                  size={20}
                  strokeWidth={2.25}
                  color={isDark ? '#F87171' : '#DC2626'}
                />
              </View>
              <View>
                <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">
                  {t('planner_delete_title')}
                </Text>
                <Text className="text-sm text-muted dark:text-muted-dark">
                  {t('planner_delete_subtitle')}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="p-2 rounded-full"
            >
              <X size={18} strokeWidth={2.25} color={palette.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View className="px-6 pb-6">
              {target ? (
                <View className="bg-interactive/60 dark:bg-interactive-dark/60 border border-border/60 dark:border-border-dark/60 rounded-xl p-4 mb-6">
                  <View className="flex-row items-center gap-3">
                    <View className="h-8 w-8 rounded-lg bg-accent/10 items-center justify-center">
                      <Calendar size={18} strokeWidth={2.25} color={palette.muted} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        numberOfLines={1}
                        className="font-semibold text-foreground dark:text-foreground-dark"
                      >
                        {target.title}
                      </Text>
                      {target.details ? (
                        <Text
                          numberOfLines={2}
                          className="text-sm text-muted dark:text-muted-dark"
                        >
                          {target.details}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              <View className="gap-4">
                <Text className="text-foreground dark:text-foreground-dark">
                  {t('planner_delete_confirm')}
                </Text>
              </View>
            </View>
          </ScrollView>

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
                accessibilityLabel={t('delete_forever')}
                className={[
                  'px-5 py-2.5 rounded-lg bg-error dark:bg-error-dark',
                  isDeleting ? 'opacity-40' : '',
                ].join(' ')}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-on-accent">
                  {isDeleting ? t('loading') : t('delete_forever')}
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
  flex: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});
