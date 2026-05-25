import {
  Check,
  Folder,
  Pin,
  Plus,
  X,
} from 'lucide-react-native';
import React from 'react';
import {
  Animated as RNAnimated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dialogTransform, useModalTransition } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Bookmark, Folder as BookmarkFolder } from '@/types';

type BookmarkModalTab = 'pin' | 'bookmark';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function BookmarkModalTabToggle({
  activeTab,
  onTabChange,
  palette,
  isOpen,
}: {
  activeTab: BookmarkModalTab;
  onTabChange: (tab: BookmarkModalTab) => void;
  palette: any;
  isOpen: boolean;
}): React.JSX.Element {
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const activeIndex = activeTab === 'pin' ? 0 : 1;
  const indicatorPosition = useSharedValue(activeIndex);

  React.useEffect(() => {
    indicatorPosition.value = withSpring(activeIndex, {
      damping: 22,
      stiffness: 180,
      mass: 0.55,
    });
  }, [activeIndex, indicatorPosition]);

  const activeShadow =
    Platform.OS === 'android'
      ? { elevation: isOpen ? 2 : 0 }
      : {
          shadowColor: '#000',
          shadowOpacity: isOpen ? 0.1 : 0,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        };

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    if (measuredWidth === 0) return { opacity: 0 };
    const tabWidth = (measuredWidth - 8) / 2;
    return {
      width: tabWidth,
      opacity: isOpen ? 1 : 0,
      transform: [{ translateX: indicatorPosition.value * tabWidth }],
    };
  });

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        setMeasuredWidth((currentWidth) =>
          Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth
        );
      }}
      className="relative flex-row items-center rounded-[24px] border p-1"
      style={{
        backgroundColor: palette.interactive,
        borderColor: palette.border,
      }}
    >
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-1 left-1 top-1 rounded-full"
        style={[
          animatedIndicatorStyle,
          activeShadow,
          {
            backgroundColor: palette.surfaceNavigation || palette.surface,
          },
        ]}
      />
      
      <Pressable
        onPress={() => onTabChange('pin')}
        className="z-10 h-10 flex-1 items-center justify-center rounded-full px-2"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Text
          style={{
            color: activeTab === 'pin' ? palette.text : palette.muted,
          }}
          className="text-[13px] font-semibold text-center"
        >
          Pin Verse
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onTabChange('bookmark')}
        className="z-10 h-10 flex-1 items-center justify-center rounded-full px-2"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Text
          style={{
            color: activeTab === 'bookmark' ? palette.text : palette.muted,
          }}
          className="text-[13px] font-semibold text-center"
        >
          Add to Folder
        </Text>
      </Pressable>
    </View>
  );
}

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
  const handleTabChange = React.useCallback((tab: BookmarkModalTab) => {
    if (Platform.OS === 'ios' || (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setActiveTab(tab);
  }, []);
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');

  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen);

  const closeAndReset = React.useCallback(() => {
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    if (!visible) {
      setActiveTab('pin');
      setIsCreatingFolder(false);
      setNewFolderName('');
    }
  }, [visible]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    closeAndReset();
  }, [closeAndReset, dismissEnabledRef]);

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



  const maxDialogHeight = Math.max(0, Math.round(windowHeight * 0.92));
  const pinMinDialogHeight = Math.min(maxDialogHeight, 300);
  const bookmarkMinDialogHeight = Math.min(
    maxDialogHeight,
    Math.max(380, Math.min(600, Math.round(windowHeight * 0.55)))
  );
  const minDialogHeight = activeTab === 'bookmark' ? bookmarkMinDialogHeight : pinMinDialogHeight;

  return (
    <Modal
      transparent
      visible={visible}
      onShow={onModalShow}
      onRequestClose={closeAndReset}
      animationType="none"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      statusBarTranslucent
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <RNAnimated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrapper}
        >
          <RNAnimated.View
            style={[
              styles.dialog,
              {
                maxHeight: maxDialogHeight,
                minHeight: minDialogHeight,
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
              dialogTransform(progress),
            ]}
            className="border"
          >
            <View style={styles.dialogSafeArea}>
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

                  <View style={{ marginTop: 16 }}>
                    <BookmarkModalTabToggle
                      activeTab={activeTab}
                      onTabChange={handleTabChange}
                      palette={palette}
                      isOpen={isOpen}
                    />
                  </View>
                </View>

                {activeTab === 'pin' ? (
                  <Animated.View
                    key="pin-tab"
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    style={styles.tabFill}
                  >
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
                  </Animated.View>
                ) : (
                  <Animated.View
                    key="bookmark-tab"
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    style={styles.tabFill}
                  >
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
                  </Animated.View>
                )}
              </View>
            </View>
          </RNAnimated.View>
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
    flexShrink: 1,
  },
  dialogInner: {
    flexShrink: 1,
  },
  tabFill: {
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  centerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  tabButton: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
  },
});
