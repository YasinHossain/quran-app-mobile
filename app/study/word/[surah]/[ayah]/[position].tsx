import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Info,
  RotateCw,
  Share2,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { WordSegmentsCard } from '@/components/word-study/WordSegmentsCard';
import { AyahContextSelector } from '@/components/word-study/full-study/AyahContextSelector';
import { OccurrenceExplorer } from '@/components/word-study/full-study/OccurrenceExplorer';
import { DictionarySection } from '@/components/word-study/full-study/DictionarySection';
import { findSelectedWordGrammarPassages } from '@/components/word-study/full-study/grammarStudyModel';
import { buildOccurrenceReaderParams } from '@/components/word-study/full-study/occurrenceExplorerModel';
import {
  buildWordStudyShareMessage,
  getLemmaText,
  getMorphologyDetails,
  getPrimaryPosText,
  getRootText,
  getStudySources,
  type MorphologyDetail,
  type StudySourcePresentation,
} from '@/components/word-study/full-study/wordStudyScreenModel';
import { describeMissingReason, getPosLabel, getPrimaryGloss } from '@/components/word-study/wordQuickSheetModel';
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
  type WordStudyLocation,
} from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';

type Palette = (typeof Colors)['light'];
type StudyTab = 'overview' | 'morphology' | 'grammar' | 'occurrences' | 'dictionary';
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; words: readonly WordAnalysis[] }
  | { status: 'error'; message: string };
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
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { chapters } = useChaptersContext();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<StudyTab>('overview');
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [grammarLoadState, setGrammarLoadState] = React.useState<GrammarLoadState>({
    status: 'idle',
  });
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollOffsetRef = React.useRef(0);
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
      .catch(() => {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            message: 'Word analysis could not be loaded from the offline study pack.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location?.verseKey, retryNonce]);

  React.useEffect(() => {
    if (tab !== 'grammar' || !location) return;
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
  }, [location?.verseKey, tab]);

  const words = loadState.status === 'ready' ? loadState.words : [];
  const selected = location
    ? words.find((word) => word.location.wordPosition === location.wordPosition)
    : undefined;
  const selectPosition = React.useCallback(
    (position: number) => router.setParams({ position: String(position) }),
    [router]
  );

  const handleShare = React.useCallback(() => {
    if (!selected) return;
    void Share.share({ message: buildWordStudyShareMessage(selected, surahName) });
  }, [selected, surahName]);

  const handleOpenOccurrenceInReader = React.useCallback((occurrence: WordOccurrence) => {
    restoreAfterReaderRef.current = true;
    router.push(buildOccurrenceReaderParams(occurrence) as never);
  }, [router]);

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

      {loadState.status === 'loading' ? (
        <CenteredState palette={palette} loading title="Loading this ayah" message="Reading the installed Word Study pack…" />
      ) : loadState.status === 'error' ? (
        <CenteredState
          palette={palette}
          title="Couldn’t open Word Study"
          message={loadState.message}
          actionLabel={location ? 'Retry' : undefined}
          onAction={location ? () => setRetryNonce((value) => value + 1) : undefined}
        />
      ) : !selected ? (
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
          <AyahContextSelector
            words={words}
            selectedPosition={selected.location.wordPosition}
            onSelect={selectPosition}
          />
          <ScrollView
            horizontal
            accessibilityRole="tablist"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabs, { backgroundColor: palette.interactive }]}
          >
            <TabButton label="Overview" selected={tab === 'overview'} onPress={() => setTab('overview')} palette={palette} />
            <TabButton label="Morphology" selected={tab === 'morphology'} onPress={() => setTab('morphology')} palette={palette} />
            <TabButton label="Grammar" selected={tab === 'grammar'} onPress={() => setTab('grammar')} palette={palette} />
            <TabButton label="Occurrences" selected={tab === 'occurrences'} onPress={() => setTab('occurrences')} palette={palette} />
            <TabButton label="Dictionary" selected={tab === 'dictionary'} onPress={() => setTab('dictionary')} palette={palette} />
          </ScrollView>
          {tab === 'overview' ? (
            <OverviewSection analysis={selected} palette={palette} />
          ) : tab === 'morphology' ? (
            <MorphologySection analysis={selected} palette={palette} />
          ) : tab === 'grammar' ? (
            <GrammarSection
              analysis={selected}
              grammarLoadState={grammarLoadState}
              palette={palette}
            />
          ) : tab === 'occurrences' ? (
            <OccurrenceExplorer
              analysis={selected}
              palette={palette}
              onOpenReader={handleOpenOccurrenceInReader}
            />
          ) : (
            <DictionarySection analysis={selected} palette={palette} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TabButton({ label, selected, onPress, palette }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  palette: Palette;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.tab,
        { backgroundColor: selected ? palette.surface : 'transparent' },
      ]}
    >
      <Text style={[styles.tabText, { color: selected ? palette.tint : palette.muted }]}>{label}</Text>
    </Pressable>
  );
}

function OverviewSection({ analysis, palette }: { analysis: WordAnalysis; palette: Palette }): React.JSX.Element {
  const sources = getStudySources(analysis.sourceReferences);
  return (
    <View style={styles.section}>
      <WordSegmentsCard analysis={analysis} />
      <View style={styles.glossBlock}>
        <Text style={[styles.eyebrow, { color: palette.muted }]}>CONTEXTUAL GLOSS</Text>
        <Text style={[styles.gloss, { color: palette.text }]}>{getPrimaryGloss(analysis)}</Text>
        <Text style={[styles.explanation, { color: palette.muted }]}>Meaning of this occurrence in its ayah context.</Text>
      </View>
      <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
        <StudyFact
          label="Surface form"
          arabicTerm="الصيغة الظاهرة"
          value={analysis.surfaceUthmani}
          explanation="The exact spelling that appears at this location."
          palette={palette}
          arabic
        />
        <StudyFact
          label="Lemma"
          arabicTerm="الصيغة المعجمية"
          value={getLemmaText(analysis)}
          explanation="The citation form used to group this word with its inflected forms."
          palette={palette}
          arabic={analysis.lemma.status === 'available'}
        />
        <StudyFact
          label="Root"
          arabicTerm="الجذر"
          value={getRootText(analysis)}
          explanation="The consonantal family this word belongs to, when a root applies."
          palette={palette}
          arabic={analysis.root.status === 'available'}
        />
        <StudyFact
          label="Part of speech"
          arabicTerm="نوع الكلمة"
          value={getPrimaryPosText(analysis)}
          explanation="The main grammatical category recorded for this word."
          palette={palette}
          last
        />
      </View>
      <AboutAnalysis sources={sources} palette={palette} />
    </View>
  );
}

function MorphologySection({ analysis, palette }: { analysis: WordAnalysis; palette: Palette }): React.JSX.Element {
  const wholeWordDetails = analysis.morphology.status === 'available'
    ? getMorphologyDetails(analysis.morphology.value)
    : [];
  const segments = analysis.morphemes.status === 'available' ? analysis.morphemes.value : [];
  return (
    <View style={styles.section}>
      <WordSegmentsCard analysis={analysis} compact />
      <SectionHeading
        title="How this word is built"
        subtitle="Each attached segment is labeled by role and part of speech; color is only a visual aid."
        palette={palette}
      />
      {segments.length ? segments.map((segment) => (
        <SegmentCard key={`${segment.locationKey}:${segment.segmentIndex}`} segment={segment} palette={palette} />
      )) : (
        <NoticeCard message={analysis.morphemes.status === 'available' ? 'No segments are recorded for this word.' : describeMissingReason(analysis.morphemes.reason)} palette={palette} />
      )}
      {wholeWordDetails.length ? (
        <>
          <SectionHeading
            title="Features at this location"
            subtitle="Only features explicitly recorded by the installed source are shown."
            palette={palette}
          />
          <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
            {wholeWordDetails.map((detail, index) => (
              <MorphologyRow key={detail.key} detail={detail} palette={palette} last={index === wholeWordDetails.length - 1} />
            ))}
          </View>
        </>
      ) : (
        <NoticeCard message="No additional whole-word inflection is recorded or applicable here." palette={palette} />
      )}
      <View style={[styles.scopeNotice, { backgroundColor: palette.interactive }]}> 
        <Info color={palette.tint} size={18} strokeWidth={2.2} />
        <Text style={[styles.scopeNoticeText, { color: palette.muted }]}> 
          Morphology describes how this word is formed. Open Grammar for its Arabic i‘rab in the ayah.
        </Text>
      </View>
    </View>
  );
}

function GrammarSection({
  analysis,
  grammarLoadState,
  palette,
}: {
  analysis: WordAnalysis;
  grammarLoadState: GrammarLoadState;
  palette: Palette;
}): React.JSX.Element {
  const [showFullAyah, setShowFullAyah] = React.useState(false);
  const [expandedPassages, setExpandedPassages] = React.useState<ReadonlySet<number>>(new Set());

  React.useEffect(() => {
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
  const selectedPassages = findSelectedWordGrammarPassages(grammar, analysis);
  const selectedSequences = new Set(selectedPassages.map((passage) => passage.sequence));
  const remainingPassages = grammar.passages.filter(
    (passage) => !selectedSequences.has(passage.sequence)
  );
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
      <View style={[styles.grammarHero, { backgroundColor: palette.interactive }]}>
        <Text style={[styles.eyebrow, { color: palette.tint }]}>إِعْرَابٌ مُخْتَصَرٌ</Text>
        <Text style={[styles.grammarHeroWord, { color: palette.text }]}>
          {analysis.surfaceUthmani}
        </Text>
        <Text style={[styles.grammarHeroCaption, { color: palette.muted }]}>
          التحليل النحوي للكلمة في سياق الآية
        </Text>
      </View>

      <SectionHeading
        title="Selected word"
        subtitle="The source groups closely related words when their grammatical explanation belongs together."
        palette={palette}
      />
      {selectedPassages.length ? (
        selectedPassages.map((passage) => (
          <GrammarPassageCard
            key={passage.sequence}
            passage={passage}
            expanded={expandedPassages.has(passage.sequence)}
            onToggle={() => togglePassage(passage.sequence)}
            palette={palette}
            emphasized
          />
        ))
      ) : (
        <NoticeCard
          message="No separate passage was matched to this word. Its analysis is included in the complete ayah grammar below."
          palette={palette}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showFullAyah }}
        onPress={() => setShowFullAyah((value) => !value)}
        style={[styles.grammarDisclosure, { borderColor: palette.border, backgroundColor: palette.surface }]}
      >
        <View style={styles.grammarDisclosureCopy}>
          <Text style={[styles.grammarDisclosureTitle, { color: palette.text }]}>
            Complete ayah grammar
          </Text>
          <Text style={[styles.explanation, { color: palette.muted }]}>
            {grammar.passages.length} Arabic analysis sections
          </Text>
        </View>
        <ChevronRight
          color={palette.tint}
          size={20}
          style={{ transform: [{ rotate: showFullAyah ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {showFullAyah ? (
        <View style={styles.grammarPassageList}>
          {remainingPassages.map((passage) => (
            <GrammarPassageCard
              key={passage.sequence}
              passage={passage}
              expanded={expandedPassages.has(passage.sequence)}
              onToggle={() => togglePassage(passage.sequence)}
              palette={palette}
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
}: {
  passage: GrammarPassage;
  expanded: boolean;
  onToggle: () => void;
  palette: Palette;
  emphasized?: boolean;
}): React.JSX.Element {
  const canCollapse = passage.bodyArabic.length > 280;
  return (
    <View
      style={[
        styles.grammarCard,
        {
          borderColor: emphasized ? palette.tint : palette.border,
          backgroundColor: palette.surface,
        },
      ]}
    >
      {passage.headingArabic ? (
        <Text style={[styles.grammarHeadingArabic, { color: palette.text }]}>
          {passage.headingArabic}
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

function SegmentCard({ segment, palette }: { segment: Morpheme; palette: Palette }): React.JSX.Element {
  const details = getMorphologyDetails(segment.features);
  const role = segment.segmentType === 'prefix'
    ? ['Prefix', 'سابقة', 'An attached segment before the stem.']
    : segment.segmentType === 'suffix'
      ? ['Suffix', 'لاحقة', 'An attached ending, often encoding a pronoun or inflection.']
      : segment.segmentType === 'stem'
        ? ['Stem', 'جذع الكلمة', 'The central lexical part of this occurrence.']
        : segment.segmentType === 'infix'
          ? ['Infix', 'مقطع داخلي', 'A segment occurring inside the word form.']
          : ['Whole word', 'الكلمة كاملة', 'The analysis applies to the word as one segment.'];
  return (
    <View style={[styles.segmentCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
      <View style={styles.segmentHeader}>
        <Text style={[styles.segmentArabic, { color: palette.text }]}>{segment.arabic}</Text>
        <View style={styles.segmentHeaderCopy}>
          <Text style={[styles.segmentTitle, { color: palette.text }]}>{role[0]} · {role[1]}</Text>
          <Text style={[styles.segmentPos, { color: palette.tint }]}>{getPosLabel(segment.posCode)} · {segment.posCode}</Text>
        </View>
      </View>
      <Text style={[styles.explanation, { color: palette.muted }]}>{role[2]}</Text>
      {details.length ? (
        <View style={[styles.segmentDetails, { borderTopColor: palette.border }]}> 
          {details.map((detail, index) => (
            <MorphologyRow key={detail.key} detail={detail} palette={palette} last={index === details.length - 1} compact />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MorphologyRow({ detail, palette, last, compact = false }: {
  detail: MorphologyDetail;
  palette: Palette;
  last: boolean;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.morphologyRow, compact && styles.morphologyRowCompact, !last && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}> 
      <Text style={[styles.factLabel, { color: palette.text }]}>{detail.label} · {detail.arabicTerm}</Text>
      <Text style={[styles.factValue, { color: palette.tint }]}>{detail.value}</Text>
      <Text style={[styles.explanation, { color: palette.muted }]}>{detail.explanation}</Text>
    </View>
  );
}

function StudyFact({ label, arabicTerm, value, explanation, palette, arabic = false, last = false }: {
  label: string;
  arabicTerm: string;
  value: string;
  explanation: string;
  palette: Palette;
  arabic?: boolean;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.studyFact, !last && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}> 
      <Text style={[styles.factLabel, { color: palette.muted }]}>{label} · {arabicTerm}</Text>
      <Text style={[styles.factValue, arabic && styles.factValueArabic, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.explanation, { color: palette.muted }]}>{explanation}</Text>
    </View>
  );
}

function AboutAnalysis({ sources, palette }: { sources: readonly StudySourcePresentation[]; palette: Palette }): React.JSX.Element {
  return (
    <View style={[styles.aboutCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
      <View style={styles.aboutHeading}>
        <Info color={palette.tint} size={19} strokeWidth={2.2} />
        <Text style={[styles.aboutTitle, { color: palette.text }]}>About this analysis</Text>
      </View>
      <Text style={[styles.explanation, { color: palette.muted }]}> 
        Source annotations are reproduced from the installed offline pack. Beginner explanations clarify the labels but do not replace expert grammatical review.
      </Text>
      {sources.map((source) => (
        <Pressable
          key={source.key}
          accessibilityRole={source.url ? 'link' : 'text'}
          disabled={!source.url}
          onPress={() => source.url && void Linking.openURL(source.url)}
          style={[styles.sourceBlock, { borderTopColor: palette.border }]}
        >
          <View style={styles.sourceTitleRow}>
            <Text style={[styles.sourceTitle, { color: palette.text }]}>{source.title}</Text>
            {source.url ? <ExternalLink color={palette.tint} size={15} strokeWidth={2.2} /> : null}
          </View>
          <Text style={[styles.sourceVersion, { color: palette.tint }]}>Version {source.version}</Text>
          <Text style={[styles.sourceMeta, { color: palette.muted }]}>Layers: {source.layers.join(', ')}</Text>
          <Text style={[styles.sourceMeta, { color: palette.muted }]}>{source.attribution}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SectionHeading({ title, subtitle, palette }: { title: string; subtitle: string; palette: Palette }): React.JSX.Element {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.explanation, { color: palette.muted }]}>{subtitle}</Text>
    </View>
  );
}

function NoticeCard({ message, palette }: { message: string; palette: Palette }): React.JSX.Element {
  return (
    <View style={[styles.noticeCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
      <Text style={[styles.explanation, { color: palette.muted }]}>{message}</Text>
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
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 14, gap: 16 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 15 },
  tab: { minWidth: 104, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  section: { gap: 16 },
  glossBlock: { gap: 5, paddingHorizontal: 2 },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1 },
  gloss: { fontSize: 20, lineHeight: 29, fontWeight: '600' },
  explanation: { fontSize: 13, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  studyFact: { paddingHorizontal: 16, paddingVertical: 14, gap: 5 },
  factLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  factValue: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  factValueArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 25, lineHeight: 37, writingDirection: 'rtl', textAlign: 'left' },
  aboutCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  aboutHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aboutTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  sourceBlock: { paddingTop: 12, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, gap: 3 },
  sourceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sourceVersion: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  sourceMeta: { fontSize: 11, lineHeight: 17 },
  sectionHeading: { gap: 3, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  segmentCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  segmentHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  segmentArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 30, lineHeight: 44, writingDirection: 'rtl' },
  segmentHeaderCopy: { flex: 1, alignItems: 'flex-start', gap: 2 },
  segmentTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  segmentPos: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  segmentDetails: { marginTop: 5, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  morphologyRow: { paddingHorizontal: 16, paddingVertical: 13, gap: 4 },
  morphologyRowCompact: { paddingHorizontal: 0 },
  scopeNotice: { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  scopeNoticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  grammarLoading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  grammarHero: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 20, alignItems: 'center', gap: 5 },
  grammarHeroWord: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 38, lineHeight: 56, writingDirection: 'rtl', textAlign: 'center' },
  grammarHeroCaption: { fontSize: 14, lineHeight: 23, writingDirection: 'rtl', textAlign: 'center' },
  grammarCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 17, paddingVertical: 16, gap: 10 },
  grammarHeadingArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 24, lineHeight: 38, fontWeight: '600', writingDirection: 'rtl', textAlign: 'right' },
  grammarBodyArabic: { fontSize: 18, lineHeight: 34, writingDirection: 'rtl', textAlign: 'right' },
  grammarMoreButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' },
  grammarMoreText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  grammarDisclosure: { minHeight: 72, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  grammarDisclosureCopy: { flex: 1, gap: 2 },
  grammarDisclosureTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  grammarPassageList: { gap: 12 },
  noticeCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  centeredState: { flex: 1, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  stateMessage: { maxWidth: 420, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, marginTop: 5, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
});
