import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Info,
  RotateCw,
  Share2,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlidingSegmentedControl, type SlidingSegment } from '@/components/ui/SlidingSegmentedControl';
import Colors from '@/constants/Colors';
import {
  SegmentedWord,
  WordSegmentsLegend,
} from '@/components/word-study/WordSegmentsCard';
import {
  AyahContextSelector,
  type AyahContextWord,
} from '@/components/word-study/full-study/AyahContextSelector';
import { OccurrenceExplorer } from '@/components/word-study/full-study/OccurrenceExplorer';
import { DictionarySection } from '@/components/word-study/full-study/DictionarySection';
import { MorphologyGuideSheet } from '@/components/word-study/full-study/MorphologyGuideSheet';
import { GrammarGuideSheet } from '@/components/word-study/full-study/GrammarGuideSheet';
import { GrammarPackDownloadPanel } from '@/components/word-study/full-study/GrammarPackDownloadPanel';
import { CoreStudyPackDownloadPanel } from '@/components/word-study/full-study/CoreStudyPackDownloadPanel';
import { DictionaryPackDownloadPanel } from '@/components/word-study/full-study/DictionaryPackDownloadPanel';
import { OccurrenceGuideSheet } from '@/components/word-study/full-study/OccurrenceGuideSheet';
import { DictionaryGuideSheet } from '@/components/word-study/full-study/DictionaryGuideSheet';
import {
  areGrammarArabicWordsEquivalent,
  findSelectedWordGrammarPassages,
} from '@/components/word-study/full-study/grammarStudyModel';
import { buildOccurrenceReaderParams } from '@/components/word-study/full-study/occurrenceExplorerModel';
import { readWordStudyNavigationHandoff } from '@/components/word-study/full-study/wordStudyNavigationHandoff';
import {
  useContextualMeaning,
  type ContextualMeaningLoadState,
} from '@/components/word-study/full-study/useContextualMeaning';
import {
  buildWordStudyShareMessage,
  getLemmaText,
  getMorphologyDetails,
  getRootText,
  groupMorphologySegments,
  type MorphologyDetail,
} from '@/components/word-study/full-study/wordStudyScreenModel';
import { describeMissingReason, getPosLabel } from '@/components/word-study/wordQuickSheetModel';
import { useChaptersContext } from '@/providers/ChaptersContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import {
  isVerseGrammarAnalysis,
  toWordStudyLocation,
  type GrammarPassage,
  type GrammarStudyLookupResult,
  type Morpheme,
  type WordAnalysis,
  type WordOccurrence,
  type WordOccurrenceScope,
  type WordStudyLocation,
} from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';
import { resolveQuranTextFontFamily } from '@/src/core/infrastructure/fonts/resolveQuranTextFont';
import { WordStudyPackNotInstalledError } from '@/src/core/infrastructure/word-study';

type Palette = (typeof Colors)['light'];
type StudyTab = 'morphology' | 'grammar' | 'occurrences' | 'dictionary';
const WORD_STUDY_TABS: readonly SlidingSegment<StudyTab>[] = [
  { key: 'morphology', label: 'Morphology' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'occurrences', label: 'Occurrences' },
  { key: 'dictionary', label: 'Dictionary' },
];
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; words: readonly WordAnalysis[] }
  | { status: 'error'; message: string; needsDownload?: boolean };
type GrammarLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: GrammarStudyLookupResult }
  | { status: 'error' };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function parseRouteLocation(params: {
  surah?: string | string[];
  ayah?: string | string[];
  position?: string | string[];
}): WordStudyLocation | null {
  try {
    return toWordStudyLocation(
      `${firstParam(params.surah)}:${firstParam(params.ayah)}:${firstParam(params.position)}`
    );
  } catch {
    return null;
  }
}

