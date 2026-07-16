import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  RotateCw,
  Share2,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import {
  buildWordStudyShareMessage,
  getAdjacentWordPositions,
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
import { toWordStudyLocation, type Morpheme, type WordAnalysis, type WordStudyLocation } from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';

type Palette = (typeof Colors)['light'];
type StudyTab = 'overview' | 'morphology';
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; words: readonly WordAnalysis[] }
  | { status: 'error'; message: string };

const RIBBON_ITEM_WIDTH = 88;
const RIBBON_ITEM_STEP = 96;

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
  const ribbonRef = React.useRef<FlatList<WordAnalysis>>(null);
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

  const words = loadState.status === 'ready' ? loadState.words : [];
  const selected = location
    ? words.find((word) => word.location.wordPosition === location.wordPosition)
    : undefined;
  const selectedIndex = selected
    ? words.findIndex((word) => word.location.wordPosition === selected.location.wordPosition)
    : -1;

  React.useEffect(() => {
    if (selectedIndex < 0) return;
    requestAnimationFrame(() => {
      ribbonRef.current?.scrollToIndex({ index: selectedIndex, animated: true, viewPosition: 0.5 });
    });
  }, [selectedIndex]);

  const selectPosition = React.useCallback(
    (position: number) => router.setParams({ position: String(position) }),
    [router]
  );

  const handleShare = React.useCallback(() => {
    if (!selected) return;
    void Share.share({ message: buildWordStudyShareMessage(selected, surahName) });
  }, [selected, surahName]);

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
        <>
          <WordRibbon
            words={words}
            selectedPosition={selected.location.wordPosition}
            onSelect={selectPosition}
            palette={palette}
            listRef={ribbonRef}
          />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
            showsVerticalScrollIndicator={false}
          >
            <AdjacentNavigation
              words={words}
              selectedPosition={selected.location.wordPosition}
              onSelect={selectPosition}
              palette={palette}
            />
            <View
              accessibilityRole="tablist"
              style={[styles.tabs, { backgroundColor: palette.interactive }]}
            >
              <TabButton label="Overview" selected={tab === 'overview'} onPress={() => setTab('overview')} palette={palette} />
              <TabButton label="Morphology" selected={tab === 'morphology'} onPress={() => setTab('morphology')} palette={palette} />
            </View>
            {tab === 'overview' ? (
              <OverviewSection analysis={selected} palette={palette} />
            ) : (
              <MorphologySection analysis={selected} palette={palette} />
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function WordRibbon({
  words,
  selectedPosition,
  onSelect,
  palette,
  listRef,
}: {
  words: readonly WordAnalysis[];
  selectedPosition: number;
  onSelect: (position: number) => void;
  palette: Palette;
  listRef: React.RefObject<FlatList<WordAnalysis> | null>;
}): React.JSX.Element {
  return (
    <View style={[styles.ribbonShell, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}> 
      <Text style={[styles.ribbonLabel, { color: palette.muted }]}>AYAH WORDS · SELECT A WORD</Text>
      <FlatList
        ref={listRef}
        horizontal
        inverted
        data={[...words]}
        keyExtractor={(item) => item.location.locationKey}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ribbonContent}
        ItemSeparatorComponent={() => <View style={styles.ribbonSeparator} />}
        getItemLayout={(_, index) => ({ length: RIBBON_ITEM_STEP, offset: RIBBON_ITEM_STEP * index, index })}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, index * RIBBON_ITEM_STEP), animated: true });
        }}
        renderItem={({ item }) => {
          const selected = item.location.wordPosition === selectedPosition;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Word ${item.location.wordPosition}, ${item.surfaceUthmani}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.location.wordPosition)}
              style={[
                styles.ribbonWord,
                {
                  width: RIBBON_ITEM_WIDTH,
                  backgroundColor: selected ? palette.tint : palette.background,
                  borderColor: selected ? palette.tint : palette.border,
                },
              ]}
            >
              <Text style={[styles.ribbonArabic, { color: selected ? palette.onAccent : palette.text }]}> 
                {item.surfaceUthmani}
              </Text>
              <Text style={[styles.ribbonPosition, { color: selected ? palette.onAccent : palette.muted }]}> 
                {item.location.wordPosition}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function AdjacentNavigation({
  words,
  selectedPosition,
  onSelect,
  palette,
}: {
  words: readonly WordAnalysis[];
  selectedPosition: number;
  onSelect: (position: number) => void;
  palette: Palette;
}): React.JSX.Element {
  const adjacent = getAdjacentWordPositions(words, selectedPosition);
  return (
    <View style={styles.adjacentRow}>
      <AdjacentButton
        label="Previous word"
        icon={<ChevronLeft color={adjacent.previous ? palette.tint : palette.muted} size={18} />}
        position={adjacent.previous}
        onSelect={onSelect}
        palette={palette}
      />
      <Text style={[styles.positionCounter, { color: palette.muted }]}>Word {selectedPosition} of {words.length}</Text>
      <AdjacentButton
        label="Next word"
        icon={<ChevronRight color={adjacent.next ? palette.tint : palette.muted} size={18} />}
        position={adjacent.next}
        onSelect={onSelect}
        palette={palette}
        iconAfter
      />
    </View>
  );
}

function AdjacentButton({ label, icon, position, onSelect, palette, iconAfter = false }: {
  label: string;
  icon: React.ReactNode;
  position?: number;
  onSelect: (position: number) => void;
  palette: Palette;
  iconAfter?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !position }}
      disabled={!position}
      onPress={() => position && onSelect(position)}
      style={[styles.adjacentButton, { opacity: position ? 1 : 0.35 }]}
    >
      {!iconAfter ? icon : null}
      <Text style={[styles.adjacentLabel, { color: position ? palette.tint : palette.muted }]}>{label}</Text>
      {iconAfter ? icon : null}
    </Pressable>
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
          This screen shows structured morphology, not full sentence grammar or prose i‘rab. Those layers require separately licensed, expert-reviewed content.
        </Text>
      </View>
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
  ribbonShell: { paddingTop: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  ribbonLabel: { paddingHorizontal: 16, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9 },
  ribbonContent: { paddingHorizontal: 16 },
  ribbonSeparator: { width: 8 },
  ribbonWord: { minHeight: 72, borderRadius: 15, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  ribbonArabic: { fontFamily: 'UthmanicHafs1Ver18', fontSize: 24, lineHeight: 36, writingDirection: 'rtl', textAlign: 'center' },
  ribbonPosition: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 14, gap: 16 },
  adjacentRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  adjacentButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 3 },
  adjacentLabel: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  positionCounter: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 15 },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
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
  noticeCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  centeredState: { flex: 1, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  stateMessage: { maxWidth: 420, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, marginTop: 5, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
});
