import {
  Bookmark,
  BookOpenText,
  Play,
  RotateCw,
  Share2,
  Volume2,
  X,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useModalTransition, verticalSheetTransform } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import type { WordAnalysis } from '@/src/core/domain/word-study';

import type { WordStudyPressEvent } from './WordStudyPressEvent';
import { WordSegmentsCard } from './WordSegmentsCard';
import {
  describeField,
  describeMissingReason,
  describeMorphology,
  getPosLabel,
  getPrimaryGloss,
  getSourceLabel,
  type WordQuickSheetLoadState,
} from './wordQuickSheetModel';

type Palette = (typeof Colors)['light'];

export function WordQuickSheet({
  isOpen,
  event,
  loadState,
  surahName,
  onClose,
  onRetry,
  onPresented,
  onPlayWord,
  onPlayVerseFromHere,
  onShare,
  onOpenFullStudy,
}: {
  isOpen: boolean;
  event: WordStudyPressEvent | null;
  loadState: WordQuickSheetLoadState;
  surahName: string;
  onClose: () => void;
  onRetry: () => void;
  onPresented: () => void;
  onPlayWord: () => void;
  onPlayVerseFromHere: () => void;
  onShare: () => void | Promise<void>;
  onOpenFullStudy: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.max(280, Math.min(windowHeight - 12, Math.round(windowHeight * 0.86)));
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    openDuration: 220,
    closeDuration: 150,
    onAfterClose: () => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action?.();
    },
  });

  const handleModalShow = React.useCallback(() => {
    onModalShow();
    onPresented();
  }, [onModalShow, onPresented]);

  const handleOverlayPress = React.useCallback(() => {
    if (dismissEnabledRef.current) onClose();
  }, [dismissEnabledRef, onClose]);

  const deferAfterClose = React.useCallback(
    (action: () => void) => {
      pendingActionRef.current = action;
      onClose();
    },
    [onClose]
  );

  const locationLabel = event ? `${event.verseKey}:${event.wordPosition}` : '';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onShow={handleModalShow}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              minHeight: sheetHeight,
              maxHeight: sheetHeight,
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
            verticalSheetTransform(progress, sheetHeight),
          ]}
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={[styles.header, { borderBottomColor: palette.border }]}>
              <View style={styles.headerCopy}>
                <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
                  {surahName} · Word Study
                </Text>
                <Text style={[styles.location, { color: palette.tint }]}>{locationLabel}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Word Study"
                hitSlop={10}
                onPress={onClose}
                style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.65 : 1 }]}
              >
                <X color={palette.muted} size={20} strokeWidth={2.25} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {loadState.status === 'loading' ? (
                <WordQuickSheetSkeleton palette={palette} optimisticSurface={event?.surfaceText} />
              ) : loadState.status === 'error' ? (
                <MessageState
                  palette={palette}
                  title="Couldn’t load Word Study"
                  message={loadState.message}
                  actionLabel="Retry"
                  onAction={onRetry}
                />
              ) : loadState.status === 'missing' ? (
                <MessageState
                  palette={palette}
                  title="Analysis unavailable"
                  message={describeMissingReason(loadState.result.reason)}
                  actionLabel="Retry"
                  onAction={onRetry}
                />
              ) : (
                <AnalysisContent analysis={loadState.analysis} palette={palette} />
              )}

              <View style={[styles.actionsCard, { borderColor: palette.border }]}>
                <ActionRow
                  icon={<Volume2 color={palette.tint} size={20} strokeWidth={2.2} />}
                  label="Play word"
                  onPress={onPlayWord}
                  palette={palette}
                />
                <ActionRow
                  icon={<Play color={palette.tint} size={20} strokeWidth={2.2} />}
                  label="Play verse from here"
                  onPress={onPlayVerseFromHere}
                  palette={palette}
                />
                <ActionRow
                  icon={<Bookmark color={palette.muted} size={20} strokeWidth={2.2} />}
                  label="Save word (coming soon)"
                  palette={palette}
                  disabled
                />
                <ActionRow
                  icon={<Share2 color={palette.tint} size={20} strokeWidth={2.2} />}
                  label="Share"
                  onPress={onShare}
                  palette={palette}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open full word study for ${locationLabel}`}
                onPress={() => deferAfterClose(onOpenFullStudy)}
                style={({ pressed }) => [
                  styles.fullStudyButton,
                  { backgroundColor: palette.tint, opacity: pressed ? 0.86 : 1 },
                ]}
              >
                <BookOpenText color={palette.onAccent} size={20} strokeWidth={2.2} />
                <Text style={[styles.fullStudyButtonText, { color: palette.onAccent }]}>
                  Open full word study
                </Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function AnalysisContent({ analysis, palette }: {
  analysis: WordAnalysis;
  palette: Palette;
}): React.JSX.Element {
  const morphology =
    analysis.morphology.status === 'available'
      ? describeMorphology(analysis.morphology.value)
      : describeMissingReason(analysis.morphology.reason);
  const primaryPos =
    analysis.primaryPos.status === 'available'
      ? getPosLabel(analysis.primaryPos.value)
      : describeMissingReason(analysis.primaryPos.reason);
  const lemma = describeField(analysis.lemma, (value: { arabic: string }) => value.arabic);
  const root = describeField(analysis.root, (value: { arabic: string }) => value.arabic);

  return (
    <View style={styles.analysisContent}>
      <WordSegmentsCard analysis={analysis} />

      <View style={styles.glossBlock}>
        <Text style={[styles.eyebrow, { color: palette.muted }]}>CONTEXTUAL GLOSS</Text>
        <Text style={[styles.gloss, { color: palette.text }]}>{getPrimaryGloss(analysis)}</Text>
      </View>

      <View style={[styles.factsCard, { borderColor: palette.border }]}>
        <FactRow label="Part of speech" value={primaryPos} palette={palette} />
        <FactRow label="Lemma" value={lemma} arabic palette={palette} />
        <FactRow label="Root" value={root} arabic palette={palette} />
        <FactRow label="Current inflection" value={morphology} palette={palette} last />
      </View>

      <Text style={[styles.source, { color: palette.muted }]}>Source: {getSourceLabel(analysis)}</Text>
    </View>
  );
}

function FactRow({
  label,
  value,
  palette,
  arabic = false,
  last = false,
}: {
  label: string;
  value: string;
  palette: Palette;
  arabic?: boolean;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.factRow, !last && { borderBottomColor: palette.border, borderBottomWidth: 1 }]}>
      <Text style={[styles.factLabel, { color: palette.muted }]}>{label}</Text>
      <Text
        style={[
          styles.factValue,
          arabic && styles.factValueArabic,
          { color: palette.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  palette,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void | Promise<void>;
  palette: Palette;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        { backgroundColor: pressed ? palette.interactive : 'transparent', opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={[styles.actionLabel, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

function MessageState({
  palette,
  title,
  message,
  actionLabel,
  onAction,
}: {
  palette: Palette;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.messageState, { backgroundColor: palette.background }]}>
      <Text style={[styles.messageTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.messageCopy, { color: palette.muted }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.72 : 1 }]}
      >
        <RotateCw color={palette.tint} size={17} strokeWidth={2.2} />
        <Text style={[styles.retryText, { color: palette.tint }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function WordQuickSheetSkeleton({
  palette,
  optimisticSurface,
}: {
  palette: Palette;
  optimisticSurface?: string;
}): React.JSX.Element {
  return (
    <View accessibilityLabel="Loading word analysis" style={styles.skeleton}>
      <View style={[styles.wordCard, { backgroundColor: palette.background }]}>
        {optimisticSurface ? (
          <Text style={[styles.arabicWord, { color: palette.text }]}>{optimisticSurface}</Text>
        ) : (
          <SkeletonBar width="54%" height={42} palette={palette} />
        )}
        <ActivityIndicator color={palette.tint} size="small" />
      </View>
      <SkeletonBar width="34%" height={12} palette={palette} />
      <SkeletonBar width="72%" height={22} palette={palette} />
      <View style={[styles.factsCard, { borderColor: palette.border }]}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={styles.skeletonFact}>
            <SkeletonBar width="32%" height={12} palette={palette} />
            <SkeletonBar width="50%" height={14} palette={palette} />
          </View>
        ))}
      </View>
    </View>
  );
}

function SkeletonBar({
  width,
  height,
  palette,
}: {
  width: `${number}%`;
  height: number;
  palette: Palette;
}): React.JSX.Element {
  return <View style={{ width, height, borderRadius: 8, backgroundColor: palette.interactive }} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { width: '100%', borderTopWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  safeArea: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '700' },
  location: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingBottom: 28, gap: 18 },
  analysisContent: { gap: 18 },
  wordCard: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 20, alignItems: 'center', gap: 16 },
  arabicWord: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 38, lineHeight: 62, textAlign: 'center', writingDirection: 'rtl' },
  glossBlock: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  gloss: { fontSize: 19, lineHeight: 27, fontWeight: '600' },
  factsCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  factRow: { paddingHorizontal: 16, paddingVertical: 13, gap: 5 },
  factLabel: { fontSize: 12, fontWeight: '600' },
  factValue: { fontSize: 15, lineHeight: 21 },
  factValueArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 22, lineHeight: 32, writingDirection: 'rtl', textAlign: 'left' },
  source: { fontSize: 11, lineHeight: 17 },
  actionsCard: { borderWidth: 1, borderRadius: 18, padding: 6 },
  actionRow: { minHeight: 50, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIcon: { width: 24, alignItems: 'center' },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  fullStudyButton: { minHeight: 52, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  fullStudyButtonText: { fontSize: 15, fontWeight: '700' },
  messageState: { minHeight: 230, borderRadius: 20, padding: 22, alignItems: 'center', justifyContent: 'center', gap: 10 },
  messageTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  messageCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryButton: { marginTop: 6, minHeight: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
  skeleton: { gap: 16 },
  skeletonFact: { minHeight: 57, paddingHorizontal: 16, justifyContent: 'center', gap: 8 },
});
