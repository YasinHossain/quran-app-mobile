import {
  Check,
  Folder,
  Pin,
  Plus,
  X,
} from 'lucide-react-native';
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

import type { Bookmark, Folder as BookmarkFolder } from '@/types';

type BookmarkModalTab = 'pin' | 'bookmark';

export function BookmarkModal({
  isOpen,
  onClose,
  verseId,
  verseKey = '',
  metadata,
}: {
  isOpen: boolean;
  onClose: () => void;
  verseId: string;
  verseKey?: string;
  metadata?: Partial<Bookmark>;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { folders, createFolder, addBookmark, removeBookmark, isPinned, togglePinned } =
    useBookmarks();

  const [activeTab, setActiveTab] = React.useState<BookmarkModalTab>('pin');
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');

  const dialogScale = React.useRef(new Animated.Value(0.96)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  const closeAndReset = React.useCallback(() => {
    setIsCreatingFolder(false);
    setNewFolderName('');
    setActiveTab('pin');
    onClose();
  }, [onClose]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    closeAndReset();
  }, [closeAndReset]);

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    dialogScale.stopAnimation();
    overlayOpacity.stopAnimation();

    if (isOpen) {
      dismissEnabledRef.current = false;
      setVisible(true);
      Animated.parallel([
        Animated.timing(dialogScale, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
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
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (animationTokenRef.current !== token) return;
      setVisible(false);
    });
  }, [dialogScale, isOpen, overlayOpacity]);

  const resolvedVerseRef = verseKey || verseId;
  const verseIsPinned = isPinned(verseId) || (verseKey ? isPinned(verseKey) : false);

  const handleTogglePinned = React.useCallback(() => {
    togglePinned(verseId, { ...(metadata ?? {}), ...(verseKey ? { verseKey } : {}) });
    closeAndReset();
  }, [closeAndReset, metadata, togglePinned, verseId, verseKey]);

  const handleCreateFolder = React.useCallback(() => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    createFolder(trimmed);
    setNewFolderName('');
    setIsCreatingFolder(false);
  }, [createFolder, newFolderName]);

  const handleFolderSelect = React.useCallback(
    (folder: BookmarkFolder) => {
      const alreadySelected = folder.bookmarks.some(
        (bookmark) => String(bookmark.verseId) === String(verseId)
      );

      if (alreadySelected) {
        removeBookmark(verseId, folder.id);
      } else {
        addBookmark(verseId, folder.id, { ...(metadata ?? {}), ...(verseKey ? { verseKey } : {}) });
      }
    },
    [addBookmark, metadata, removeBookmark, verseId, verseKey]
  );

  const tabs = React.useMemo(
    () =>
      [
        { id: 'pin' as const, label: 'Pin Verse' },
        { id: 'bookmark' as const, label: 'Add to Folder' },
      ] satisfies Array<{ id: BookmarkModalTab; label: string }>,
    []
  );

  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));
  const pinMinDialogHeight = Math.min(
    maxDialogHeight,
    Math.max(340, Math.min(520, Math.round(windowHeight * 0.52)))
  );
  const bookmarkMinDialogHeight = Math.min(
    maxDialogHeight,
    Math.max(420, Math.round(windowHeight * 0.72))
  );
  const minDialogHeight = activeTab === 'bookmark' ? bookmarkMinDialogHeight : pinMinDialogHeight;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={closeAndReset}
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
            <SafeAreaView edges={['top', 'bottom']} style={styles.dialogSafeArea}>
              <View className={isDark ? 'dark' : ''} style={styles.dialogInner}>
                <View className="px-4 py-4 relative">
                  <View className="flex-row items-start justify-center">
                    <View className="items-center gap-1">
                      <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
                        Add to Collections
                      </Text>
                      {resolvedVerseRef ? (
                        <Text className="text-sm text-muted dark:text-muted-dark">
                          Surah {resolvedVerseRef}
                        </Text>
                      ) : null}
                    </View>

                    <Pressable
                      onPress={closeAndReset}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      className="absolute right-2 top-2 p-2 rounded-full"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <X color={palette.muted} size={18} strokeWidth={2.25} />
                    </Pressable>
                  </View>

                  <View className="mt-4 flex-row items-center p-1 rounded-full bg-interactive dark:bg-interactive-dark border border-border dark:border-border-dark">
                    {tabs.map((tab) => (
                      <Pressable
                        key={tab.id}
                        onPress={() => setActiveTab(tab.id)}
                        accessibilityRole="button"
                        accessibilityLabel={tab.label}
                        className={[
                          'flex-1 px-4 py-2 rounded-full',
                          activeTab === tab.id
                            ? 'bg-surface dark:bg-surface-dark'
                            : 'bg-transparent',
                        ].join(' ')}
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <Text
                          className={[
                            'text-sm font-semibold text-center',
                            activeTab === tab.id
                              ? 'text-foreground dark:text-foreground-dark'
                              : 'text-muted dark:text-muted-dark',
                          ].join(' ')}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {activeTab === 'pin' ? (
                  <ScrollView
                    style={styles.tabFill}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[styles.scrollContent, styles.centerScrollContent]}
                  >
                    <View className="p-6 items-center justify-center gap-6">
                      <View className="items-center gap-3">
                        <View className="h-16 w-16 rounded-full bg-accent/10 items-center justify-center">
                          <Pin
                            size={32}
                            strokeWidth={2.25}
                            color={verseIsPinned ? palette.tint : palette.muted}
                          />
                        </View>

                        <View className="items-center gap-2 px-2">
                          <Text className="font-medium text-foreground dark:text-foreground-dark">
                            {verseIsPinned ? 'Pinned verse' : 'Pin this verse'}
                          </Text>
                          <Text className="text-sm text-muted dark:text-muted-dark text-center">
                            {verseIsPinned
                              ? `Verse ${resolvedVerseRef} is pinned to your pinned verses section.`
                              : `Pin verse ${resolvedVerseRef} for quick access from the pinned verses section of the bookmarks page.`}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={handleTogglePinned}
                        accessibilityRole="button"
                        accessibilityLabel={verseIsPinned ? 'Unpin verse' : 'Pin verse'}
                        className={[
                          'px-6 py-3 rounded-lg',
                          verseIsPinned ? 'bg-accent/10' : 'bg-accent',
                        ].join(' ')}
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <Text
                          className={[
                            'font-medium',
                            verseIsPinned ? 'text-accent dark:text-accent-dark' : 'text-on-accent',
                          ].join(' ')}
                        >
                          {verseIsPinned ? 'Unpin verse' : 'Pin verse'}
                        </Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                ) : (
                  <View style={styles.tabFill}>
                    <View className="px-4 py-4 border-b border-border dark:border-border-dark">
                      {isCreatingFolder ? (
                        <View className="flex-row items-center gap-2">
                          <View className="flex-1 rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-3 py-2">
                            <TextInput
                              value={newFolderName}
                              onChangeText={setNewFolderName}
                              placeholder="Folder name"
                              placeholderTextColor={palette.muted}
                              maxLength={30}
                              autoFocus
                              className="text-sm text-foreground dark:text-foreground-dark"
                            />
                          </View>

                          <Pressable
                            onPress={handleCreateFolder}
                            disabled={!newFolderName.trim()}
                            accessibilityRole="button"
                            accessibilityLabel="Create Folder"
                            className={[
                              'h-10 w-10 items-center justify-center rounded-xl',
                              newFolderName.trim()
                                ? 'bg-interactive dark:bg-interactive-dark'
                                : 'opacity-40',
                            ].join(' ')}
                            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                          >
                            <Check size={18} strokeWidth={2.25} color={palette.tint} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => setIsCreatingFolder(true)}
                          accessibilityRole="button"
                          accessibilityLabel="Create Folder"
                          className="w-full flex-row items-center justify-center gap-3 p-4 border-2 border-dashed border-border dark:border-border-dark rounded-xl"
                          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                        >
                          <Plus size={20} strokeWidth={2.25} color={palette.muted} />
                          <Text className="font-medium text-muted dark:text-muted-dark">
                            Create Folder
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    <ScrollView
                      style={styles.tabFill}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.scrollContent}
                    >
                      <View className="px-4 py-4">
                        {folders.length === 0 ? (
                          <View className="items-center py-8">
                            <View className="h-16 w-16 rounded-full bg-interactive dark:bg-interactive-dark items-center justify-center mb-4">
                              <Folder size={24} strokeWidth={2.25} color={palette.muted} />
                            </View>
                            <Text className="text-muted dark:text-muted-dark text-center">
                              No folders yet. Create one to get started!
                            </Text>
                          </View>
                        ) : (
                          <View className="gap-2">
                            {folders.map((folder) => {
                              const isSelected = folder.bookmarks.some(
                                (bookmark) => String(bookmark.verseId) === String(verseId)
                              );
                              const bookmarkCount = folder.bookmarks?.length ?? 0;
                              const countLabel = `${bookmarkCount} ${
                                bookmarkCount === 1 ? 'Verse' : 'Verses'
                              }`;

                              return (
                                <Pressable
                                  key={folder.id}
                                  onPress={() => handleFolderSelect(folder)}
                                  accessibilityRole="button"
                                  accessibilityLabel={folder.name}
                                  className={[
                                    'w-full flex-row items-center gap-4 p-4 rounded-lg border',
                                    isSelected
                                      ? 'bg-accent border-accent'
                                      : 'bg-transparent border-transparent',
                                  ].join(' ')}
                                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                                >
                                  <View
                                    className={[
                                      'h-10 w-10 rounded-lg items-center justify-center',
                                      isSelected
                                        ? 'bg-on-accent/20'
                                        : 'bg-interactive dark:bg-interactive-dark',
                                    ].join(' ')}
                                  >
                                    <Folder
                                      size={18}
                                      strokeWidth={2.25}
                                      color={isSelected ? '#FFFFFF' : palette.muted}
                                    />
                                  </View>

                                  <View className="flex-1 min-w-0">
                                    <Text
                                      numberOfLines={1}
                                      className={[
                                        'font-medium',
                                        isSelected
                                          ? 'text-on-accent'
                                          : 'text-foreground dark:text-foreground-dark',
                                      ].join(' ')}
                                    >
                                      {folder.name}
                                    </Text>
                                    <Text
                                      className={[
                                        'text-sm',
                                        isSelected
                                          ? 'text-on-accent/80'
                                          : 'text-muted dark:text-muted-dark',
                                      ].join(' ')}
                                    >
                                      {countLabel}
                                    </Text>
                                  </View>

                                  {isSelected ? (
                                    <Check size={20} strokeWidth={2.25} color="#FFFFFF" />
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </ScrollView>
                  </View>
                )}
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
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  dialogSafeArea: {
    flex: 1,
  },
  dialogInner: {
    flex: 1,
  },
  tabFill: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  centerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
