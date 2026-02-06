import { Folder as FolderIcon, Trash2, X } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Folder } from '@/types';

export function DeleteFolderModal({
  isOpen,
  onClose,
  folder,
  onConfirmDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder | null;
  onConfirmDelete: (folderId: string) => void;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const shouldRender = isOpen && Boolean(folder);
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const [isDeleting, setIsDeleting] = React.useState(false);

  const dialogScale = React.useRef(new Animated.Value(0.96)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(shouldRender);

  React.useEffect(() => {
    if (!shouldRender) return;
    setIsDeleting(false);
  }, [shouldRender]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    dialogScale.stopAnimation();
    overlayOpacity.stopAnimation();

    if (shouldRender) {
      dismissEnabledRef.current = false;
      setVisible(true);
      Animated.parallel([
        Animated.timing(dialogScale, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();

      const enableDismissTimeout = setTimeout(() => {
        if (animationTokenRef.current !== token) return;
        dismissEnabledRef.current = true;
      }, 240);

      return () => clearTimeout(enableDismissTimeout);
    }

    dismissEnabledRef.current = false;
    Animated.parallel([
      Animated.timing(dialogScale, { toValue: 0.96, duration: 180, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [dialogScale, overlayOpacity, shouldRender]);

  const handleDelete = React.useCallback(() => {
    if (!folder) return;
    if (isDeleting) return;
    setIsDeleting(true);
    onConfirmDelete(folder.id);
  }, [folder, isDeleting, onConfirmDelete]);

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));
  const minDialogHeight = Math.min(maxDialogHeight, Math.max(360, Math.round(windowHeight * 0.6)));

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

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrapper}
        >
          <Animated.View
            style={[
              styles.dialog,
              { maxHeight: maxDialogHeight, minHeight: minDialogHeight },
              { transform: [{ scale: dialogScale }] },
            ]}
            className="bg-surface dark:bg-surface-dark border border-border/30 dark:border-border-dark/20"
          >
            <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
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
                        Delete Folder
                      </Text>
                      <Text className="text-sm text-muted dark:text-muted-dark">
                        This action cannot be undone
                      </Text>
                    </View>
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

                <ScrollView
                  style={styles.flex}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.scrollContent}
                >
                  <View className="px-6 pb-6">
                    {folder ? (
                      <View className="bg-interactive/60 dark:bg-interactive-dark/60 border border-border/60 dark:border-border-dark/60 rounded-xl p-4 mb-6">
                        <View className="flex-row items-center gap-3">
                          <View className="h-8 w-8 rounded-lg bg-accent/10 items-center justify-center">
                            <FolderIcon size={18} strokeWidth={2.25} color={palette.muted} />
                          </View>
                          <View>
                            <Text className="font-semibold text-foreground dark:text-foreground-dark">
                              {folder.name}
                            </Text>
                            <Text className="text-sm text-muted dark:text-muted-dark">
                              {folder.bookmarks.length} verse
                              {folder.bookmarks.length !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ) : null}

                    <View className="gap-4">
                      <Text className="text-foreground dark:text-foreground-dark">
                        Are you sure you want to permanently delete this folder?
                      </Text>

                      {folder && folder.bookmarks.length > 0 ? (
                        <View className="bg-error/10 border border-error/20 rounded-xl p-4">
                          <Text className="font-semibold text-error dark:text-error-dark text-sm mb-1">
                            Warning: Contains bookmarked verses
                          </Text>
                          <Text className="text-error dark:text-error-dark text-sm">
                            This folder contains{' '}
                            <Text className="font-semibold">
                              {folder.bookmarks.length} bookmarked verse
                              {folder.bookmarks.length !== 1 ? 's' : ''}
                            </Text>
                            . All bookmarks will be permanently deleted and cannot be recovered.
                          </Text>
                        </View>
                      ) : null}
                    </View>

                  </View>
                </ScrollView>

                <View className="px-6 py-3 border-t border-border/60 dark:border-border-dark/40 bg-surface dark:bg-surface-dark">
                  <View className="flex-row items-center justify-end gap-3">
                    <Pressable
                      onPress={onClose}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                      className="px-4 py-2 rounded-lg bg-interactive dark:bg-interactive-dark"
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                        Cancel
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleDelete}
                      disabled={isDeleting}
                      accessibilityRole="button"
                      accessibilityLabel="Delete Forever"
                      className={[
                        'px-4 py-2 rounded-lg bg-error dark:bg-error-dark',
                        isDeleting ? 'opacity-40' : '',
                      ].join(' ')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Text className="text-sm font-semibold text-on-accent">
                        {isDeleting ? 'Deleting...' : 'Delete Forever'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  keyboardWrapper: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  dialog: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});
