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
import { SegmentedWord, WordSegmentsLegend } from './WordSegmentsCard';
import {
  describeMissingReason,
  getCompactFieldPresentation,
  getPrimaryGloss,
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
  const sheetHeight = Math.max(280, Math.min(windowHeight - 12, 510));
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
              backgroundColor: palette.background,
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
                <AnalysisContent
                  analysis={loadState.analysis}
                  palette={palette}
                />
              )}

              <View style={[styles.actionsCard, { backgroundColor: palette.surface }]}>
                <SecondaryAction
                  icon={<Volume2 color={palette.tint} size={20} strokeWidth={2.2} />}
                  label="Play"
                  accessibilityLabel="Play word audio"
                  onPress={onPlayWord}
                  palette={palette}
                />
                <SecondaryAction
                  icon={<Bookmark color={palette.muted} size={20} strokeWidth={2.2} />}
                  label="Save"
                  accessibilityLabel="Save word"
                  palette={palette}
                  disabled
                />
                <SecondaryAction
                  icon={<Play color={palette.tint} size={20} strokeWidth={2.2} />}
                  label="Word-Verse"
                  accessibilityLabel="Play verse from this word"
                  onPress={onPlayVerseFromHere}
                  palette={palette}
                />
                <SecondaryAction
                  icon={<BookOpenText color={palette.tint} size={20} strokeWidth={2.2} />}
                  label="More"
                  accessibilityLabel={`Open full word study for ${locationLabel}`}
                  onPress={() => deferAfterClose(onOpenFullStudy)}
                  palette={palette}
                  last
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function AnalysisContent({
  analysis,
  palette,
}: {
  analysis: WordAnalysis;
  palette: Palette;
}): React.JSX.Element {
  const { width, fontScale } = useWindowDimensions();
  const stackSummary = width < 350 || fontScale > 1.25;

  const lemma = getCompactFieldPresentation(
    analysis.lemma,
    (value: { arabic: string }) => value.arabic
  );
  const root = getCompactFieldPresentation(
    analysis.root,
    (value: { arabic: string }) => value.arabic
  );

  return (
    <View style={styles.analysisContent}>
      <View style={[styles.morphologySummary, { backgroundColor: palette.surface }]}>
        <View style={[styles.summaryTopRow, stackSummary && styles.summaryTopRowStacked]}>
          <View style={styles.summaryMeaningColumn}>
            <View style={styles.glossBlock}>
              <Text style={[styles.gloss, { color: palette.text }]}>
                {getPrimaryGloss(analysis)}
              </Text>
            </View>
          </View>
          <View style={styles.summaryArabicColumn}>
            <SegmentedWord analysis={analysis} compact alignment="end" />
          </View>
        </View>
        <WordSegmentsLegend analysis={analysis} layout="wrapped" />
      </View>

      <View style={styles.factsCard}>
        <FactTile
          label="Lemma"
          value={lemma.text}
          accessibilityValue={lemma.accessibilityValue}
          arabic={analysis.lemma.status === 'available'}
          palette={palette}
        />
        <FactTile
          label="Root"
          value={root.text}
          accessibilityValue={root.accessibilityValue}
          arabic={analysis.root.status === 'available'}
          palette={palette}
        />
      </View>
    </View>
  );
}

function FactTile({
  label,
  value,
  accessibilityValue,
  palette,
  arabic = false,
}: {
  label: string;
  value: string;
  accessibilityValue: string;
  palette: Palette;
  arabic?: boolean;
}): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${accessibilityValue}`}
      style={[styles.factTile, { backgroundColor: palette.surface }]}
    >
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

function SecondaryAction({
  icon,
  label,
  accessibilityLabel,
  hint,
  onPress,
  palette,
  disabled = false,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  accessibilityLabel: string;
  hint?: string;
  onPress?: () => void | Promise<void>;
  palette: Palette;
  disabled?: boolean;
  last?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={disabled ? undefined : { color: palette.interactive }}
      style={[
        styles.secondaryAction,
        !last && { borderRightColor: palette.border, borderRightWidth: 1 },
      ]}
    >
      <View style={{ opacity: disabled ? 0.35 : 1, alignItems: 'center', justifyContent: 'center', gap: 3, width: '100%' }}>
        {icon}
        <Text style={[styles.secondaryActionLabel, { color: palette.text }]}>{label}</Text>
        {hint ? <Text style={[styles.secondaryActionHint, { color: palette.muted }]}>{hint}</Text> : null}
      </View>
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
      <View style={[styles.morphologySummary, { backgroundColor: palette.surface }]}>
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryMeaningColumn}>
            <View style={styles.glossBlock}>
              <SkeletonBar width="75%" height={22} palette={palette} />
            </View>
          </View>
          <View style={styles.summaryArabicColumn}>
            {optimisticSurface ? (
              <Text style={[styles.arabicWordCompact, { color: palette.text }]}>
                {optimisticSurface}
              </Text>
            ) : (
              <SkeletonBar width="60%" height={34} palette={palette} />
            )}
          </View>
        </View>
        <View style={styles.skeletonLegendRow}>
          <SkeletonBar width="38%" height={34} palette={palette} />
          <SkeletonBar width="38%" height={34} palette={palette} />
        </View>
      </View>
      <View style={styles.factsCard}>
        {[0, 1].map((index) => (
          <View
            key={index}
            style={[styles.skeletonFact, { backgroundColor: palette.surface }]}
          >
            <SkeletonBar width="32%" height={12} palette={palette} />
            <SkeletonBar width="58%" height={18} palette={palette} />
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
  scrollContent: { padding: 20, paddingBottom: 10, gap: 18 },
  analysisContent: { gap: 18 },
  morphologySummary: { borderRadius: 20, padding: 16, gap: 16 },
  summaryTopRow: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryTopRowStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  summaryMeaningColumn: { flex: 1, minWidth: 150 },
  summaryArabicColumn: { minWidth: 120, alignItems: 'flex-end', justifyContent: 'center' },
  arabicWithAudioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  arabicWordCompact: {
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: 34,
    lineHeight: 54,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  glossBlock: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  gloss: { fontSize: 19, lineHeight: 27, fontWeight: '600' },
  factsCard: {
    minHeight: 92,
    flexDirection: 'row',
    gap: 10,
  },
  factTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  factLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  factValue: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  factValueArabic: {
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: 22,
    lineHeight: 32,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  actionsCard: {
    minHeight: 82,
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  secondaryAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  secondaryActionLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  secondaryActionHint: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  messageState: { minHeight: 230, borderRadius: 20, padding: 22, alignItems: 'center', justifyContent: 'center', gap: 10 },
  messageTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  messageCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryButton: { marginTop: 6, minHeight: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
  skeleton: { gap: 16 },
  skeletonLegendRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  skeletonFact: {
    flex: 1,
    minWidth: 0,
    minHeight: 90,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
