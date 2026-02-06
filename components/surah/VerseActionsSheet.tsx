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
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function VerseActionsSheet({
  isOpen,
  onClose,
  title,
  verseKey,
  isPlaying = false,
  isBookmarked = false,
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
  showRemove?: boolean;
  onPlayPause?: () => void;
  onOpenTafsir?: () => void;
  onBookmark?: () => void;
  onAddToPlan?: () => void;
  onShare?: () => void | Promise<void>;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const PlayPauseIcon = isPlaying ? Pause : Play;

  const translateY = React.useRef(new Animated.Value(500)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const animationTokenRef = React.useRef(0);
  const dismissEnabledRef = React.useRef(false);
  const [visible, setVisible] = React.useState(isOpen);

  const runAndClose = React.useCallback(
    (fn?: () => void) => {
      if (!fn) return;
      fn();
      onClose();
    },
    [onClose]
  );

  const runShareAndClose = React.useCallback(() => {
    if (!onShare) return;
    onClose();
    void onShare();
  }, [onClose, onShare]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    const token = ++animationTokenRef.current;
    translateY.stopAnimation();
    overlayOpacity.stopAnimation();

    if (isOpen) {
      dismissEnabledRef.current = false;
      setVisible(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
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
      Animated.timing(translateY, {
        toValue: 500,
        duration: 180,
        useNativeDriver: true,
      }),
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
  }, [isOpen, overlayOpacity, translateY]);

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </Pressable>

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          className="bg-surface dark:bg-surface-dark rounded-t-3xl border-t border-border/30 dark:border-border-dark/20"
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
                    onPress={() => runAndClose(onPlayPause)}
                    disabled={!onPlayPause}
                  />
                  <ActionRow
                    icon={<BookOpenText color={palette.muted} size={20} strokeWidth={2.25} />}
                    label="View Tafsir"
                    onPress={() => runAndClose(onOpenTafsir)}
                    disabled={!onOpenTafsir}
                  />
                  <ActionRow
                    icon={<Bookmark color={palette.muted} size={20} strokeWidth={2.25} />}
                    label={showRemove ? 'Remove Bookmark' : 'Pin or Bookmark'}
                    onPress={() => runAndClose(onBookmark)}
                    active={isBookmarked || showRemove}
                    disabled={!onBookmark}
                  />
                  <ActionRow
                    icon={<Calendar color={palette.muted} size={20} strokeWidth={2.25} />}
                    label="Add to Plan"
                    onPress={() => runAndClose(onAddToPlan)}
                    disabled={!onAddToPlan}
                  />
                  <ActionRow
                    icon={<Share2 color={palette.muted} size={20} strokeWidth={2.25} />}
                    label="Share"
                    onPress={runShareAndClose}
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