export default function WordStudyScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{
    surah?: string | string[];
    ayah?: string | string[];
    position?: string | string[];
  }>();
  const location = React.useMemo(
    () => parseRouteLocation(params),
    [params.ayah, params.position, params.surah]
  );
  const [navigationHandoff] = React.useState(() =>
    location ? readWordStudyNavigationHandoff(location.locationKey) : null
  );
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { width: windowWidth } = useWindowDimensions();
  const { chapters } = useChaptersContext();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<StudyTab>('morphology');
  const [optimisticWordPosition, setOptimisticWordPosition] = React.useState<number | null>(null);
  const [mountedTabs, setMountedTabs] = React.useState<ReadonlySet<StudyTab>>(
    () => new Set<StudyTab>(['morphology'])
  );
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [isMorphologyGuideOpen, setIsMorphologyGuideOpen] = React.useState(false);
  const [isGrammarGuideOpen, setIsGrammarGuideOpen] = React.useState(false);
  const [isOccurrenceGuideOpen, setIsOccurrenceGuideOpen] = React.useState(false);
  const [isDictionaryGuideOpen, setIsDictionaryGuideOpen] = React.useState(false);
  const [grammarLoadState, setGrammarLoadState] = React.useState<GrammarLoadState>({
    status: 'idle',
  });
  const [grammarRetryNonce, setGrammarRetryNonce] = React.useState(0);
  const [requestedOccurrenceScope, setRequestedOccurrenceScope] = React.useState<{
    scope: WordOccurrenceScope;
    requestId: number;
  } | null>(null);
  const occurrenceRequestIdRef = React.useRef(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollOffsetRef = React.useRef(0);
  const occurrenceSectionYRef = React.useRef(0);
  const restoreAfterReaderRef = React.useRef(false);
  const surahName = location
    ? chapters.find((chapter) => chapter.id === location.surah)?.name_simple ?? `Surah ${location.surah}`
    : 'Word Study';

  React.useEffect(() => {
    if (!location) {
      setLoadState({ status: 'error', message: 'This Word Study link is not valid.' });
      return;
    }
    let cancelled = false;
    setLoadState({ status: 'loading' });
    void container
      .getVerseWordAnalyses()
      .execute(location.verseKey)
      .then((words) => {
        if (cancelled) return;
        setLoadState(
          words.length
            ? { status: 'ready', words }
            : { status: 'error', message: 'This ayah is not available in the installed study pack.' }
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const needsDownload =
            error instanceof WordStudyPackNotInstalledError ||
            (error instanceof Error && error.name === 'WordStudyPackNotInstalledError');
          setLoadState({
            status: 'error',
            message: needsDownload
              ? 'Download Word Study Essentials once to use this feature fully offline.'
              : 'Word analysis could not be loaded from the offline study pack.',
            needsDownload,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location?.verseKey, retryNonce]);

  React.useEffect(() => {
    if (!location || tab !== 'grammar') return;
    let cancelled = false;
    setGrammarLoadState({ status: 'loading' });
    void container
      .getVerseGrammar()
      .execute(location.verseKey)
      .then((result) => {
        if (!cancelled) setGrammarLoadState({ status: 'ready', result });
      })
      .catch(() => {
        if (!cancelled) setGrammarLoadState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [grammarRetryNonce, location?.verseKey, tab]);

  const words = loadState.status === 'ready' ? loadState.words : [];
  const immediateContextWords = React.useMemo<readonly AyahContextWord[]>(() => {
    if (!navigationHandoff || navigationHandoff.verseKey !== location?.verseKey) return [];
    return navigationHandoff.verseWords.map((word) => ({
      location: toWordStudyLocation(
        `${navigationHandoff.verseKey}:${word.wordPosition}`
      ),
      surfaceUthmani: word.surfaceText,
    }));
  }, [location?.verseKey, navigationHandoff]);
  const contextWords: readonly AyahContextWord[] = words.length
    ? words
    : immediateContextWords;
  const selectedFromLoadedVerse = location
    ? words.find((word) => word.location.wordPosition === location.wordPosition)
    : undefined;
  const handedOffAnalysis = navigationHandoff?.selectedAnalysis;
  const selectedFromHandoff =
    handedOffAnalysis?.location.locationKey === location?.locationKey
      ? handedOffAnalysis
      : undefined;
  const selected = selectedFromLoadedVerse ?? selectedFromHandoff;
  const selectedWordPosition = optimisticWordPosition ?? location?.wordPosition ?? 0;
  const contextualMeaning = useContextualMeaning(selected);

  React.useEffect(() => {
    if (optimisticWordPosition === location?.wordPosition) {
      setOptimisticWordPosition(null);
    }
  }, [location?.wordPosition, optimisticWordPosition]);

  const selectPosition = React.useCallback(
    (position: number) => {
      setOptimisticWordPosition(position);
      React.startTransition(() => {
        router.setParams({ position: String(position) });
      });
    },
    [router]
  );
  const selectTab = React.useCallback((nextTab: StudyTab) => {
    setMountedTabs((current) => {
      if (current.has(nextTab)) return current;
      return new Set([...current, nextTab]);
    });
    setTab(nextTab);
  }, []);
  const openOccurrenceScope = React.useCallback((scope: WordOccurrenceScope) => {
    occurrenceRequestIdRef.current += 1;
    setRequestedOccurrenceScope({ scope, requestId: occurrenceRequestIdRef.current });
    selectTab('occurrences');
  }, [selectTab]);

  const handleShare = React.useCallback(() => {
    if (!selected) return;
    void Share.share({ message: buildWordStudyShareMessage(selected, surahName) });
  }, [selected, surahName]);

  const handleOpenGuide = React.useCallback(() => {
    if (tab === 'morphology') {
      setIsMorphologyGuideOpen(true);
    } else if (tab === 'grammar') {
      setIsGrammarGuideOpen(true);
    } else if (tab === 'occurrences') {
      setIsOccurrenceGuideOpen(true);
    } else if (tab === 'dictionary') {
      setIsDictionaryGuideOpen(true);
    }
  }, [tab]);

  const handleOpenOccurrenceInReader = React.useCallback((occurrence: WordOccurrence) => {
    restoreAfterReaderRef.current = true;
    router.push(buildOccurrenceReaderParams(occurrence) as never);
  }, [router]);

  const handleScrollToOccurrenceFilters = React.useCallback(
    (offsetY: number, animated: boolean) => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, occurrenceSectionYRef.current + offsetY),
        animated,
      });
    },
    []
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!restoreAfterReaderRef.current) return;
      restoreAfterReaderRef.current = false;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: scrollOffsetRef.current, animated: false });
      });
    }, [])
  );

  const bottomPadding = Math.max(28, insets.bottom + 20) + audioPlayerBarHeight;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to reader"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: palette.text }]}>
            {surahName} · Word Study
          </Text>
          <Text style={[styles.location, { color: palette.tint }]}>
            {location?.locationKey ?? 'Invalid location'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            tab === 'morphology'
              ? 'Understanding morphology terms'
              : tab === 'grammar'
                ? 'About this grammar'
                : tab === 'occurrences'
                  ? 'About occurrences'
                  : 'About dictionary'
          }
          accessibilityState={{ disabled: !selected }}
          disabled={!selected}
          hitSlop={10}
          onPress={handleOpenGuide}
          style={[styles.headerButton, { opacity: selected ? 1 : 0.35 }]}
        >
          <Info color={palette.text} size={20} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share word study with source attribution"
          accessibilityState={{ disabled: !selected }}
          disabled={!selected}
          hitSlop={10}
          onPress={handleShare}
          style={[styles.headerButton, { opacity: selected ? 1 : 0.35 }]}
        >
          <Share2 color={palette.text} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>

      {loadState.status === 'loading' && contextWords.length === 0 ? (
        <CenteredState palette={palette} loading title="Loading this ayah" message="Reading the installed Word Study pack…" />
      ) : loadState.status === 'error' && contextWords.length === 0 && !loadState.needsDownload ? (
        <CenteredState
          palette={palette}
          title="Couldn’t open Word Study"
          message={loadState.message}
          actionLabel={loadState.needsDownload ? 'Manage Word Study' : location ? 'Retry' : undefined}
          onAction={loadState.needsDownload ? () => router.push('/manage-word-study') : location ? () => setRetryNonce((value) => value + 1) : undefined}
        />
      ) : loadState.status === 'ready' && !selected ? (
        <CenteredState
          palette={palette}
          title="Analysis unavailable"
          message="This word position is not present in the installed study pack."
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
        >
          {contextWords.length ? (
            <AyahContextSelector
              words={contextWords}
              selectedPosition={selectedWordPosition}
              onSelect={selectPosition}
            />
          ) : null}
          <SlidingSegmentedControl
            items={WORD_STUDY_TABS}
            selectedKey={tab}
            width={Math.max(0, Math.min(688, windowWidth - 32))}
            labelFontSize={11}
            onSelect={selectTab}
          />
          {!selected && loadState.status === 'error' && loadState.needsDownload ? (
            <UnavailableStudyTab
              tab={tab}
              palette={palette}
              onEssentialsInstalled={() => setRetryNonce((value) => value + 1)}
              onGrammarInstalled={() => setGrammarRetryNonce((value) => value + 1)}
            />
          ) : !selected ? (
            <InlineAnalysisState
              loading={loadState.status === 'loading'}
              message={
                loadState.status === 'error'
                  ? loadState.message
                  : 'Reading the detailed word analysis…'
              }
              onRetry={
                loadState.status === 'error'
                  ? () => setRetryNonce((value) => value + 1)
                  : undefined
              }
              palette={palette}
            />
          ) : (
            <>
              <PersistentTabPanel active={tab === 'morphology'}>
                <MorphologySection
                  analysis={selected}
                  contextualMeaning={contextualMeaning}
                  palette={palette}
                  onSelectOccurrenceScope={openOccurrenceScope}
                />
              </PersistentTabPanel>
              {mountedTabs.has('grammar') ? (
                <PersistentTabPanel active={tab === 'grammar'}>
                  <GrammarSection
                    analysis={selected}
                    verseWords={contextWords}
                    grammarLoadState={grammarLoadState}
                    palette={palette}
                    onGrammarInstalled={() => setGrammarRetryNonce((value) => value + 1)}
                  />
                </PersistentTabPanel>
              ) : null}
              {mountedTabs.has('occurrences') ? (
                <PersistentTabPanel active={tab === 'occurrences'}>
                  <View
                    onLayout={(event) => {
                      occurrenceSectionYRef.current = event.nativeEvent.layout.y;
                    }}
                  >
                    <OccurrenceExplorer
                      analysis={selected}
                      palette={palette}
                      onOpenReader={handleOpenOccurrenceInReader}
                      onRequestScrollToFilters={handleScrollToOccurrenceFilters}
                      requestedScope={requestedOccurrenceScope}
                      isGuideOpen={isOccurrenceGuideOpen}
                      onCloseGuide={() => setIsOccurrenceGuideOpen(false)}
                    />
                  </View>
                </PersistentTabPanel>
              ) : null}
              {mountedTabs.has('dictionary') ? (
                <PersistentTabPanel active={tab === 'dictionary'}>
                  <DictionarySection
                    analysis={selected}
                    palette={palette}
                    isActive={tab === 'dictionary'}
                    isGuideOpen={isDictionaryGuideOpen}
                    onCloseGuide={() => setIsDictionaryGuideOpen(false)}
                  />
                </PersistentTabPanel>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
      <MorphologyGuideSheet
        isOpen={isMorphologyGuideOpen}
        onClose={() => setIsMorphologyGuideOpen(false)}
      />
      <GrammarGuideSheet
        isOpen={isGrammarGuideOpen}
        onClose={() => setIsGrammarGuideOpen(false)}
      />
    </SafeAreaView>
  );
}

function UnavailableStudyTab({
  tab,
  palette,
  onEssentialsInstalled,
  onGrammarInstalled,
}: {
  tab: StudyTab;
  palette: Palette;
  onEssentialsInstalled: () => void;
  onGrammarInstalled: () => void;
}): React.JSX.Element {
  if (tab === 'grammar') {
    return <GrammarPackDownloadPanel palette={palette} onInstalled={onGrammarInstalled} />;
  }
  if (tab === 'dictionary') {
    return <DictionaryPackDownloadPanel palette={palette} />;
  }
  return (
    <CoreStudyPackDownloadPanel
      palette={palette}
      title={tab === 'occurrences' ? 'Occurrences index' : 'Morphology & meanings'}
      description={
        tab === 'occurrences'
          ? 'Download the Essentials pack to search Quran occurrences by surface form, lemma, root, and root family fully offline.'
          : 'Download the Essentials pack to study morphology, word meanings, roots, lemmas, and segments fully offline.'
      }
      onInstalled={onEssentialsInstalled}
    />
  );
}

function PersistentTabPanel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      pointerEvents={active ? 'auto' : 'none'}
      style={!active ? styles.hiddenTab : undefined}
    >
      {children}
    </View>
  );
}

function MorphologySection({ analysis, contextualMeaning, palette, onSelectOccurrenceScope }: {
  analysis: WordAnalysis;
  contextualMeaning: ContextualMeaningLoadState;
  palette: Palette;
  onSelectOccurrenceScope: (scope: WordOccurrenceScope) => void;
}): React.JSX.Element {
  const segments = analysis.morphemes.status === 'available' ? analysis.morphemes.value : [];
  const segmentGroups = groupMorphologySegments(segments);
  const { fontScale, width } = useWindowDimensions();
  const useSingleColumn = width < 340 || fontScale > 1.35;
  const stackSummary = width < 350 || fontScale > 1.25;
  return (
    <View style={styles.section}>
      <View style={[styles.morphologySummary, { backgroundColor: palette.surfaceNavigation }]}>
        <View style={[styles.summaryTopRow, stackSummary && styles.summaryTopRowStacked]}>
          <View style={styles.summaryMeaningColumn}>
            <ContextualMeaningBlock state={contextualMeaning} palette={palette} />
          </View>
          <View style={styles.summaryArabicColumn}>
            <SegmentedWord analysis={analysis} compact alignment="end" />
          </View>
        </View>
        <WordSegmentsLegend analysis={analysis} layout="wrapped" />
      </View>
      <View style={styles.lexicalFacts}>
        <CompactStudyFact
          label="Lemma"
          arabicTerm="الصيغة المعجمية"
          value={getLemmaText(analysis)}
          available={analysis.lemma.status === 'available'}
          onPress={analysis.lemma.status === 'available' ? () => onSelectOccurrenceScope('lemma') : undefined}
          palette={palette}
          fullWidth={useSingleColumn}
        />
        <CompactStudyFact
          label="Root"
          arabicTerm="الجذر"
          value={getRootText(analysis)}
          available={analysis.root.status === 'available'}
          onPress={analysis.root.status === 'available' ? () => onSelectOccurrenceScope('root') : undefined}
          palette={palette}
          fullWidth={useSingleColumn}
        />
      </View>
      <SectionHeading
        title="How this word is built"
        palette={palette}
      />
      {segmentGroups.length ? segmentGroups.map((group) => (
        <SegmentGroupCard
          key={`${group.segments[0]?.locationKey}:${group.segments[0]?.segmentIndex}-${group.segments[group.segments.length - 1]?.segmentIndex}`}
          segments={group.segments}
          palette={palette}
          singleColumnFacts={useSingleColumn}
        />
      )) : (
        <NoticeCard message={analysis.morphemes.status === 'available' ? 'No segments are recorded for this word.' : describeMissingReason(analysis.morphemes.reason)} palette={palette} />
      )}
    </View>
  );
}

function ContextualMeaningBlock({ state, palette }: {
  state: ContextualMeaningLoadState;
  palette: Palette;
}): React.JSX.Element {
  return (
    <View style={styles.glossBlock} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={[styles.eyebrow, { color: palette.muted }]}>Meaning in this ayah</Text>
      {state.status === 'ready' ? (
        <Text
          accessibilityLabel={[
            `Meaning in this ayah: ${state.presentation.text}.`,
            state.presentation.sourceLabel,
            state.presentation.fallbackMessage,
          ].filter(Boolean).join(' ')}
          style={[
            styles.gloss,
            {
              color: palette.text,
              writingDirection: state.presentation.direction,
              textAlign: state.presentation.direction === 'rtl' ? 'right' : 'left',
            },
          ]}
        >
          {state.presentation.text}
        </Text>
      ) : (
        <View style={styles.meaningLoading}>
          <ActivityIndicator color={palette.tint} size="small" />
          <Text style={[styles.explanation, { color: palette.muted }]}>Reading the installed {state.status === 'loading' ? state.languageName : 'word-language'} pack…</Text>
        </View>
      )}
    </View>
  );
}

function GrammarSection({
  analysis,
  verseWords,
  grammarLoadState,
  palette,
  onGrammarInstalled,
}: {
  analysis: WordAnalysis;
  verseWords: readonly AyahContextWord[];
  grammarLoadState: GrammarLoadState;
  palette: Palette;
  onGrammarInstalled: () => void;
}): React.JSX.Element {
  const [showFullAyah, setShowFullAyah] = React.useState(false);
  const [expandedPassages, setExpandedPassages] = React.useState<ReadonlySet<number>>(new Set());
  const previousLocationKeyRef = React.useRef(analysis.location.locationKey);

  React.useEffect(() => {
    if (previousLocationKeyRef.current === analysis.location.locationKey) return;
    previousLocationKeyRef.current = analysis.location.locationKey;
    setShowFullAyah(false);
    setExpandedPassages(new Set());
  }, [analysis.location.locationKey]);

  if (grammarLoadState.status === 'idle' || grammarLoadState.status === 'loading') {
    return (
      <View style={styles.grammarLoading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={palette.tint} />
        <Text style={[styles.explanation, { color: palette.muted }]}>
          Loading Arabic grammar…
        </Text>
      </View>
    );
  }
  if (grammarLoadState.status === 'error') {
    return (
      <NoticeCard
        message="Arabic grammar could not be opened from the installed offline pack."
        palette={palette}
      />
    );
  }
  if (!isVerseGrammarAnalysis(grammarLoadState.result)) {
    if (
      grammarLoadState.result.status === 'unavailable' &&
      grammarLoadState.result.reason === 'grammar-pack-unavailable'
    ) {
      return <GrammarPackDownloadPanel palette={palette} onInstalled={onGrammarInstalled} />;
    }
    return (
      <View style={styles.section}>
        <SectionHeading
          title="Arabic grammar"
          subtitle="Brief i‘rab for the selected word and its ayah."
          palette={palette}
        />
        <NoticeCard
          message="The installed grammar source does not contain an analysis for this ayah."
          palette={palette}
        />
      </View>
    );
  }

  const grammar = grammarLoadState.result;
  const selectedPassages = findSelectedWordGrammarPassages(grammar, analysis, verseWords);
  const togglePassage = (sequence: number): void => {
    setExpandedPassages((current) => {
      const next = new Set(current);
      if (next.has(sequence)) next.delete(sequence);
      else next.add(sequence);
      return next;
    });
  };

  return (
    <View style={styles.section}>
      <View style={[styles.grammarHero, { backgroundColor: palette.surfaceNavigation }]}>
        <Text
          style={[
            styles.grammarHeroWord,
            {
              color: palette.text,
              fontFamily: resolveQuranTextFontFamily(analysis.surfaceUthmani),
            },
          ]}
        >
          {analysis.surfaceUthmani}
        </Text>
      </View>

      {selectedPassages.length ? (
        selectedPassages.map((passage) => (
          <GrammarPassageCard
            key={passage.sequence}
            passage={passage}
            expanded={expandedPassages.has(passage.sequence)}
            onToggle={() => togglePassage(passage.sequence)}
            palette={palette}
            emphasized
            highlightedWord={analysis.surfaceUthmani}
          />
        ))
      ) : (
        <Text style={[styles.grammarEmptyMessage, { color: palette.muted }]}>
          No separate grammar note for this word. Open complete grammar.
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showFullAyah }}
        onPress={() => setShowFullAyah((value) => !value)}
        style={({ pressed }) => [
          styles.grammarDisclosure,
          { backgroundColor: palette.surfaceNavigation, opacity: pressed ? 0.68 : 1 },
        ]}
      >
        <View style={styles.grammarDisclosureRow}>
          <Text style={[styles.grammarDisclosureTitle, { color: palette.text }]}>
            Complete verse grammar
          </Text>
          <View style={[styles.guideIcon, { backgroundColor: palette.interactive }]}>
            {showFullAyah ? (
              <ChevronDown color={palette.tint} size={20} strokeWidth={2.2} />
            ) : (
              <ChevronRight color={palette.tint} size={20} strokeWidth={2.2} />
            )}
          </View>
        </View>
      </Pressable>

      {showFullAyah ? (
        <View style={styles.grammarPassageList}>
          {grammar.passages.map((passage) => (
            <GrammarPassageCard
              key={passage.sequence}
              passage={passage}
              expanded={expandedPassages.has(passage.sequence)}
              onToggle={() => togglePassage(passage.sequence)}
              palette={palette}
              highlightedWord={analysis.surfaceUthmani}
            />
          ))}
        </View>
      ) : null}

    </View>
  );
}

function GrammarPassageCard({
  passage,
  expanded,
  onToggle,
  palette,
  emphasized = false,
  highlightedWord,
}: {
  passage: GrammarPassage;
  expanded: boolean;
  onToggle: () => void;
  palette: Palette;
  emphasized?: boolean;
  highlightedWord?: string;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const canCollapse = passage.bodyArabic.length > 280;
  return (
    <View
      style={[
        styles.grammarCard,
        {
          backgroundColor: palette.surfaceNavigation,
        },
      ]}
    >
      {passage.headingArabic ? (
        <Text style={[styles.grammarHeadingArabic, { color: palette.text }]}>
          {passage.headingArabic
            .split(/([^\p{Script=Arabic}\p{M}\u0640]+)/gu)
            .map((part, index) => {
              const highlighted = highlightedWord
                ? areGrammarArabicWordsEquivalent(part, highlightedWord)
                : false;
              return (
                <Text
                  key={`${index}:${part}`}
                  style={highlighted ? { color: palette.tint, fontWeight: '800' } : undefined}
                >
                  {part}
                </Text>
              );
            })}
        </Text>
      ) : null}
      <Text
        numberOfLines={canCollapse && !expanded ? 6 : undefined}
        style={[styles.grammarBodyArabic, { color: palette.text }]}
      >
        {passage.bodyArabic}
      </Text>
      {canCollapse ? (
        <Pressable accessibilityRole="button" onPress={onToggle} style={styles.grammarMoreButton}>
          <Text style={[styles.grammarMoreText, { color: palette.tint }]}>
            {expanded ? 'Show less' : 'Read full analysis'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getSegmentRole(
  segmentType: Morpheme['segmentType'],
  plural: boolean
): readonly [string, string] {
  if (segmentType === 'prefix') return plural ? ['Prefixes', 'السوابق'] : ['Prefix', 'سابقة'];
  if (segmentType === 'suffix') return plural ? ['Suffixes', 'اللواحق'] : ['Suffix', 'لاحقة'];
  if (segmentType === 'stem') return plural ? ['Stems', 'جذوع الكلمات'] : ['Stem', 'جذع الكلمة'];
  if (segmentType === 'infix') return plural ? ['Infixes', 'المقاطع الداخلية'] : ['Infix', 'مقطع داخلي'];
  return plural ? ['Whole words', 'الكلمات الكاملة'] : ['Whole word', 'الكلمة كاملة'];
}

function SegmentGroupCard({ segments, palette, singleColumnFacts }: {
  segments: readonly Morpheme[];
  palette: Palette;
  singleColumnFacts: boolean;
}): React.JSX.Element {
  const firstSegment = segments[0];
  const grouped = segments.length > 1;
  const role = getSegmentRole(firstSegment?.segmentType ?? 'whole-word', grouped);
  return (
    <View style={[styles.segmentCard, { backgroundColor: palette.surfaceNavigation }]}>
      {grouped ? (
        <Text style={[styles.segmentGroupTitle, { color: palette.text }]}>{role[0]} · {role[1]}</Text>
      ) : null}
      {segments.map((segment, index) => (
        <React.Fragment key={`${segment.locationKey}:${segment.segmentIndex}`}>
          {index > 0 ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.segmentGroupDivider, { backgroundColor: palette.border }]}
            />
          ) : null}
          <SegmentGroupMember
            segment={segment}
            role={role}
            index={index}
            count={segments.length}
            showRole={!grouped}
            palette={palette}
            singleColumnFacts={singleColumnFacts}
          />
        </React.Fragment>
      ))}
    </View>
  );
}

function SegmentGroupMember({
  segment,
  role,
  index,
  count,
  showRole,
  palette,
  singleColumnFacts,
}: {
  segment: Morpheme;
  role: readonly [string, string];
  index: number;
  count: number;
  showRole: boolean;
  palette: Palette;
  singleColumnFacts: boolean;
}): React.JSX.Element {
  const details = getMorphologyDetails(segment.features);
  return (
    <View style={styles.segmentGroupMember}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${role[0]}${count > 1 ? ` ${index + 1} of ${count}` : ''}: ${segment.arabic}, ${getPosLabel(segment.posCode)}`}
        style={styles.segmentHeader}
      >
        <Text
          style={[
            styles.segmentArabic,
            {
              color: palette.text,
              fontFamily: resolveQuranTextFontFamily(segment.arabic),
            },
          ]}
        >
          {segment.arabic}
        </Text>
        <View style={styles.segmentHeaderCopy}>
          {showRole ? (
            <Text style={[styles.segmentTitle, { color: palette.text }]}>{role[0]} · {role[1]}</Text>
          ) : null}
          <Text style={[styles.segmentPos, { color: palette.tint }]}>{getPosLabel(segment.posCode)} · {segment.posCode}</Text>
        </View>
      </View>
      {details.length ? (
        <View style={[styles.segmentDetails, { borderTopColor: palette.border }]}>
          {details.map((detail) => (
            <MorphologyFact
              key={detail.key}
              detail={detail}
              palette={palette}
              fullWidth={singleColumnFacts}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MorphologyFact({ detail, palette, fullWidth }: {
  detail: MorphologyDetail;
  palette: Palette;
  fullWidth: boolean;
}): React.JSX.Element {
  return (
    <View style={[
      styles.morphologyFact,
      fullWidth && styles.factTileFullWidth,
      { backgroundColor: palette.interactive },
    ]}>
      <Text style={[styles.factLabel, { color: palette.muted }]}>{detail.label} · {detail.arabicTerm}</Text>
      <Text style={[styles.factValue, { color: palette.text }]}>{detail.value}</Text>
    </View>
  );
}

function CompactStudyFact({ label, arabicTerm, value, available, palette, fullWidth, onPress }: {
  label: string;
  arabicTerm: string;
  value: string;
  available: boolean;
  palette: Palette;
  fullWidth: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const content = (
    <>
      <Text style={[styles.factLabel, { color: palette.muted }]}>{label} · {arabicTerm}</Text>
      <Text
        style={[
          styles.factValue,
          available ? styles.factValueArabic : styles.factValueUnavailable,
          { color: available ? palette.text : palette.muted },
        ]}
      >
        {available ? value : '—'}
      </Text>
    </>
  );
  const style = [
    styles.lexicalFact,
    fullWidth && styles.factTileFullWidth,
    { backgroundColor: palette.surfaceNavigation, borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth },
  ];
  return onPress ? (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Show ${label.toLowerCase()} occurrences`}
      onPress={onPress}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.72 : 1 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityRole="text" accessibilityLabel={`${label}: ${value}`} style={style}>
      {content}
    </View>
  );
}

function SectionHeading({ title, subtitle, palette }: { title: string; subtitle?: string; palette: Palette }): React.JSX.Element {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.explanation, { color: palette.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

function NoticeCard({ message, palette }: { message: string; palette: Palette }): React.JSX.Element {
  return (
    <View
      style={[styles.noticeCard, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}
    >
      <Text style={[styles.explanation, { color: palette.muted }]}>{message}</Text>
    </View>
  );
}

function InlineAnalysisState({ loading, message, onRetry, palette }: {
  loading: boolean;
  message: string;
  onRetry?: () => void;
  palette: Palette;
}): React.JSX.Element {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.inlineAnalysisState, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}
    >
      {loading ? <ActivityIndicator color={palette.tint} /> : null}
      <Text style={[styles.explanation, { color: palette.muted }]}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <RotateCw color={palette.tint} size={17} strokeWidth={2.2} />
          <Text style={[styles.retryText, { color: palette.tint }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CenteredState({ palette, title, message, loading = false, actionLabel, onAction }: {
  palette: Palette;
  title: string;
  message: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.centeredState} accessibilityLiveRegion="polite">
      {loading ? <ActivityIndicator color={palette.tint} size="large" /> : null}
      <Text style={[styles.stateTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.stateMessage, { color: palette.muted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.retry}>
          <RotateCw color={palette.tint} size={17} strokeWidth={2.2} />
          <Text style={[styles.retryText, { color: palette.tint }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  location: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.25 },
  scroll: { flex: 1 },
  hiddenTab: { display: 'none' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 14, gap: 16 },
  section: { gap: 16 },
  morphologySummary: { borderRadius: 20, padding: 16, gap: 16 },
  summaryTopRow: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryTopRowStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  summaryMeaningColumn: { flex: 1, minWidth: 150 },
  summaryArabicColumn: { minWidth: 120, alignItems: 'flex-end', justifyContent: 'center' },
  glossBlock: { gap: 5, paddingHorizontal: 2 },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1 },
  gloss: { fontSize: 20, lineHeight: 29, fontWeight: '600' },
  meaningLoading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  explanation: { fontSize: 13, lineHeight: 20 },
  lexicalFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lexicalFact: { flexBasis: '47%', flexGrow: 1, minHeight: 96, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 1 },
  factTileFullWidth: { flexBasis: '100%', maxWidth: '100%' },
  factLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  factValue: { fontSize: 16, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  factValueArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 30, lineHeight: 44, writingDirection: 'rtl' },
  factValueUnavailable: { fontSize: 24, lineHeight: 32, fontWeight: '500' },
  guideRow: { minHeight: 58, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 9 },
  guideRowContent: { direction: 'ltr', flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  guideIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  guideLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sectionHeading: { gap: 3, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  segmentCard: { borderRadius: 20, padding: 16, gap: 8 },
  segmentGroupTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  segmentGroupMember: { gap: 8 },
  segmentGroupDivider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, marginHorizontal: 12, marginVertical: 4 },
  segmentHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  segmentArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 30, lineHeight: 44, writingDirection: 'rtl' },
  segmentHeaderCopy: { flex: 1, alignItems: 'flex-start', gap: 2 },
  segmentTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  segmentPos: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  segmentDetails: { marginTop: 5, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  morphologyFact: { flexBasis: '47%', flexGrow: 1, minHeight: 78, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', gap: 4 },
  grammarLoading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  grammarHero: { borderRadius: 20, minHeight: 104, paddingHorizontal: 18, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  grammarHeroWord: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 38, lineHeight: 56, writingDirection: 'rtl', textAlign: 'center' },
  grammarCard: { borderRadius: 20, paddingHorizontal: 17, paddingVertical: 16, gap: 10 },
  grammarHeadingArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 24, lineHeight: 38, fontWeight: '600', writingDirection: 'rtl', textAlign: 'right' },
  grammarBodyArabic: { fontSize: 18, lineHeight: 34, writingDirection: 'rtl', textAlign: 'right' },
  grammarMoreButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' },
  grammarMoreText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  grammarEmptyMessage: { paddingHorizontal: 2, fontSize: 14, lineHeight: 21 },
  grammarDisclosure: { direction: 'ltr', minHeight: 64, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 9 },
  grammarDisclosureRow: { direction: 'ltr', flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  grammarDisclosureTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  grammarPassageList: { gap: 12 },
  grammarGuideRow: { minHeight: 54, paddingHorizontal: 13, paddingVertical: 7 },
  grammarGuideLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  grammarInfoIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  noticeCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  inlineAnalysisState: { minHeight: 150, borderWidth: 1, borderRadius: 18, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centeredState: { flex: 1, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  stateMessage: { maxWidth: 420, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, marginTop: 5, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
});
