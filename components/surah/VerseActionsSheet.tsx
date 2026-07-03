import {
  Bookmark,
  BookOpenText,
  Calendar,
  Pause,
  Play,
  Share2,
  X,
} from 'lucide-react-native';
import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useModalTransition, verticalSheetTransform } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function VerseActionsSheet({
  isOpen,
  onClose,
  title,
  verseKey,
  isPlaying = false,
  isBookmarked = false,
  showViewTafsir = true,
  showRemove = false,
  onPlayPause,
  onOpenTafsir,
  onBookmark,
  onAddToPlan,
  onShare,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  verseKey: string;
  isPlaying?: boolean;
  isBookmarked?: boolean;
  showViewTafsir?: boolean;
  showRemove?: boolean;
  onPlayPause?: () => void;
  onOpenTafsir?: () => void;
  onBookmark?: () => void;
  onAddToPlan?: () => void;
  onShare?: () => void | Promise<void>;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const PlayPauseIcon = isPlaying ? Pause : Play;
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [instantClose, setInstantClose] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      pendingActionRef.current = null;
      setInstantClose(false);
    }
  }, [isOpen]);

  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    openDuration: 260,
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
  const hiddenTranslateY = Math.max(360, Math.round(windowHeight * 0.48));

  const handleImmediateAction = React.useCallback(
    (fn?: () => void) => {
      if (!fn) return;
      fn();
      onClose();
    },
    [onClose]
  );

  const handleDeferredAction = React.useCallback(
    (fn?: () => void) => {
      if (!fn) return;
      pendingActionRef.current = fn;
      setInstantClose(true);
      onClose();
    },
    [onClose]
  );

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [dismissEnabledRef, onClose]);

  return (
    <Modal
      transparent
      visible={visible}
      onShow={onModalShow}
      onRequestClose={onClose}
      animationType="none"
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
              backgroundColor: isDark ? palette.background : palette.surface,
              borderColor: palette.border,
            },
            verticalSheetTransform(progress, hiddenTranslateY),
          ]}
          className="rounded-t-3xl border-t"
        >
          <SafeAreaView edges={['bottom']}>
            <View className={isDark ? 'dark' : ''}>
              <View className="flex-row items-center justify-between border-b border-border/30 px-6 py-4 dark:border-border-dark/20">
                <Text
                  numberOfLines={1}
                  className="flex-1 text-base font-semibold text-foreground dark:text-foreground-dark"
                >
                  {title} {verseKey}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <X color={palette.muted} size={18} strokeWidth={2.25} />
                </Pressable>
              </View>

              <View className="px-4 pt-4 pb-2">
                <View className="gap-2">
                  <ActionRow
                    icon={<PlayPauseIcon color={palette.muted} size={20} strokeWidth={2.25} />}
                    label={isPlaying ? 'Pause audio' : 'Play audio'}
                    onPress={() => handleImmediateAction(onPlayPause)}
                    disabled={!onPlayPause}
                  />
                  {showViewTafsir ? (
                    <ActionRow
                      icon={<BookOpenText color={palette.muted} size={20} strokeWidth={2.25} />}
                      label="View Tafsir"
                      onPress={() => handleDeferredAction(onOpenTafsir)}
                      disabled={!onOpenTafsir}
                    />
                  ) : null}
                  <ActionRow
                    icon={<Bookmark color={palette.muted} size={20} strokeWidth={2.25} />}
                    label={showRemove ? 'Remove Bookmark' : 'Pin or Bookmark'}
                    onPress={() => handleDeferredAction(onBookmark)}
                    active={isBookmarked || showRemove}
                    disabled={!onBookmark}
                  />
                  <ActionRow
                    icon={<Calendar color={palette.muted} size={20} strokeWidth={2.25} />}
                    label="Add to Plan"
                    onPress={() => handleDeferredAction(onAddToPlan)}
                    disabled={!onAddToPlan}
                  />
                  <ActionRow
                    icon={<Share2 color={palette.muted} size={20} strokeWidth={2.25} />}
                    label="Share"
                    onPress={() => handleDeferredAction(onShare)}
                    disabled={!onShare}
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
  active = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={[
        'flex-row items-center gap-4 rounded-2xl px-4 py-4',
        active ? 'bg-accent/10' : 'bg-transparent',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.9 : 1 })}
    >
      <View className="h-5 w-5 items-center justify-center">{icon}</View>
      <Text className="text-sm font-medium text-foreground dark:text-foreground-dark">
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
    maxHeight: '90%',
    width: '100%',
  },
});
