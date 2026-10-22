import {
  Bookmark,
  BookOpenText,
  Calendar,
  Copy,
  Ellipsis,
  Pause,
  Play,
  RotateCw,
  Share2,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { VerseTranslationLoadState } from './useReaderStudySheet';
import {
  StudySheetFooter,
  StudySheetFooterAction,
  type StudySheetFooterControls,
} from './WordQuickSheet';

export type StudySheetVerseActions = {
  isPlaying: boolean;
  isBookmarked: boolean;
  onPlayPause: () => void;
  onBookmark: () => void;
  onOpenTafsir: () => void;
  onShare: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onAddToPlan: () => void;
};

export function VerseTranslationContent({
  state,
  hasSelectedTranslations,
  onRetry,
  onChooseTranslation,
}: {
  state: VerseTranslationLoadState;
  hasSelectedTranslations: boolean;
  onRetry: () => void;
  onChooseTranslation?: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const fontSize = Math.min(Math.max(settings.translationFontSize, 15), 24);

  if (state.status === 'loading') {
    return (
      <View accessible accessibilityLabel="Loading translation" style={styles.items}>
        <View style={styles.item}>
          <View style={[styles.skeletonBar, { width: '36%', height: 12, backgroundColor: palette.interactive }]} />
          <View style={[styles.skeletonBar, { width: '100%', backgroundColor: palette.interactive }]} />
          <View style={[styles.skeletonBar, { width: '92%', backgroundColor: palette.interactive }]} />
          <View style={[styles.skeletonBar, { width: '64%', backgroundColor: palette.interactive }]} />
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <Notice
        title="Couldn’t load the translation"
        message={state.message}
        actionLabel="Retry"
        onAction={onRetry}
        icon={<RotateCw color={palette.tint} size={17} strokeWidth={2.2} />}
      />
    );
  }

  if (state.items.length === 0) {
    return hasSelectedTranslations ? (
      <Notice
        title="Translation unavailable"
        message="Your selected translation has no text for this ayah."
        actionLabel="Retry"
        onAction={onRetry}
        icon={<RotateCw color={palette.tint} size={17} strokeWidth={2.2} />}
      />
    ) : (
      <Notice
        title="No translation selected"
        message="Choose a translation to read the meaning of each ayah here."
        {...(onChooseTranslation
          ? { actionLabel: 'Choose translation', onAction: onChooseTranslation }
          : {})}
      />
    );
  }

  return (
    <View style={styles.items}>
      {state.items.map((item) => (
        <View key={item.resourceId} style={styles.item}>
          <Text numberOfLines={2} style={[styles.resourceName, { color: palette.muted }]}>
            {item.resourceName}
          </Text>
          <Text
            selectable
            style={[
              styles.translationText,
              { color: palette.text, fontSize, lineHeight: Math.round(fontSize * 1.55) },
            ]}
          >
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function VerseActionsFooter({
  actions,
  controls,
}: {
  actions: StudySheetVerseActions;
  controls: StudySheetFooterControls;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const PlayPauseIcon = actions.isPlaying ? Pause : Play;

  const openMore = (): void => {
    controls.openMenu([
      {
        key: 'copy',
        label: 'Copy ayah',
        icon: <Copy color={palette.muted} size={20} strokeWidth={2.2} />,
        onPress: () => controls.closeThen(() => void actions.onCopy()),
      },
      {
        key: 'plan',
        label: 'Add to plan',
        icon: <Calendar color={palette.muted} size={20} strokeWidth={2.2} />,
        onPress: () => controls.closeThen(actions.onAddToPlan),
      },
    ]);
  };

  return (
    <StudySheetFooter>
      <StudySheetFooterAction
        icon={<PlayPauseIcon color={palette.tint} size={22} strokeWidth={2.2} />}
        label={actions.isPlaying ? 'Pause' : 'Play'}
        accessibilityLabel={actions.isPlaying ? 'Pause ayah audio' : 'Play ayah audio'}
        onPress={actions.onPlayPause}
      />
      <StudySheetFooterAction
        icon={
          <Bookmark
            color={palette.tint}
            fill={actions.isBookmarked ? palette.tint : 'transparent'}
            size={22}
            strokeWidth={2.2}
          />
        }
        label={actions.isBookmarked ? 'Saved' : 'Bookmark'}
        accessibilityLabel={actions.isBookmarked ? 'Edit ayah bookmark' : 'Bookmark ayah'}
        active={actions.isBookmarked}
        onPress={() => controls.closeThen(actions.onBookmark)}
      />
      <StudySheetFooterAction
        icon={<BookOpenText color={palette.tint} size={22} strokeWidth={2.2} />}
        label="Tafsir"
        accessibilityLabel="Open tafsir for this ayah"
        onPress={() => controls.closeAndNavigate(actions.onOpenTafsir)}
      />
      <StudySheetFooterAction
        icon={<Share2 color={palette.tint} size={22} strokeWidth={2.2} />}
        label="Share"
        accessibilityLabel="Share ayah"
        onPress={() => controls.closeThen(() => void actions.onShare())}
      />
      <StudySheetFooterAction
        icon={<Ellipsis color={palette.tint} size={22} strokeWidth={2.2} />}
        label="More"
        accessibilityLabel="More ayah actions: copy, add to plan"
        onPress={openMore}
      />
    </StudySheetFooter>
  );
}

function Notice({
  title,
  message,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  return (
    <View style={styles.notice}>
      <Text style={[styles.noticeTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.noticeMessage, { color: palette.muted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.noticeAction}
        >
          {({ pressed }) => (
            <View style={[styles.noticeActionContent, { opacity: pressed ? 0.72 : 1 }]}>
              {icon}
              <Text style={[styles.noticeActionLabel, { color: palette.tint }]}>{actionLabel}</Text>
            </View>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  items: { gap: 22 },
  item: { gap: 8 },
  resourceName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  translationText: { writingDirection: 'auto' },
  skeletonBar: { height: 18, borderRadius: 8 },
  notice: { minHeight: 200, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', gap: 10 },
  noticeTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  noticeMessage: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  noticeAction: { marginTop: 6, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  noticeActionContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeActionLabel: { fontSize: 15, fontWeight: '700' },
});
