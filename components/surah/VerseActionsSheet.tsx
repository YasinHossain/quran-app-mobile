import {
  Bookmark,
  BookOpenText,
  Calendar,
  Copy,
  Pause,
  Play,
  Share2,
  X,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/motion/BottomSheet';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

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
  onCopy,
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
  onCopy?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { t, localizeDigits } = useUiTranslation();
  const PlayPauseIcon = isPlaying ? Pause : Play;
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [instantClose, setInstantClose] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) pendingActionRef.current = null;
  }, [isOpen]);

  // Reset after the sheet is hidden, so opening never triggers a re-render mid-slide.
  const handleAfterClose = React.useCallback(() => {
    setInstantClose(false);
    const action = pendingActionRef.current;
    if (!action) return;
    pendingActionRef.current = null;
    requestAnimationFrame(() => {
      action();
    });
  }, []);

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

  const handleNavigationAction = React.useCallback(
    (fn?: () => void) => {
      if (!fn) return;
      pendingActionRef.current = null;
      setInstantClose(true);

      // Keep the sheet dismissal and route push in the same React event batch.
      // Deferring the push until a later animation frame exposes the reader for
      // one frame, which looks like a full-screen flash before Tafsir appears.
      onClose();
      fn();
    },
    [onClose]
  );

  const [surahIdStr] = (verseKey || '').split(':');
  const surahId = Number(surahIdStr);
  const surahName = surahId ? t('surah_names.' + surahId, { fallback: title }) : title;
  const localizedVerseKey = localizeDigits(verseKey);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={600}
      closeDuration={instantClose ? 0 : undefined}
      onAfterClose={handleAfterClose}
    >
      <View className={isDark ? 'dark' : ''}>
        <View className="flex-row items-center justify-between border-b border-border/30 px-6 py-4 dark:border-border-dark/20">
          <Text
            numberOfLines={2}
            className="flex-1 text-lg font-semibold text-foreground dark:text-foreground-dark mr-3"
          >
            {surahName} {localizedVerseKey}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('close', { fallback: 'Close' })}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <X color={palette.muted} size={20} strokeWidth={2.25} />
          </Pressable>
        </View>

        <View className="px-4 pt-4 pb-2">
          <View className="gap-2">
            <ActionRow
              icon={<PlayPauseIcon color={palette.muted} size={22} strokeWidth={2.25} />}
              label={isPlaying ? t('pause_audio', { fallback: 'Pause audio' }) : t('play_audio', { fallback: 'Play audio' })}
              onPress={() => handleImmediateAction(onPlayPause)}
              disabled={!onPlayPause}
            />
            {showViewTafsir ? (
              <ActionRow
                icon={<BookOpenText color={palette.muted} size={22} strokeWidth={2.25} />}
                label={t('view_tafsir', { fallback: 'View Tafsir' })}
                onPress={() => handleNavigationAction(onOpenTafsir)}
                disabled={!onOpenTafsir}
              />
            ) : null}
            <ActionRow
              icon={<Bookmark color={palette.muted} size={22} strokeWidth={2.25} />}
              label={showRemove ? t('remove_bookmark', { fallback: 'Remove Bookmark' }) : t('pin_or_bookmark', { fallback: 'Pin or Bookmark' })}
              onPress={() => handleDeferredAction(onBookmark)}
              active={isBookmarked || showRemove}
              disabled={!onBookmark}
            />
            <ActionRow
              icon={<Calendar color={palette.muted} size={22} strokeWidth={2.25} />}
              label={t('add_to_plan', { fallback: 'Add to Plan' })}
              onPress={() => handleDeferredAction(onAddToPlan)}
              disabled={!onAddToPlan}
            />
            <ActionRow
              icon={<Copy color={palette.muted} size={22} strokeWidth={2.25} />}
              label={t('copy_verse', { fallback: 'Copy Verse' })}
              onPress={() => handleDeferredAction(onCopy)}
              disabled={!onCopy}
            />
            <ActionRow
              icon={<Share2 color={palette.muted} size={22} strokeWidth={2.25} />}
              label={t('share', { fallback: 'Share' })}
              onPress={() => handleDeferredAction(onShare)}
              disabled={!onShare}
            />
          </View>
        </View>
      </View>
    </BottomSheet>
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
        'flex-row items-center gap-4 rounded-2xl px-4 py-3.5',
        active ? 'bg-accent/10' : 'bg-transparent',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.9 : 1 })}
    >
      <View className="h-6 w-6 items-center justify-center shrink-0">{icon}</View>
      <Text
        className="flex-1 font-medium text-foreground dark:text-foreground-dark"
        style={styles.actionText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionText: {
    fontSize: 17,
    lineHeight: 24,
    includeFontPadding: false,
    transform: [{ translateY: 1.5 }],
  },
});
