import { SlidersHorizontal, Trash2, X } from 'lucide-react-native';
import React from 'react';
import {
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

import { useModalTransition, verticalSheetTransform } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export function FolderActionsSheet({
  isOpen,
  onClose,
  folderName,
  onEdit,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  folderName: string;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];

  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [instantClose, setInstantClose] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      pendingActionRef.current = null;
      setInstantClose(false);
    }
  }, [isOpen]);

  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    openDuration: 240,
    closeDuration: instantClose ? 0 : 150,
    onAfterClose: () => {
      if (pendingActionRef.current) {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        requestAnimationFrame(() => {
          action();
        });
      }
    },
  });

  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.56));
  const minSheetHeight = Math.min(maxSheetHeight, Math.max(220, Math.round(windowHeight * 0.3)));

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [dismissEnabledRef, onClose]);

  const handleDeferredAction = React.useCallback(
    (fn: () => void) => {
      pendingActionRef.current = fn;
      setInstantClose(true);
      onClose();
    },
    [onClose]
  );

  return (
    <Modal
      transparent
      visible={visible}
      onShow={onModalShow}
      onRequestClose={onClose}
      animationType="none"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: maxSheetHeight,
              minHeight: minSheetHeight,
              backgroundColor: isDark ? palette.background : palette.surface,
              borderColor: palette.border,
            },
            verticalSheetTransform(progress, Math.max(260, Math.round(windowHeight * 0.38))),
          ]}
          className="border"
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View className={isDark ? 'dark' : ''} style={styles.inner}>
              <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
                <View className="flex-1 pr-3">
                  <Text
                    numberOfLines={1}
                    className="text-base font-semibold text-foreground dark:text-foreground-dark"
                  >
                    {folderName}
                  </Text>
                  <Text className="text-xs text-muted dark:text-muted-dark">{t('folder_options')}</Text>
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

              <View className="px-4 pt-2 pb-4">
                <View>
                  <ActionRow
                    icon={<SlidersHorizontal color={palette.muted} size={20} strokeWidth={2.25} />}
                    label={t('edit_folder')}
                    onPress={() => handleDeferredAction(onEdit)}
                    accessibilityLabel={t('edit_folder')}
                  />
                  <ActionRow
                    icon={
                      <Trash2
                        color={isDark ? '#F87171' : '#DC2626'}
                        size={20}
                        strokeWidth={2.25}
                      />
                    }
                    label={t('delete_folder')}
                    onPress={() => handleDeferredAction(onDelete)}
                    accessibilityLabel={t('delete_folder')}
                    destructive
                  />
                </View>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  accessibilityLabel,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  destructive?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={[
        'flex-row items-center gap-4 rounded-2xl px-4 py-4',
        destructive ? 'bg-error/10 border border-error/20' : 'bg-transparent',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="h-5 w-5 items-center justify-center">{icon}</View>
      <Text
        className={[
          'text-sm font-medium',
          destructive ? 'text-error dark:text-error-dark' : 'text-foreground dark:text-foreground-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  safeArea: {
    width: '100%',
  },
  inner: {
    width: '100%',
  },
});
