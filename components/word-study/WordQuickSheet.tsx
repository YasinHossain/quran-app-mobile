import {
  BookOpenText,
  Play,
  RotateCw,
  Volume2,
  X,
} from 'lucide-react-native';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/motion/BottomSheet';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import type { WordAnalysis } from '@/src/core/domain/word-study';
import { resolveQuranTextFontFamily } from '@/src/core/infrastructure/fonts/resolveQuranTextFont';
import { useContextualMeaning } from './full-study/useContextualMeaning';
import { CoreStudyPackDownloadPanel } from './full-study/CoreStudyPackDownloadPanel';

import type { ReaderStudySheetTab } from './readerStudySheetModel';
import type { WordStudyPressEvent } from './WordStudyPressEvent';
import { SegmentedWord, WordSegmentsLegend } from './WordSegmentsCard';
import {
  describeMissingReason,
  getCompactFieldPresentation,
  type WordQuickSheetLoadState,
} from './wordQuickSheetModel';

type Palette = (typeof Colors)['light'];

export type StudySheetMenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
};

/** Lets a tab's footer hand off to another surface the way the verse actions sheet does. */
export type StudySheetFooterControls = {
  /** Closes the sheet instantly, then runs the action once it is hidden (dialogs, share). */
  closeThen: (action: () => void) => void;
  /** Closes the sheet and pushes a route in the same batch, so the reader never flashes. */
  closeAndNavigate: (action: () => void) => void;
  /** Shows a small menu above the footer for the less common actions. */
  openMenu: (items: StudySheetMenuItem[]) => void;
};

export type WordQuickSheetTabs = {
  active: ReaderStudySheetTab;
  onChange: (tab: ReaderStudySheetTab) => void;
  verseKey: string;
  /** False when the ayah number opened the sheet: there is no word, so it shows only Translation. */
  showSwitch: boolean;
  translationContent: React.ReactNode;
  renderTranslationFooter: (controls: StudySheetFooterControls) => React.ReactNode;
};

