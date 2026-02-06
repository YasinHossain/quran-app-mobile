import { Check, X } from 'lucide-react-native';
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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Folder } from '@/types';

const DEFAULT_COLOR = 'text-accent';

const FOLDER_COLORS = [
  { name: 'Teal', value: 'text-accent', swatch: '#0D9488' },
  { name: 'Brand', value: 'text-primary', swatch: '#4F46E5' },
  { name: 'Slate', value: 'text-content-secondary', swatch: '#64748B' },
  { name: 'Green', value: 'text-status-success', swatch: '#16A34A' },
  { name: 'Amber', value: 'text-status-warning', swatch: '#D97706' },
  { name: 'Red', value: 'text-status-error', swatch: '#DC2626' },
  { name: 'Blue', value: 'text-status-info', swatch: '#2563EB' },
  { name: 'Emerald', value: 'text-content-accent', swatch: '#10B981' },
];

export function FolderSettingsModal({
  isOpen,
  onClose,
  folder,
  mode = 'edit',
}: {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder | null;
  mode?: 'create' | 'edit';
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const shouldRender = mode === 'edit' ? isOpen && Boolean(folder) : isOpen;
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { createFolder, renameFolder } = useBookmarks();

  const [name, setName] = React.useState('');
  const [selectedColor, setSelectedColor] = React.useState(DEFAULT_COLOR);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const dialogScale = React.useRef(new Animated.Value(0.96)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(shouldRender);

  React.useEffect(() => {
    if (!shouldRender) return;
    setName(mode === 'edit' ? folder?.name ?? '' : '');
    setSelectedColor((mode === 'edit' ? folder?.color : undefined) ?? DEFAULT_COLOR);
    setIsSubmitting(false);
  }, [folder?.color, folder?.name, mode, shouldRender]);

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

  const modalTitle = mode === 'create' ? 'Create Folder' : 'Edit Folder';
  const submitLabel = mode === 'create' ? 'Create Folder' : 'Save Changes';
  const submittingLabel = mode === 'create' ? 'Creating...' : 'Saving...';

  const canSubmit = Boolean(name.trim()) && !isSubmitting;

  const handleSubmit = React.useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSubmitting(true);

    if (mode === 'create') {
      createFolder(trimmed, selectedColor);
      onClose();
      return;
    }

    if (!folder) {
      onClose();
      return;
    }

    renameFolder(folder.id, trimmed, selectedColor);
    onClose();
  }, [createFolder, folder, mode, name, onClose, renameFolder, selectedColor]);

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));
  const minDialogHeight = Math.min(
    maxDialogHeight,
    Math.max(360, Math.min(520, Math.round(windowHeight * 0.5)))
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
                <View className="px-5 py-5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
                      {modalTitle}
                    </Text>
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
                </View>

                <ScrollView
                  style={styles.flex}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.scrollContent}
                >
                  <View className="px-5">
                    <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark mb-2">
                      Folder name
                    </Text>
                    <View className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-3 py-3">
                      <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="Folder name"
                        placeholderTextColor={palette.muted}
                        maxLength={30}
                        autoFocus={mode === 'create'}
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit}
                        className="text-base text-foreground dark:text-foreground-dark"
                      />
                    </View>
                  </View>

                  <View className="px-5 mt-6">
                    <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark mb-3">
                      Color
                    </Text>
                    <View className="flex-row flex-wrap" style={styles.colorGrid}>
                      {FOLDER_COLORS.map((color) => {
                        const isSelected = selectedColor === color.value;
                        return (
                          <Pressable
                            key={color.value}
                            onPress={() => setSelectedColor(color.value)}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${color.name} color`}
                            style={({ pressed }) => ({
                              opacity: pressed ? 0.9 : 1,
                            })}
                            className={[
                              'rounded-xl border items-center justify-center',
                              isSelected
                                ? 'border-accent dark:border-accent-dark'
                                : 'border-border dark:border-border-dark',
                            ].join(' ')}
                          >
                            <View
                              style={[
                                styles.colorSwatch,
                                { backgroundColor: color.swatch },
                                isSelected ? styles.colorSwatchSelected : null,
                              ]}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                <View className="px-5 py-3 border-t border-border/60 dark:border-border-dark/40 bg-surface dark:bg-surface-dark">
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
                      onPress={handleSubmit}
                      disabled={!canSubmit}
                      accessibilityRole="button"
                      accessibilityLabel={submitLabel}
                      className={[
                        'px-4 py-2 rounded-lg flex-row items-center gap-2 bg-accent',
                        canSubmit ? '' : 'opacity-40',
                      ].join(' ')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                    >
                      <Check size={18} strokeWidth={2.25} color="#FFFFFF" />
                      <Text className="text-sm font-semibold text-on-accent">
                        {isSubmitting ? submittingLabel : submitLabel}
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
  colorGrid: {
    gap: 12,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 10,
    margin: 12,
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.05 }],
  },
});
