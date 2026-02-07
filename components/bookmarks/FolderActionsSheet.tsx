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

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

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
  const palette = Colors[resolvedTheme];

  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const sheetTranslateY = React.useRef(new Animated.Value(28)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.56));
  const minSheetHeight = Math.min(maxSheetHeight, Math.max(220, Math.round(windowHeight * 0.3)));

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();

    if (isOpen) {
      dismissEnabledRef.current = false;
      setVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();

      const enableDismissTimeout = setTimeout(() => {
        if (animationTokenRef.current !== token) return;
        dismissEnabledRef.current = true;
      }, 240);

      return () => clearTimeout(enableDismissTimeout);
    }

    dismissEnabledRef.current = false;
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 28, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [isOpen, overlayOpacity, sheetTranslateY]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [onClose]);

  const runAndClose = React.useCallback(
    (fn: () => void) => {
      fn();
      onClose();
    },
    [onClose]
  );

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: maxSheetHeight, minHeight: minSheetHeight },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          className="bg-surface dark:bg-surface-dark border border-border/30 dark:border-border-dark/20"
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
                  <Text className="text-xs text-muted dark:text-muted-dark">Folder options</Text>
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
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
                    label="Edit Folder"
                    onPress={() => runAndClose(onEdit)}
                    accessibilityLabel="Edit Folder"
                  />
                  <ActionRow
                    icon={
                      <Trash2
                        color={isDark ? '#F87171' : '#DC2626'}
                        size={20}
                        strokeWidth={2.25}
                      />
                    }
                    label="Delete Folder"
                    onPress={() => runAndClose(onDelete)}
                    accessibilityLabel="Delete Folder"
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