const TAB_ITEMS = [
  { key: 'word', label: 'Word' },
  { key: 'translation', label: 'Translation' },
] as const satisfies readonly { key: ReaderStudySheetTab; label: string }[];

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
  onOpenFullStudy,
  tabs,
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
  onOpenFullStudy: () => void;
  /** Adds the Word / Translation switch; the Mushaf reader has no translation on the page. */
  tabs?: WordQuickSheetTabs;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep a stable drawer while data loads, without exceeding short/landscape screens. Both tabs
  // share one height, so switching never resizes the sheet; long content scrolls inside it.
  const sheetHeight = Math.max(
    0,
    Math.min(tabs ? 560 : 510, windowHeight * 0.85, windowHeight - insets.top - 12)
  );
  const isNavigatingRef = React.useRef(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [instantClose, setInstantClose] = React.useState(false);
  const [menuItems, setMenuItems] = React.useState<StudySheetMenuItem[] | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      isNavigatingRef.current = false;
      pendingActionRef.current = null;
    } else {
      setMenuItems(null);
    }
  }, [isOpen]);

  const handleAfterClose = React.useCallback(() => {
    setInstantClose(false);
    const action = pendingActionRef.current;
    if (!action) return;
    pendingActionRef.current = null;
    requestAnimationFrame(() => {
      action();
    });
  }, []);

  const footerControls = React.useMemo<StudySheetFooterControls>(
    () => ({
      closeThen: (action) => {
        setMenuItems(null);
        pendingActionRef.current = action;
        setInstantClose(true);
        onClose();
      },
      closeAndNavigate: (action) => {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        setMenuItems(null);
        onClose();
        action();
      },
      openMenu: setMenuItems,
    }),
    [onClose]
  );

  const handleOpenFullStudy = React.useCallback(() => {
    footerControls.closeAndNavigate(onOpenFullStudy);
  }, [footerControls, onOpenFullStudy]);

  const activeTab: ReaderStudySheetTab = tabs?.active ?? 'word';
  const locationLabel = event ? `${event.verseKey}:${event.wordPosition}` : '';
  const scrollRef = React.useRef<ScrollViewInstance>(null);

  React.useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [activeTab, isOpen, locationLabel]);

  const handleTabChange = React.useCallback(
    (tab: ReaderStudySheetTab) => {
      setMenuItems(null);
      tabs?.onChange(tab);
    },
    [tabs]
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      height={sheetHeight}
      backgroundColor={palette.background}
      closeDuration={instantClose ? 0 : undefined}
      onShow={onPresented}
      onAfterClose={handleAfterClose}
    >
      <View style={styles.sheetBody}>
        <View style={[styles.header, tabs && styles.headerWithTabs, { borderBottomColor: palette.border }]}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerCopy}>
              {tabs ? (
                <Text numberOfLines={1} style={[styles.title, styles.titleWithTabs, { color: palette.text }]}>
                  {surahName}{' '}
                  <Text style={{ color: palette.tint }}>
                    {activeTab === 'word' && event?.verseKey === tabs.verseKey
                      ? locationLabel
                      : tabs.verseKey}
                  </Text>
                </Text>
              ) : (
                <>
                  <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
                    {surahName} · Word Study
                  </Text>
                  <Text style={[styles.location, { color: palette.tint }]}>{locationLabel}</Text>
                </>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tabs ? 'Close' : 'Close Word Study'}
              hitSlop={10}
              onPress={onClose}
              style={[styles.iconButton, tabs && styles.iconButtonCompact]}
            >
              {({ pressed }) => (
                <X
                  color={palette.muted}
                  size={20}
                  strokeWidth={2.25}
                  style={{ opacity: pressed ? 0.65 : 1 }}
                />
              )}
            </Pressable>
          </View>
          {tabs?.showSwitch ? (
            <SlidingSegmentedControl
              items={TAB_ITEMS}
              selectedKey={tabs.active}
              size="compact"
              onSelect={handleTabChange}
            />
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scrollBody}
          contentContainerStyle={[styles.scrollContent, tabs && styles.scrollContentWithTabs]}
          showsVerticalScrollIndicator
          bounces={false}
          overScrollMode="never"
        >
          {tabs && activeTab === 'translation' ? (
            tabs.translationContent
          ) : loadState.status === 'loading' ? (
            <WordQuickSheetSkeleton palette={palette} optimisticSurface={event?.surfaceText} />
          ) : loadState.status === 'error' && loadState.needsDownload ? (
            <CoreStudyPackDownloadPanel
              palette={palette}
              showHeading={false}
              onInstalled={onRetry}
            />
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
        </ScrollView>

        {tabs && activeTab === 'translation' ? (
          tabs.renderTranslationFooter(footerControls)
        ) : (
          <StudySheetFooter>
            <StudySheetFooterAction
              icon={<Volume2 color={palette.tint} size={22} strokeWidth={2.2} />}
              label="Play word"
              accessibilityLabel="Play word audio"
              onPress={onPlayWord}
            />
            <StudySheetFooterAction
              icon={<Play color={palette.tint} size={22} strokeWidth={2.2} />}
              label="Continue"
              accessibilityLabel="Play verse from this word"
              onPress={onPlayVerseFromHere}
            />
            <StudySheetFooterAction
              icon={<BookOpenText color={palette.tint} size={22} strokeWidth={2.2} />}
              label="Study"
              accessibilityLabel={`Open full word study for ${locationLabel}`}
              onPress={handleOpenFullStudy}
            />
          </StudySheetFooter>
        )}

        {menuItems ? (
          <StudySheetMenu items={menuItems} onDismiss={() => setMenuItems(null)} palette={palette} />
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** The pinned action row shared by both tabs, outside the scroll so it is always reachable. */
export function StudySheetFooter({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  return (
    <View style={[styles.footer, { borderTopColor: palette.border }]}>{children}</View>
  );
}

export function StudySheetFooterAction({
  icon,
  label,
  accessibilityLabel,
  onPress,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active ? { selected: true } : undefined}
      onPress={onPress}
      android_ripple={{ color: palette.interactive, borderless: true }}
      // Static layout style: a style function's sizing did not apply on device.
      style={styles.footerAction}
    >
      {({ pressed }) => (
        <View style={[styles.footerActionContent, { opacity: pressed ? 0.6 : 1 }]}>
          {icon}
          <Text
            numberOfLines={1}
            style={[styles.footerActionLabel, { color: active ? palette.tint : palette.text }]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function StudySheetMenu({
  items,
  onDismiss,
  palette,
}: {
  items: StudySheetMenuItem[];
  onDismiss: () => void;
  palette: Palette;
}): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View
        style={[
          styles.menu,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.key}
            accessibilityRole="menuitem"
            onPress={() => {
              onDismiss();
              item.onPress();
            }}
            android_ripple={{ color: palette.interactive }}
            style={[
              styles.menuItem,
              index > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth },
            ]}
          >
            {item.icon}
            <Text style={[styles.menuItemLabel, { color: palette.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function AnalysisContent({
  analysis,
  palette,
}: {
  analysis: WordAnalysis;
  palette: Palette;
}): React.JSX.Element {
  const meaning = useContextualMeaning(analysis);
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
      <View style={[styles.morphologySummary, { backgroundColor: palette.surfaceNavigation }]}>
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryMeaningColumn}>
            <View style={styles.glossBlock}>
              {meaning.status === 'ready' ? (
                <>
                  <Text
                    accessibilityLabel={`${meaning.presentation.text}. ${meaning.presentation.sourceLabel}`}
                    style={[styles.gloss, {
                      color: palette.text,
                      writingDirection: meaning.presentation.direction,
                      textAlign: meaning.presentation.direction === 'rtl' ? 'right' : 'left',
                    }]}
                  >
                    {meaning.presentation.text}
                  </Text>
                  {meaning.presentation.fallbackMessage ? (
                    <Text style={{ color: palette.muted }}>{meaning.presentation.fallbackMessage}</Text>
                  ) : null}
                </>
              ) : (
                // A plain bar, not ActivityIndicator: creating Android's ProgressBar view took
                // ~31 ms on the UI thread on a budget phone, stalling the sheet's slide.
                <View accessible accessibilityLabel="Loading word meaning">
                  <SkeletonBar width="75%" height={22} palette={palette} />
                </View>
              )}
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
      style={[styles.factTile, { backgroundColor: palette.surfaceNavigation }]}
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
      <View style={[styles.morphologySummary, { backgroundColor: palette.surfaceNavigation }]}>
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryMeaningColumn}>
            <View style={styles.glossBlock}>
              <SkeletonBar width="75%" height={22} palette={palette} />
            </View>
          </View>
          <View style={styles.summaryArabicColumn}>
            {optimisticSurface ? (
              <Text
                style={[
                  styles.arabicWordCompact,
                  {
                    color: palette.text,
                    fontFamily: resolveQuranTextFontFamily(optimisticSurface),
                  },
                ]}
              >
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
            style={[styles.skeletonFact, { backgroundColor: palette.surfaceNavigation }]}
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
  sheetBody: { flex: 1, minHeight: 0 },
  header: { minHeight: 68, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', gap: 10 },
  headerWithTabs: { minHeight: 0, paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12, gap: 6 },
  titleWithTabs: { fontSize: 17, fontWeight: '600' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '700' },
  location: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // With hitSlop 10 its touch target still exceeds 44dp. The negative margin lines the 20dp
  // glyph, not its box, up with the switch's right edge.
  iconButtonCompact: { width: 36, height: 36, marginRight: -8 },
  scrollBody: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 20, paddingBottom: 16, gap: 18 },
  scrollContentWithTabs: { paddingHorizontal: 24 },
  analysisContent: { gap: 18 },
  morphologySummary: { borderRadius: 20, padding: 16, gap: 16 },
  summaryTopRow: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryMeaningColumn: { flex: 1, minWidth: 0 },
  summaryArabicColumn: { flex: 1, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center' },
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
  gloss: { fontSize: 19, lineHeight: 27, fontWeight: '600', textAlign: 'left', writingDirection: 'auto' },
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
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 2,
  },
  footerAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  footerActionContent: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  footerActionLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  menu: {
    position: 'absolute',
    right: 12,
    bottom: 70,
    minWidth: 200,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: { minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuItemLabel: { fontSize: 16, fontWeight: '500' },
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
