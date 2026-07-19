import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Settings } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { AppSearchHeader, ReaderOverlayHeader } from '@/components/navigation/AppHeader';
import { useCollapsibleReaderHeader } from '@/components/navigation/useCollapsibleReaderHeader';
import { useHeaderSearch } from '@/components/navigation/useHeaderSearch';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import { TafsirHtml } from '@/components/tafsir/TafsirHtml';
import {
  TafsirTabPanels,
  TafsirTabs,
  type TafsirTabContentState,
} from '@/components/tafsir/TafsirTabs';
import { IndexScrubber, type IndexScrubberHandle } from '@/components/reader/IndexScrubber';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import type { PanelType } from '@/components/reader/settings/SettingsSidebarContent';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useSurahVerses, type SurahVerse } from '@/hooks/useSurahVerses';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import {
  getOfflineTafsirBatchCached,
  getOfflineTafsirCached,
  getOfflineTafsirSnapshot,
  OFFLINE_TAFSIR_PREFETCH_RADIUS,
} from '@/lib/tafsir/tafsirCache';
import {
  getVerseDetailsCached,
  getVerseDetailsSnapshot,
  peekVersePreview,
} from '@/lib/verse/verseDetailsCache';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import type { Bookmark } from '@/types';

type ApiVerse = {
  verse_key: string;
  text_uthmani?: string;
  translations?: Array<{ resource_id: number; resource_name?: string; text: string }>;
};

type VerseTarget = {
  surahId: number;
  ayahId: number;
};

type PageState = {
  signature: string;
  chapter: SurahHeaderChapter | null;
  verse: ApiVerse | null;
  isLoading: boolean;
  errorMessage: string | null;
  tafsirById: Partial<Record<number, TafsirTabContentState>>;
};

type TranslationItem = { resourceId: number; resourceName?: string; text: string };

const NO_TAFSIR_AVAILABLE_MESSAGE = 'No tafsir is available for this verse.';
let globalLastActiveTafsirTabId: number | undefined;

function SkeletonBar({
  width,
  height = 14,
}: {
  width: number | `${number}%`;
  height?: number;
}): React.JSX.Element {
  return <View className="rounded-full bg-surface dark:bg-surface-dark" style={{ width, height }} />;
}

function VerseCardSkeleton({ verseKey }: { verseKey: string }): React.JSX.Element {
  return (
    <View className="border-b border-border/40 py-4 dark:border-border-dark/30">
      <View className="gap-4">
        <Text className="text-sm font-semibold text-accent dark:text-accent-dark">{verseKey}</Text>
        <View className="h-14 rounded-2xl bg-surface dark:bg-surface-dark" />
        <View className="gap-3">
          <SkeletonBar width="100%" />
          <SkeletonBar width="88%" />
          <SkeletonBar width="74%" />
        </View>
      </View>
    </View>
  );
}

function TafsirLoadingSkeleton({ minHeight }: { minHeight: number }): React.JSX.Element {
  return (
    <View style={{ minHeight }} className="justify-start gap-4 pt-2">
      <View className="gap-3">
        <SkeletonBar width="96%" />
        <SkeletonBar width="92%" />
        <SkeletonBar width="98%" />
        <SkeletonBar width="84%" />
      </View>
      <View className="gap-3">
        <SkeletonBar width="94%" />
        <SkeletonBar width="90%" />
        <SkeletonBar width="97%" />
        <SkeletonBar width="78%" />
      </View>
    </View>
  );
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function getVerseKey(target: VerseTarget): string {
  return `${target.surahId}:${target.ayahId}`;
}

function areSameTarget(a: VerseTarget | null, b: VerseTarget | null): boolean {
  if (!a || !b) return false;
  return a.surahId === b.surahId && a.ayahId === b.ayahId;
}

function getChapterById(chapters: SurahHeaderChapter[], surahId: number): SurahHeaderChapter | null {
  return chapters.find((chapter) => chapter.id === surahId) ?? null;
}

function getAdjacentTargets(
  target: VerseTarget | null,
  chapters: SurahHeaderChapter[]
): { chapter: SurahHeaderChapter | null; prev: VerseTarget | null; next: VerseTarget | null } {
  if (!target) {
    return { chapter: null, prev: null, next: null };
  }

  const currentIndex = chapters.findIndex((chapter) => chapter.id === target.surahId);
  const chapter = currentIndex >= 0 ? chapters[currentIndex] ?? null : null;

  if (!chapter) {
    return { chapter: null, prev: null, next: null };
  }

  const prev =
    target.ayahId > 1
      ? { surahId: target.surahId, ayahId: target.ayahId - 1 }
      : currentIndex > 0
        ? {
            surahId: chapters[currentIndex - 1]!.id,
            ayahId: chapters[currentIndex - 1]!.verses_count,
          }
        : null;

  const next =
    target.ayahId < chapter.verses_count
      ? { surahId: target.surahId, ayahId: target.ayahId + 1 }
      : currentIndex < chapters.length - 1
        ? { surahId: chapters[currentIndex + 1]!.id, ayahId: 1 }
        : null;

  return { chapter, prev, next };
}

function buildAllVerseTargets(chapters: SurahHeaderChapter[]): VerseTarget[] {
  const targets: VerseTarget[] = [];

  for (const chapter of chapters) {
    const verseCount = Number.isFinite(chapter.verses_count) ? Math.trunc(chapter.verses_count) : 0;
    if (verseCount <= 0) continue;

    for (let ayahId = 1; ayahId <= verseCount; ayahId += 1) {
      targets.push({ surahId: chapter.id, ayahId });
    }
  }

  return targets;
}

function buildTranslationItems({
  verse,
  translationIds,
  showTranslationAttribution,
  translationsById,
}: {
  verse: ApiVerse | null;
  translationIds: number[];
  showTranslationAttribution: boolean;
  translationsById: Map<number, { name: string }>;
}): TranslationItem[] {
  const incoming = verse?.translations ?? [];
  if (incoming.length === 0) return [];

  const byResourceId = new Map(incoming.map((translation) => [translation.resource_id, translation]));
  const ordered = translationIds
    .map((id) => {
      const match = byResourceId.get(id);
      const text = typeof match?.text === 'string' ? stripHtml(match.text).trim() : '';
      if (!text) return null;
      const name = typeof match?.resource_name === 'string' ? match.resource_name.trim() : undefined;
      const base = { resourceId: id, text };
      return name ? { ...base, resourceName: name } : base;
    })
    .filter((item): item is TranslationItem => item !== null);

  const base = ordered.length
    ? ordered
    : incoming
        .map((translation) => {
          const text = stripHtml(translation.text ?? '').trim();
          if (!text) return null;
          const name =
            typeof translation.resource_name === 'string' ? translation.resource_name.trim() : undefined;
          const item = { resourceId: translation.resource_id, text };
          return name ? { ...item, resourceName: name } : item;
        })
        .filter((item): item is TranslationItem => item !== null);

  if (!showTranslationAttribution) return base;

  return base.map((item) => {
    if (item.resourceName) return item;
    const fallbackName = translationsById.get(item.resourceId)?.name ?? `Translation ${item.resourceId}`;
    return { ...item, resourceName: fallbackName };
  });
}

function normalizePositiveIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const rawId of ids) {
    if (typeof rawId !== 'number' || !Number.isFinite(rawId)) continue;
    const id = Math.trunc(rawId);
    if (id <= 0 || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function buildSortedIdKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',');
}

function hasLoadedTafsirState(state: TafsirTabContentState | undefined): boolean {
  if (!state) return false;
  return !state.isLoading && (state.html.trim().length > 0 || state.error !== null);
}

function buildTafsirStateFromHtml(html: string | null): TafsirTabContentState {
  if (html === null) {
    return {
      html: '',
      isLoading: false,
      error: NO_TAFSIR_AVAILABLE_MESSAGE,
    };
  }

  if (!html.trim()) {
    return {
      html: '',
      isLoading: false,
      error: NO_TAFSIR_AVAILABLE_MESSAGE,
    };
  }

  return { html, isLoading: false, error: null };
}

function buildPendingTafsirStates(
  tafsirIds: number[],
  existing: Partial<Record<number, TafsirTabContentState>>,
  loadingIds: number[]
): Partial<Record<number, TafsirTabContentState>> {
  const loadingIdSet = new Set(loadingIds);
  const nextState: Partial<Record<number, TafsirTabContentState>> = {};

  for (const tafsirId of tafsirIds) {
    const previousState = existing[tafsirId];

    if (!loadingIdSet.has(tafsirId)) {
      if (previousState) {
        nextState[tafsirId] = previousState;
      }
      continue;
    }

    if (hasLoadedTafsirState(previousState)) {
      nextState[tafsirId] = previousState;
      continue;
    }

    nextState[tafsirId] = {
      html: previousState?.html ?? '',
      isLoading: true,
      error: null,
    };
  }

  return nextState;
}

function buildOfflineTafsirStates(
  verseKey: string,
  tafsirIds: number[],
  existing: Partial<Record<number, TafsirTabContentState>> = {}
): Partial<Record<number, TafsirTabContentState>> {
  const nextState: Partial<Record<number, TafsirTabContentState>> = { ...existing };

  for (const tafsirId of tafsirIds) {
    if (hasLoadedTafsirState(nextState[tafsirId])) continue;

    const html = getOfflineTafsirSnapshot(verseKey, tafsirId);
    nextState[tafsirId] = buildTafsirStateFromHtml(html);
  }

  return nextState;
}

function hasTranslations(verse: ApiVerse | null | undefined, translationIds: number[]): boolean {
  if (!verse) return false;
  const translations = verse.translations ?? [];
  return translationIds.every((id) =>
    translations.some((t) => t.resource_id === id)
  );
}

function hasRenderableVerseBody(verse: ApiVerse | null | undefined): boolean {
  if (!verse) return false;
  if (typeof verse.text_uthmani === 'string' && verse.text_uthmani.trim().length > 0) {
    return true;
  }

  return (verse.translations ?? []).some((translation) => {
    const text = typeof translation?.text === 'string' ? stripHtml(translation.text).trim() : '';
    return text.length > 0;
  });
}

function getVerseCompletenessScore(
  verse: ApiVerse | null | undefined,
  translationIds: number[]
): number {
  if (!verse) return -1;

  let score = 0;
  if (typeof verse.verse_key === 'string' && verse.verse_key.trim().length > 0) score += 1;
  if (hasRenderableVerseBody(verse)) score += 10;
  if (hasTranslations(verse, translationIds)) score += 20;
  return score;
}

function selectBestVerse(
  translationIds: number[],
  ...candidates: Array<ApiVerse | null | undefined>
): ApiVerse | null {
  let bestVerse: ApiVerse | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = getVerseCompletenessScore(candidate, translationIds);
    if (score > bestScore) {
      bestVerse = candidate ?? null;
      bestScore = score;
    }
  }

  return bestVerse;
}

function buildOfflineFirstPageState(params: {
  target: VerseTarget;
  chapters: SurahHeaderChapter[];
  pageSignature: string;
  translationIds: number[];
  tafsirIds: number[];
  existing?: PageState;
}): PageState {
  const verseKey = getVerseKey(params.target);
  const existingMatchesSignature = params.existing?.signature === params.pageSignature;
  const existingTafsirById =
    existingMatchesSignature ? params.existing?.tafsirById ?? {} : {};

  // CRITICAL: Always reuse the existing verse (even on signature mismatch/hydration lag)
  // to prevent the verse card from disappearing/flickering. Wiping it causes layout shifts.
  const verse =
    selectBestVerse(
      params.translationIds,
      getVerseDetailsSnapshot(verseKey, params.translationIds),
      params.existing?.verse,
      peekVersePreview(verseKey)
    );
  const tafsirById = buildOfflineTafsirStates(verseKey, params.tafsirIds, existingTafsirById);

  return {
    signature: params.pageSignature,
    chapter:
      params.existing?.chapter ??
      getChapterById(params.chapters, params.target.surahId),
    verse,
    isLoading: !hasRenderableVerseBody(verse),
    errorMessage: params.existing?.errorMessage ?? null,
    tafsirById,
  };
}

type TafsirPageProps = {
  item: VerseTarget;
  pageWidth: number;
  viewportHeight: number;
  insets: ReturnType<typeof useSafeAreaInsets>;
  pageSignature: string;
  pageStateByKey: Record<string, PageState>;
  chapters: SurahHeaderChapter[];
  currentSurahId: number | undefined;
  showTranslationAttribution: boolean;
  translationsById: Map<number, { name: string }>;
  translationIds: number[];
  currentSurahVerseErrorMessage: string | null;
  isCurrentSurahVersesLoading: boolean;
  getCurrentSurahVerseByNumber: (ayahId: number) => SurahVerse | undefined;
  settings: any;
  verseRenderSignal: number;
  openVerseActions: (params: {
    title: string;
    surahId: number;
    verseKey: string;
    arabicText: string;
    translationTexts: string[];
  }) => void;
  pageScrollRefsRef: React.MutableRefObject<Record<string, ScrollView | null>>;
  pageScrollOffsetsRef: React.MutableRefObject<Record<string, number>>;
  readerHeader: ReturnType<typeof useCollapsibleReaderHeader>;
  tafsirSkeletonMinHeight: number;
  tafsirIds: number[];
  activeTafsirId: number | undefined;
  activeTafsirName: string;
  setActiveTafsirTabId: (id: number) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setSettingsInitialPanel: (panel: PanelType | undefined) => void;
  setIsPagerScrollEnabled: (enabled: boolean) => void;
  setIsVerticalScrollEnabled: (enabled: boolean) => void;
  isVerticalScrollEnabled: boolean;
};

function TafsirPage({
  item,
  pageWidth,
  viewportHeight,
  insets,
  pageSignature,
  pageStateByKey,
  chapters,
  currentSurahId,
  showTranslationAttribution,
  translationsById,
  translationIds,
  currentSurahVerseErrorMessage,
  isCurrentSurahVersesLoading,
  getCurrentSurahVerseByNumber,
  settings,
  verseRenderSignal,
  openVerseActions,
  pageScrollRefsRef,
  pageScrollOffsetsRef,
  readerHeader,
  tafsirSkeletonMinHeight,
  tafsirIds,
  activeTafsirId,
  activeTafsirName,
  setActiveTafsirTabId,
  setIsSettingsOpen,
  setSettingsInitialPanel,
  setIsPagerScrollEnabled,
  setIsVerticalScrollEnabled,
  isVerticalScrollEnabled,
}: TafsirPageProps): React.JSX.Element {
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const [aboveHeight, setAboveHeight] = React.useState(0);
  const [tabsHeight, setTabsHeight] = React.useState(58);
  const [isStuck, setIsStuck] = React.useState(false);
  const { resolvedTheme } = useAppTheme();

  const scrubberRef = React.useRef<IndexScrubberHandle | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);
  const [scrollViewHeight, setScrollViewHeight] = React.useState(0);
  const [currentScrubIndex, setCurrentScrubIndex] = React.useState(1);
  const isScrubbingRef = React.useRef(false);
  const maxScrollOffset = Math.max(0, contentHeight - scrollViewHeight);

  const handleAboveContentLayout = React.useCallback((event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height > 0) {
      setAboveHeight(height);
    }
  }, []);

  const handleTabsHeightLayout = React.useCallback((event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height > 0) setTabsHeight(height);
  }, []);

  const verseKey = getVerseKey(item);
  const storedPageState = pageStateByKey[verseKey];
  const pageState =
    storedPageState?.signature === pageSignature
      ? storedPageState
      : {
          signature: pageSignature,
          chapter: getChapterById(chapters, item.surahId),
          verse: peekVersePreview(verseKey),
          isLoading: true,
          errorMessage: null,
          tafsirById: {},
        };
  const pageTitle = pageState.chapter?.name_simple ?? `Surah ${item.surahId}`;
  const linkedSurahVerse =
    item.surahId === currentSurahId ? getCurrentSurahVerseByNumber(item.ayahId) : undefined;
  const linkedTranslationItems = linkedSurahVerse
    ? (showTranslationAttribution
        ? (linkedSurahVerse.translationItems ?? []).map((translation: any) => {
            if (translation.resourceName) return translation;
            const fallbackName =
              typeof translation.resourceId === 'number'
                ? translationsById.get(translation.resourceId)?.name ??
                  `Translation ${translation.resourceId}`
                : undefined;
            return { ...translation, resourceName: fallbackName };
          })
        : linkedSurahVerse.translationItems ?? [])
    : [];
  const pageStateTranslationItems = buildTranslationItems({
    verse: pageState.verse,
    translationIds,
    showTranslationAttribution,
    translationsById,
  });
  const translationItems = linkedTranslationItems.length
    ? linkedTranslationItems
    : pageStateTranslationItems;
  const translationTexts = translationItems.map((translation) => translation.text);
  const displayVerseKey = linkedSurahVerse?.verse_key ?? pageState.verse?.verse_key ?? verseKey;
  const linkedArabicText =
    typeof linkedSurahVerse?.text_uthmani === 'string' ? linkedSurahVerse.text_uthmani.trim() : '';
  const pageStateArabicText =
    typeof pageState.verse?.text_uthmani === 'string' ? pageState.verse.text_uthmani.trim() : '';
  const displayArabicText = linkedArabicText || pageStateArabicText;
  const hasDisplayVerseBody = displayArabicText.length > 0 || translationItems.length > 0;
  const verseErrorMessage =
    item.surahId === currentSurahId
      ? !hasDisplayVerseBody
        ? currentSurahVerseErrorMessage ?? pageState.errorMessage
        : null
      : pageState.errorMessage;
  const showVerseSkeleton =
    item.surahId === currentSurahId
      ? !hasDisplayVerseBody && (isCurrentSurahVersesLoading || pageState.isLoading)
      : !hasDisplayVerseBody && pageState.isLoading;
  const currentTafsirState =
    typeof activeTafsirId === 'number' ? pageState.tafsirById[activeTafsirId] : undefined;
  const isMultiTafsir = tafsirIds.length > 1;

  const overlap = React.useMemo(
    () => Math.max(0, readerHeader.headerHeight - insets.top),
    [readerHeader.headerHeight, insets.top]
  );

  const paddingTop = React.useMemo(
    () => Math.max(0, readerHeader.headerHeight - insets.top),
    [readerHeader.headerHeight, insets.top]
  );

  const stickyThreshold = React.useMemo(() => {
    return aboveHeight + paddingTop;
  }, [aboveHeight, paddingTop]);

  // Minimum height of the tafsir content panel — fills from the sticky tab bar to the
  // bottom of the screen. Acts like a page: even a short tafsir occupies the full space.
  //
  // tabsHeight is measured live via onLayout so it's pixel-perfect on every device.
  //   16px  = pt-4 padding at top of TafsirTabPanels' outer wrapper
  //    8px  = sub-pixel / border rounding correction (empirically tuned)
  //   28px  = paddingBottom of the ScrollView contentContainerStyle
  const tafsirPageMinHeight = React.useMemo(
    () => Math.max(0, viewportHeight - tabsHeight - 16 - 24 - insets.bottom - 28),
    [viewportHeight, tabsHeight, insets.bottom]
  );

  const absoluteOpacity = React.useMemo(() => {
    return scrollY.interpolate({
      inputRange: [Math.max(0, stickyThreshold - 1), Math.max(1, stickyThreshold)],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [stickyThreshold, scrollY]);

  const translateY = React.useMemo(() => {
    return readerHeader.hiddenProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [Math.max(0, overlap - 1.5), 0],
    });
  }, [readerHeader.hiddenProgress, overlap]);
  const lastActiveTafsirIdRef = React.useRef(activeTafsirId);

  React.useEffect(() => {
    if (
      lastActiveTafsirIdRef.current !== undefined &&
      activeTafsirId !== undefined &&
      lastActiveTafsirIdRef.current !== activeTafsirId
    ) {
      const currentScrollOffset = pageScrollOffsetsRef.current[verseKey] ?? 0;
      const targetThreshold = aboveHeight + paddingTop;

      let targetOffset: number;
      if (currentScrollOffset > targetThreshold) {
        // If we are scrolled past the threshold (tab bar stuck at top),
        // we reset the scroll offset of the new tafsir to the beginning of its text,
        // which is exactly at targetThreshold.
        targetOffset = targetThreshold;
      } else {
        // If the Verse Card is still visible, we don't scroll at all,
        // which leaves the Verse Card and tabs in place, and the new tafsir text
        // starts at the beginning naturally.
        targetOffset = currentScrollOffset;
      }

      if (currentScrollOffset !== targetOffset) {
        const ref = pageScrollRefsRef.current[verseKey];
        if (ref) {
          setTimeout(() => {
            ref.scrollTo({ y: targetOffset, animated: false });
          }, 50);
        }
      }
    }
    lastActiveTafsirIdRef.current = activeTafsirId;
  }, [activeTafsirId, aboveHeight, paddingTop, verseKey, pageScrollRefsRef, pageScrollOffsetsRef]);


  const handleActiveTafsirChange = React.useCallback(
    (id: number) => {
      setActiveTafsirTabId(id);
      readerHeader.suppressScroll(1000);
    },
    [setActiveTafsirTabId, readerHeader]
  );

  const handleOpenSettings = React.useCallback(() => {
    setSettingsInitialPanel('tafsir');
    setIsSettingsOpen(true);
  }, [setIsSettingsOpen, setSettingsInitialPanel]);

  const handleTabsDragStart = React.useCallback(() => {
    setIsPagerScrollEnabled(false);
    setIsVerticalScrollEnabled(false);
  }, [setIsPagerScrollEnabled, setIsVerticalScrollEnabled]);

  const handleTabsDragEnd = React.useCallback(() => {
    setIsPagerScrollEnabled(true);
    setIsVerticalScrollEnabled(true);
  }, [setIsPagerScrollEnabled, setIsVerticalScrollEnabled]);

  const handleHeaderTouchStart = React.useCallback(() => {
    // Pure ref mutation — no setState, so no re-render that would cancel the tap.
    readerHeader.suppressScroll(1200);
  }, [readerHeader]);

  const handleScrubToIndex = React.useCallback(
    (index: number, options?: { isFinal?: boolean }) => {
      const maxOffset = contentHeight - scrollViewHeight;
      if (maxOffset <= 0) return;
      const targetOffset = ((index - 1) / 99) * maxOffset;

      const ref = pageScrollRefsRef.current[verseKey];
      if (ref) {
        ref.scrollTo({ y: targetOffset, animated: false });
      }

      if (options?.isFinal) {
        setCurrentScrubIndex(index);
      }
    },
    [contentHeight, scrollViewHeight, verseKey, pageScrollRefsRef]
  );

  const handleScrubStateChange = React.useCallback(
    (isScrubbing: boolean) => {
      isScrubbingRef.current = isScrubbing;
      setIsPagerScrollEnabled(!isScrubbing);
    },
    [setIsPagerScrollEnabled]
  );

  return (
    <View style={{ width: pageWidth }}>
      <Animated.ScrollView
        key={`${verseKey}-${pageSignature}`}
        ref={(ref) => {
          pageScrollRefsRef.current[verseKey] = ref as any;
        }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={(_w, h) => {
          setContentHeight(h);
        }}
        onLayout={(event) => {
          setScrollViewHeight(event.nativeEvent.layout.height);
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop,
          paddingBottom: 28,
          minHeight: Math.max(1, viewportHeight - 120),
        }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        nestedScrollEnabled
        scrollEnabled={isVerticalScrollEnabled}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const y = event.nativeEvent.contentOffset.y;
              pageScrollOffsetsRef.current[verseKey] = y;
              readerHeader.handleScroll(event);

              const stuck = y >= stickyThreshold;
              if (stuck !== isStuck) {
                setIsStuck(stuck);
              }

              // Update scrollbar scrubber position
              const maxOffset = contentHeight - scrollViewHeight;
              if (!isScrubbingRef.current && maxOffset > 0) {
                const percentage = Math.round((y / maxOffset) * 99) + 1;
                const clamped = Math.max(1, Math.min(100, percentage));
                setCurrentScrubIndex((prev) => (prev === clamped ? prev : clamped));
              }

              // Show scrubber temporarily
              scrubberRef.current?.show();
            },
          }
        )}
        scrollEventThrottle={16}
      >
        <View onLayout={handleAboveContentLayout}>
          <View>
            {verseErrorMessage ? (
              <Text className="text-sm text-error dark:text-error-dark">{verseErrorMessage}</Text>
            ) : null}
          </View>

          <View className={verseErrorMessage ? 'mt-4' : ''} collapsable={false}>
            {hasDisplayVerseBody ? (
              <VerseCard
                verseKey={displayVerseKey}
                arabicText={displayArabicText}
                translationTexts={translationTexts}
                translationItems={translationItems}
                showTranslationAttribution={showTranslationAttribution}
                arabicFontSize={settings.arabicFontSize}
                arabicFontFace={settings.arabicFontFace}
                translationFontSize={settings.translationFontSize}
                showByWords={settings.showByWords}
                renderSignal={verseRenderSignal}
                onOpenActions={() =>
                  openVerseActions({
                    title: pageTitle,
                    surahId: item.surahId,
                    verseKey: displayVerseKey,
                    arabicText: displayArabicText,
                    translationTexts,
                  })
                }
              />
            ) : showVerseSkeleton ? (
              <VerseCardSkeleton verseKey={verseKey} />
            ) : (
              <Text className="text-sm text-muted dark:text-muted-dark">Verse not found.</Text>
            )}
          </View>
        </View>

        <View
          collapsable={false}
          onLayout={handleTabsHeightLayout}
          className={isMultiTafsir ? 'bg-background dark:bg-background-dark' : ''}
          style={
            isMultiTafsir
              ? {
                  elevation: 0,
                  marginHorizontal: -16,
                  zIndex: 12,
                }
              : undefined
          }
        >
          {isMultiTafsir ? (
            <TafsirTabs
              tafsirIds={tafsirIds}
              activeTafsirId={activeTafsirId}
              onActiveTafsirChange={handleActiveTafsirChange}
              onAddTafsir={handleOpenSettings}
              onTabsDragStart={handleTabsDragStart}
              onTabsDragEnd={handleTabsDragEnd}
            />
          ) : null}
        </View>

        <View>
          {isMultiTafsir ? (
            <TafsirTabPanels
              verseKey={verseKey}
              tafsirIds={tafsirIds}
              activeTafsirId={activeTafsirId}
              contentByTafsirId={pageState.tafsirById}
              pageMinHeight={tafsirPageMinHeight}
            />
          ) : tafsirIds.length === 1 ? (
            <View className="mt-4">
              <View className="mb-4 items-center gap-3">
                <Text className="text-center text-lg font-bold text-foreground dark:text-foreground-dark">
                  {activeTafsirName}
                </Text>
                <Pressable
                  onPress={() => {
                    setSettingsInitialPanel('tafsir');
                    setIsSettingsOpen(true);
                  }}
                  className="rounded-lg border border-border bg-surface px-3 py-2 dark:bg-surface-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  accessibilityRole="button"
                  accessibilityLabel="Add tafsir"
                >
                  <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                    Add tafsir
                  </Text>
                </Pressable>
              </View>

              {currentTafsirState?.error ? (
                <Text className="text-sm text-muted dark:text-muted-dark">
                  {currentTafsirState.error}
                </Text>
              ) : (currentTafsirState?.isLoading ?? true) ? (
                <TafsirLoadingSkeleton minHeight={tafsirSkeletonMinHeight} />
              ) : (
                <TafsirHtml
                  html={currentTafsirState?.html ?? ''}
                  fontSize={settings.tafsirFontSize || 18}
                  contentKey={`${verseKey}-${activeTafsirId ?? 'none'}`}
                />
              )}
            </View>
          ) : (
            <View className="mt-4">
              <Text className="text-sm text-muted dark:text-muted-dark">
                Please select a tafsir from the settings panel to view commentary.
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {maxScrollOffset > 0 ? (
        <IndexScrubber
          ref={scrubberRef}
          bottomInset={insets.bottom + 8}
          topInset={paddingTop}
          currentIndex={currentScrubIndex}
          itemCount={100}
          formatLabel={(index) => `${index}%`}
          onScrubStateChange={handleScrubStateChange}
          onScrubToIndex={handleScrubToIndex}
        />
      ) : null}

      {isMultiTafsir ? (
        <Animated.View
          pointerEvents={isStuck ? 'auto' : 'none'}
          className="bg-background dark:bg-background-dark"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            elevation: 0,
            opacity: absoluteOpacity,
          }}
          onTouchStart={handleHeaderTouchStart}
        >
          <Animated.View style={{ transform: [{ translateY }] }}>
            <TafsirTabs
              tafsirIds={tafsirIds}
              activeTafsirId={activeTafsirId}
              onActiveTafsirChange={handleActiveTafsirChange}
              onAddTafsir={handleOpenSettings}
              onTabsDragStart={handleTabsDragStart}
              onTabsDragEnd={handleTabsDragEnd}
              hideTopBorder={false}
            />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function TafsirScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ surahId?: string | string[]; ayahId?: string | string[] }>();
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const pageWidth = React.useMemo(() => Math.max(viewportWidth, 1), [viewportWidth]);
  const tafsirSkeletonMinHeight = React.useMemo(
    () => Math.max(220, Math.round(viewportHeight * 0.42)),
    [viewportHeight]
  );

  const surahIdRaw = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;
  const ayahIdRaw = Array.isArray(params.ayahId) ? params.ayahId[0] : params.ayahId;

  const parsedRouteTarget = React.useMemo<VerseTarget | null>(() => {
    const surahNumber = surahIdRaw ? Number(surahIdRaw) : NaN;
    const ayahNumber = ayahIdRaw ? Number(ayahIdRaw) : NaN;
    if (!Number.isFinite(surahNumber) || surahNumber <= 0) return null;
    if (!Number.isFinite(ayahNumber) || ayahNumber <= 0) return null;
    return { surahId: surahNumber, ayahId: ayahNumber };
  }, [ayahIdRaw, surahIdRaw]);

  const [currentTarget, setCurrentTarget] = React.useState<VerseTarget | null>(parsedRouteTarget);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [settingsInitialPanel, setSettingsInitialPanel] = React.useState<PanelType | undefined>(undefined);
  const [verseRenderSignal, setVerseRenderSignal] = React.useState(0);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );
  const headerSearch = useHeaderSearch({ replace: true });
  const [activeVerse, setActiveVerse] = React.useState<{
    title: string;
    surahId: number;
    verseKey: string;
    arabicText: string;
    translationTexts: string[];
  } | null>(null);
  const [isPagerScrollEnabled, setIsPagerScrollEnabled] = React.useState(true);
  const [isVerticalScrollEnabled, setIsVerticalScrollEnabled] = React.useState(true);

  React.useEffect(() => {
    if (isSettingsOpen) {
      headerSearch.close({ clearQuery: false });
    }
  }, [headerSearch.close, isSettingsOpen]);

  const [prevParsedRouteTarget, setPrevParsedRouteTarget] = React.useState(parsedRouteTarget);

  if (parsedRouteTarget && (!prevParsedRouteTarget || !areSameTarget(parsedRouteTarget, prevParsedRouteTarget))) {
    setPrevParsedRouteTarget(parsedRouteTarget);
    setCurrentTarget(parsedRouteTarget);
  }

  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const readerHeader = useCollapsibleReaderHeader();
  const { settings } = useSettings();
  const audio = useAudioPlayer();
  const { isPinned } = useBookmarks();
  const { chapters } = useChapters();
  const insets = useSafeAreaInsets();

  const translationIds = React.useMemo(() => {
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return normalizePositiveIds(ids);
  }, [settings.translationId, settings.translationIds]);
  const translationIdsKey = React.useMemo(() => translationIds.join(','), [translationIds]);
  const translationRequestKey = React.useMemo(
    () => buildSortedIdKey(translationIds),
    [translationIdsKey]
  );

  const showTranslationAttribution = translationIds.length > 1;
  const { translationsById } = useTranslationResources({
    enabled: showTranslationAttribution,
    language: settings.contentLanguage,
  });

  const tafsirIds = React.useMemo(
    () => normalizePositiveIds(settings.tafsirIds ?? []),
    [settings.tafsirIds]
  );
  const tafsirIdsKey = React.useMemo(() => tafsirIds.join(','), [tafsirIds]);
  const tafsirRequestKey = React.useMemo(() => buildSortedIdKey(tafsirIds), [tafsirIdsKey]);
  const pageSignature = `${translationRequestKey}|${tafsirRequestKey}`;

  const [activeTafsirTabId, setActiveTafsirTabId] = React.useState<number | undefined>(() => {
    if (
      typeof globalLastActiveTafsirTabId === 'number' &&
      tafsirIds.includes(globalLastActiveTafsirTabId)
    ) {
      return globalLastActiveTafsirTabId;
    }

    return typeof tafsirIds[0] === 'number' ? tafsirIds[0] : undefined;
  });

  React.useEffect(() => {
    setActiveTafsirTabId((current) => {
      const candidate = typeof current === 'number' ? current : undefined;
      if (candidate && tafsirIds.includes(candidate)) return candidate;

      if (
        typeof globalLastActiveTafsirTabId === 'number' &&
        tafsirIds.includes(globalLastActiveTafsirTabId)
      ) {
        return globalLastActiveTafsirTabId;
      }

      return typeof tafsirIds[0] === 'number' ? tafsirIds[0] : undefined;
    });
  }, [tafsirIdsKey, tafsirIds]);

  const activeTafsirId = React.useMemo(() => {
    if (typeof activeTafsirTabId === 'number' && tafsirIds.includes(activeTafsirTabId)) {
      return activeTafsirTabId;
    }
    if (
      typeof globalLastActiveTafsirTabId === 'number' &&
      tafsirIds.includes(globalLastActiveTafsirTabId)
    ) {
      return globalLastActiveTafsirTabId;
    }
    return typeof tafsirIds[0] === 'number' ? tafsirIds[0] : undefined;
  }, [activeTafsirTabId, tafsirIds]);

  React.useEffect(() => {
    if (typeof activeTafsirId !== 'number') return;
    globalLastActiveTafsirTabId = activeTafsirId;
    if (activeTafsirId === activeTafsirTabId) return;
    setActiveTafsirTabId(activeTafsirId);
  }, [activeTafsirId, activeTafsirTabId]);

  const lastActiveTafsirIdRef = React.useRef(activeTafsirId);
  React.useEffect(() => {
    if (activeTafsirId !== lastActiveTafsirIdRef.current) {
      lastActiveTafsirIdRef.current = activeTafsirId;
      readerHeader.suppressScroll(800);
    }
  }, [activeTafsirId, readerHeader]);

  React.useEffect(() => {
    setIsPagerScrollEnabled(true);
    readerHeader.resetHeader();
  }, [currentTarget?.ayahId, currentTarget?.surahId, readerHeader.resetHeader]);

  const { tafsirById } = useTafsirResources({ enabled: tafsirIds.length > 0 });
  const activeTafsirName =
    typeof activeTafsirId === 'number'
      ? tafsirById.get(activeTafsirId)?.displayName ?? `Tafsir ${activeTafsirId}`
      : '';

  const currentNavigation = React.useMemo(
    () => getAdjacentTargets(currentTarget, chapters),
    [chapters, currentTarget]
  );
  const allTargets = React.useMemo(() => buildAllVerseTargets(chapters), [chapters]);
  const pagerTargets = React.useMemo(
    () => (allTargets.length > 0 ? allTargets : currentTarget ? [currentTarget] : []),
    [allTargets, currentTarget]
  );
  const targetIndexByKey = React.useMemo(
    () => new Map(pagerTargets.map((target, index) => [getVerseKey(target), index] as const)),
    [pagerTargets]
  );
  const currentTargetIndex = React.useMemo(() => {
    if (!currentTarget) return -1;
    return targetIndexByKey.get(getVerseKey(currentTarget)) ?? -1;
  }, [currentTarget, targetIndexByKey]);
  const currentSurahId = currentTarget?.surahId;
  const currentSurahInitialVerseNumber = React.useMemo(
    () => {
      // Keep this stable inside a surah so horizontal ayah swipes do not reset verse loading.
      return currentTarget?.ayahId;
    },
    [currentSurahId]
  );
  const {
    getVerseByNumber: getCurrentSurahVerseByNumber,
    verseCount: currentSurahVerseCount,
    ensureVerseRangeLoaded: ensureCurrentSurahVerseRangeLoaded,
    pagesSignature: currentSurahPagesSignature,
    isLoading: isCurrentSurahVersesLoading,
    errorMessage: currentSurahVerseErrorMessage,
  } = useSurahVerses({
    chapterNumber: currentSurahId ?? Number.NaN,
    translationIds,
    initialVerseNumber: currentSurahInitialVerseNumber,
    enabled: Boolean(currentSurahId),
  });

  React.useEffect(() => {
    if (!currentTarget || currentTarget.surahId !== currentSurahId) return;

    const startVerse = Math.max(1, currentTarget.ayahId - OFFLINE_TAFSIR_PREFETCH_RADIUS);
    const endBoundary =
      currentSurahVerseCount > 0 ? currentSurahVerseCount : currentTarget.ayahId + OFFLINE_TAFSIR_PREFETCH_RADIUS;
    const endVerse = Math.min(endBoundary, currentTarget.ayahId + OFFLINE_TAFSIR_PREFETCH_RADIUS);
    ensureCurrentSurahVerseRangeLoaded(startVerse, endVerse, 1);
  }, [
    currentSurahId,
    currentSurahVerseCount,
    currentTarget,
    ensureCurrentSurahVerseRangeLoaded,
  ]);

  const openVerseActions = React.useCallback(
    (params: {
      title: string;
      surahId: number;
      verseKey: string;
      arabicText: string;
      translationTexts: string[];
    }) => {
      setActiveVerse(params);
      setIsVerseActionsOpen(true);
    },
    []
  );

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const handlePlayPause = React.useCallback(() => {
    const activeVerseKey = activeVerse?.verseKey;
    if (!activeVerseKey) return;

    if (audio.activeVerseKey === activeVerseKey) {
      audio.togglePlay();
      return;
    }

    audio.playVerse(activeVerseKey);
  }, [activeVerse?.verseKey, audio.activeVerseKey, audio.playVerse, audio.togglePlay]);

  const handleBookmark = React.useCallback(() => {
    if (!activeVerse) return;
    setIsBookmarkModalOpen(true);
  }, [activeVerse]);

  const handleAddToPlan = React.useCallback(() => {
    const activeVerseKey = activeVerse?.verseKey;
    if (!activeVerseKey) return;
    setPlannerVerseSummary({
      verseKey: activeVerseKey,
      ...(Number.isFinite(activeVerse?.surahId) ? { surahId: activeVerse.surahId } : {}),
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const lines = [
      activeVerse.title ? `${activeVerse.title} ${activeVerse.verseKey}` : activeVerse.verseKey,
      '',
      activeVerse.arabicText,
      '',
      ...(activeVerse.translationTexts?.length ? [activeVerse.translationTexts[0]!] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore share failures.
    }
  }, [activeVerse]);

  const activeVersePinned = React.useMemo(() => {
    if (!activeVerse) return false;
    return isPinned(activeVerse.verseKey);
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;
    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(activeVerse.title ? { surahName: activeVerse.title } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse]);

  const [pageStateByKey, setPageStateByKey] = React.useState<Record<string, PageState>>(() => {
    if (!currentTarget) return {};

    return {
      [getVerseKey(currentTarget)]: buildOfflineFirstPageState({
        target: currentTarget,
        chapters,
        pageSignature,
        translationIds,
        tafsirIds,
      }),
    };
  });
  const pageStateByKeyRef = React.useRef(pageStateByKey);
  const inflightRequestsRef = React.useRef<Set<string>>(new Set());
  const generationRef = React.useRef(0);

  const [prevTarget, setPrevTarget] = React.useState(currentTarget);

  if (currentTarget && (!prevTarget || !areSameTarget(currentTarget, prevTarget))) {
    setPrevTarget(currentTarget);
    const targetKey = getVerseKey(currentTarget);
    if (!pageStateByKey[targetKey]) {
      const nextState = buildOfflineFirstPageState({
        target: currentTarget,
        chapters,
        pageSignature,
        translationIds,
        tafsirIds,
      });
      setPageStateByKey((prev) => ({
        ...prev,
        [targetKey]: nextState,
      }));
      pageStateByKeyRef.current = {
        ...pageStateByKey,
        [targetKey]: nextState,
      };
    }
  }

  React.useEffect(() => {
    pageStateByKeyRef.current = pageStateByKey;
  }, [pageStateByKey]);

  React.useEffect(() => {
    generationRef.current += 1;
    inflightRequestsRef.current.clear();
    setPageStateByKey((previous) => {
      if (!currentTarget) return {};
      const targetKey = getVerseKey(currentTarget);
      const existing = previous[targetKey];

      return {
        [targetKey]: buildOfflineFirstPageState({
          target: currentTarget,
          chapters,
          pageSignature,
          translationIds,
          tafsirIds,
          existing,
        }),
      };
    });
    setVerseRenderSignal((value) => value + 1);
  }, [pageSignature]);

  const loadPage = React.useCallback(
    async (target: VerseTarget) => {
      const verseKey = getVerseKey(target);
      const requestKey = `${pageSignature}:${verseKey}`;
      if (inflightRequestsRef.current.has(requestKey)) return;

      const existing = pageStateByKeyRef.current[verseKey];
      const existingMatchesSignature = existing?.signature === pageSignature;
      const previewVerse = peekVersePreview(verseKey);
      const candidateVerse = selectBestVerse(translationIds, existing?.verse, previewVerse);

      // CRITICAL: Verify if candidateVerse has all requested translations. If it is already complete,
      // we can mark hasVerseReady = true, bypassing redundant network queries and layout flickers.
      const hasVerseReady =
        candidateVerse !== null &&
        hasRenderableVerseBody(candidateVerse) &&
        hasTranslations(candidateVerse, translationIds);
      const hasTafsirReady =
        existingMatchesSignature &&
        tafsirIds.every((tafsirId) => hasLoadedTafsirState(existing.tafsirById[tafsirId]));

      if (hasVerseReady && (tafsirIds.length === 0 || hasTafsirReady)) return;

      inflightRequestsRef.current.add(requestKey);
      const generation = generationRef.current;
      const chapter = getChapterById(chapters, target.surahId);
      const tafsirIdsToFetch = tafsirIds.filter((tafsirId) => {
        if (!existingMatchesSignature) return true;
        const tafsirState = existing.tafsirById[tafsirId];
        return !hasLoadedTafsirState(tafsirState) && !tafsirState?.isLoading;
      });

      const versePromise = hasVerseReady
        ? Promise.resolve(candidateVerse)
        : getVerseDetailsCached(verseKey, translationIds);
      const tafsirPromise = Promise.all(
        tafsirIdsToFetch.map(async (tafsirId) => {
          try {
            const html = await getOfflineTafsirCached(verseKey, tafsirId);
            return {
              tafsirId,
              state: buildTafsirStateFromHtml(html),
            };
          } catch {
            return {
              tafsirId,
              state: {
                html: '',
                isLoading: false,
                error: 'Failed to read offline tafsir content.',
              } satisfies TafsirTabContentState,
            };
          }
        })
      );

      setPageStateByKey((previous) => {
        const current = previous[verseKey];
        const currentMatchesSignature = current?.signature === pageSignature;
        const previousTafsirById = currentMatchesSignature ? current.tafsirById : {};

        return {
          ...previous,
          [verseKey]: {
            signature: pageSignature,
            chapter,
            verse: selectBestVerse(translationIds, current?.verse, previewVerse),
            isLoading:
              !hasVerseReady &&
              !hasRenderableVerseBody(selectBestVerse(translationIds, current?.verse, previewVerse)),
            errorMessage: null,
            tafsirById: buildPendingTafsirStates(
              tafsirIds,
              previousTafsirById,
              tafsirIdsToFetch
            ),
          },
        };
      });

      let verse: ApiVerse | null = existingMatchesSignature ? existing.verse : null;
      let verseError: string | null = existingMatchesSignature ? existing.errorMessage : null;

      if (!hasVerseReady) {
        try {
          verse = await versePromise;
          verseError = null;
        } catch (error) {
          verseError = (error as Error).message;
        }
      }

      if (generation !== generationRef.current) {
        inflightRequestsRef.current.delete(requestKey);
        return;
      }

      setPageStateByKey((previous) => {
        const current = previous[verseKey];
        const retainedVerse = selectBestVerse(
          translationIds,
          verse,
          current?.verse,
          previewVerse
        );

        return {
          ...previous,
          [verseKey]: {
            signature: pageSignature,
            chapter,
            verse: retainedVerse,
            isLoading: false,
            errorMessage: hasRenderableVerseBody(retainedVerse) ? null : verseError,
            tafsirById: current?.tafsirById ?? buildPendingTafsirStates(tafsirIds, {}, tafsirIdsToFetch),
          },
        };
      });

      const tafsirResults = await tafsirPromise;

      if (generation !== generationRef.current) {
        inflightRequestsRef.current.delete(requestKey);
        return;
      }

      setPageStateByKey((previous) => {
        const current = previous[verseKey];
        const nextTafsirById: Partial<Record<number, TafsirTabContentState>> = {};
        const resultById = new Map<number, TafsirTabContentState>(
          tafsirResults.map((result) => [result.tafsirId, result.state])
        );

        for (const tafsirId of tafsirIds) {
          const fetchedState = resultById.get(tafsirId);
          if (fetchedState) {
            nextTafsirById[tafsirId] = fetchedState;
            continue;
          }

          const currentState = current?.tafsirById[tafsirId];
          if (currentState) {
            nextTafsirById[tafsirId] = { ...currentState, isLoading: false };
          }
        }

        const retainedVerse = selectBestVerse(
          translationIds,
          verse,
          current?.verse,
          previewVerse
        );

        return {
          ...previous,
          [verseKey]: {
            signature: pageSignature,
            chapter,
            verse: retainedVerse,
            isLoading: false,
            errorMessage: hasRenderableVerseBody(retainedVerse) ? null : verseError,
            tafsirById: nextTafsirById,
          },
        };
      });
      inflightRequestsRef.current.delete(requestKey);
    },
    [chapters, pageSignature, tafsirIds, translationIds]
  );

  const prefetchTargets = React.useMemo(() => {
    if (currentTargetIndex < 0) {
      return currentTarget ? [currentTarget] : [];
    }

    const targets: VerseTarget[] = [];
    for (let offset = 0; offset <= OFFLINE_TAFSIR_PREFETCH_RADIUS; offset += 1) {
      const nextIndex = currentTargetIndex + offset;
      if (nextIndex < pagerTargets.length) {
        const target = pagerTargets[nextIndex];
        if (target) targets.push(target);
      }

      if (offset === 0) continue;

      const previousIndex = currentTargetIndex - offset;
      if (previousIndex >= 0) {
        const target = pagerTargets[previousIndex];
        if (target) targets.push(target);
      }
    }

    return targets;
  }, [currentTarget, currentTargetIndex, pagerTargets]);

  React.useEffect(() => {
    if (prefetchTargets.length === 0) return;
    if (tafsirIds.length === 0) {
      prefetchTargets.forEach((target) => {
        void loadPage(target);
      });
      return;
    }

    const generation = generationRef.current;
    const verseKeys = prefetchTargets.map((target) => getVerseKey(target));

    void (async () => {
      try {
        const prefetchedByTafsirId = await Promise.all(
          tafsirIds.map(async (tafsirId) => ({
            tafsirId,
            htmlByVerseKey: await getOfflineTafsirBatchCached(verseKeys, tafsirId),
          }))
        );

        if (generation !== generationRef.current) return;

        // The batch above warms every selected tafsir in one query each. Page loaders
        // can now resolve tafsir from memory while they prepare verse/translation state.
        prefetchTargets.forEach((target) => {
          void loadPage(target);
        });

        setPageStateByKey((previous) => {
          let didChange = false;
          const nextState = { ...previous };

          for (const target of prefetchTargets) {
            const verseKey = getVerseKey(target);
            const existing = previous[verseKey];
            const existingMatchesSignature = existing?.signature === pageSignature;
            const previewVerse = peekVersePreview(verseKey);
            const nextTafsirById: Partial<Record<number, TafsirTabContentState>> = {
              ...(existingMatchesSignature ? existing?.tafsirById : {}),
            };
            let didChangeForVerse = false;

            for (const prefetched of prefetchedByTafsirId) {
              const currentTafsirState = nextTafsirById[prefetched.tafsirId];
              if (hasLoadedTafsirState(currentTafsirState)) continue;

              const html = prefetched.htmlByVerseKey.get(verseKey) ?? null;
              const nextTafsirState = buildTafsirStateFromHtml(html);

              if (
                currentTafsirState?.html === nextTafsirState.html &&
                currentTafsirState?.isLoading === nextTafsirState.isLoading &&
                currentTafsirState?.error === nextTafsirState.error
              ) {
                continue;
              }

              nextTafsirById[prefetched.tafsirId] = nextTafsirState;
              didChangeForVerse = true;
            }

            if (!didChangeForVerse) continue;

            const existingVerse = selectBestVerse(
              translationIds,
              getVerseDetailsSnapshot(verseKey, translationIds),
              existing?.verse,
              previewVerse
            );

            nextState[verseKey] = {
              signature: pageSignature,
              chapter: existing?.chapter ?? getChapterById(chapters, target.surahId),
              verse: existingVerse,
              isLoading: existing?.isLoading ?? !hasRenderableVerseBody(existingVerse),
              errorMessage: hasRenderableVerseBody(existingVerse)
                ? null
                : existing?.errorMessage ?? null,
              tafsirById: nextTafsirById,
            };
            didChange = true;
          }

          return didChange ? nextState : previous;
        });
      } catch {
        // Fall back to per-verse reads if the batch itself fails.
        prefetchTargets.forEach((target) => {
          void loadPage(target);
        });
      }
    })();
  }, [chapters, loadPage, pageSignature, prefetchTargets, tafsirIds]);

  const pagerRef = React.useRef<FlatList<VerseTarget> | null>(null);
  const visibleIndexRef = React.useRef(-1);
  const didInitialPagerSyncRef = React.useRef(false);
  const syncedPageWidthRef = React.useRef<number | null>(null);
  const pageScrollRefsRef = React.useRef<Record<string, ScrollView | null>>({});
  const pageScrollOffsetsRef = React.useRef<Record<string, number>>({});

  const navigateToTarget = React.useCallback(
    (target: VerseTarget) => {
      const nextTarget: VerseTarget = { surahId: target.surahId, ayahId: target.ayahId };
      if (currentTarget && areSameTarget(currentTarget, nextTarget)) return;
      const verseKey = getVerseKey(nextTarget);
      setPageStateByKey((previous) => {
        const existing = previous[verseKey];
        if (
          existing?.signature === pageSignature &&
          !existing.isLoading &&
          hasRenderableVerseBody(existing.verse) &&
          tafsirIds.every((tafsirId) => hasLoadedTafsirState(existing.tafsirById[tafsirId]))
        ) {
          return previous;
        }

        return {
          ...previous,
          [verseKey]: buildOfflineFirstPageState({
            target: nextTarget,
            chapters,
            pageSignature,
            translationIds,
            tafsirIds,
            existing,
          }),
        };
      });
      setCurrentTarget(nextTarget);
      router.setParams({
        surahId: String(nextTarget.surahId),
        ayahId: String(nextTarget.ayahId),
      });
    },
    [chapters, currentTarget, pageSignature, router, tafsirIds, translationIds]
  );

  React.useLayoutEffect(() => {
    if (!pagerRef.current || currentTargetIndex < 0) return;

    const widthChanged = syncedPageWidthRef.current !== pageWidth;
    syncedPageWidthRef.current = pageWidth;
    const needsSync =
      !didInitialPagerSyncRef.current ||
      widthChanged ||
      visibleIndexRef.current !== currentTargetIndex;

    if (!needsSync) return;

    pagerRef.current.scrollToIndex({ index: currentTargetIndex, animated: false });
    visibleIndexRef.current = currentTargetIndex;
    didInitialPagerSyncRef.current = true;
  }, [currentTargetIndex, pageWidth]);

  const handlePagerScrollEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pagerTargets.length === 0) return;
      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const index = Math.max(0, Math.min(pagerTargets.length - 1, rawIndex));
      visibleIndexRef.current = index;

      const target = pagerTargets[index];
      if (!target) return;
      if (currentTarget && areSameTarget(currentTarget, target)) return;

      navigateToTarget(target);
    },
    [currentTarget, navigateToTarget, pageWidth, pagerTargets]
  );

  const getPagerItemLayout = React.useCallback(
    (_: ArrayLike<VerseTarget> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth]
  );

  const handleScrollToIndexFailed = React.useCallback(
    ({ index }: { index: number }) => {
      pagerRef.current?.scrollToOffset({ offset: pageWidth * index, animated: false });
    },
    [pageWidth]
  );

  const renderPagerItem = React.useCallback(
    ({ item }: { item: VerseTarget }) => {
      return (
        <TafsirPage
          item={item}
          pageWidth={pageWidth}
          viewportHeight={viewportHeight}
          insets={insets}
          pageSignature={pageSignature}
          pageStateByKey={pageStateByKey}
          chapters={chapters}
          currentSurahId={currentSurahId}
          showTranslationAttribution={showTranslationAttribution}
          translationsById={translationsById}
          translationIds={translationIds}
          currentSurahVerseErrorMessage={currentSurahVerseErrorMessage}
          isCurrentSurahVersesLoading={isCurrentSurahVersesLoading}
          getCurrentSurahVerseByNumber={getCurrentSurahVerseByNumber}
          settings={settings}
          verseRenderSignal={verseRenderSignal}
          openVerseActions={openVerseActions}
          pageScrollRefsRef={pageScrollRefsRef}
          pageScrollOffsetsRef={pageScrollOffsetsRef}
          readerHeader={readerHeader}
          tafsirSkeletonMinHeight={tafsirSkeletonMinHeight}
          tafsirIds={tafsirIds}
          activeTafsirId={activeTafsirId}
          activeTafsirName={activeTafsirName}
          setActiveTafsirTabId={setActiveTafsirTabId}
          setIsSettingsOpen={setIsSettingsOpen}
          setSettingsInitialPanel={setSettingsInitialPanel}
          setIsPagerScrollEnabled={setIsPagerScrollEnabled}
          setIsVerticalScrollEnabled={setIsVerticalScrollEnabled}
          isVerticalScrollEnabled={isVerticalScrollEnabled}
        />
      );
    },
    [
      pageWidth,
      viewportHeight,
      insets,
      pageSignature,
      pageStateByKey,
      chapters,
      currentSurahId,
      showTranslationAttribution,
      translationsById,
      translationIds,
      currentSurahVerseErrorMessage,
      isCurrentSurahVersesLoading,
      getCurrentSurahVerseByNumber,
      settings,
      verseRenderSignal,
      openVerseActions,
      readerHeader,
      tafsirSkeletonMinHeight,
      tafsirIds,
      activeTafsirId,
      activeTafsirName,
      isVerticalScrollEnabled,
    ]
  );

  const pagerExtraData = React.useMemo(
    () => ({
      activeTafsirId,
      activeTafsirName,
      pageSignature,
      pageStateByKey,
      currentSurahId,
      currentSurahPagesSignature,
      currentSurahVerseErrorMessage,
      isCurrentSurahVersesLoading,
      showTranslationAttribution,
      tafsirIdsKey,
      translationIdsKey,
      translationsById,
      verseRenderSignal,
      arabicFontFace: settings.arabicFontFace,
      arabicFontSize: settings.arabicFontSize,
      showByWords: settings.showByWords,
      tafsirFontSize: settings.tafsirFontSize,
      translationFontSize: settings.translationFontSize,
    }),
    [
      activeTafsirId,
      activeTafsirName,
      pageSignature,
      pageStateByKey,
      currentSurahId,
      currentSurahPagesSignature,
      currentSurahVerseErrorMessage,
      isCurrentSurahVersesLoading,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.tafsirFontSize,
      settings.translationFontSize,
      showTranslationAttribution,
      tafsirIdsKey,
      translationIdsKey,
      translationsById,
      verseRenderSignal,
    ]
  );

  if (!currentTarget) {
    return (
      <View className={isDark ? 'flex-1 dark' : 'flex-1'} style={{ backgroundColor: palette.background }}>
        <View className="flex-1 items-center justify-center bg-background px-6 dark:bg-background-dark" style={{ backgroundColor: palette.background }}>
          <Text className="text-center text-sm text-error dark:text-error-dark">
            Invalid verse reference.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={isDark ? 'flex-1 dark' : 'flex-1'} style={{ backgroundColor: palette.background }}>
      <View className="flex-1 bg-background dark:bg-background-dark" style={{ backgroundColor: palette.background }}>
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <ReaderOverlayHeader
          onLayout={readerHeader.handleHeaderLayout}
          pointerEvents={readerHeader.headerPointerEvents}
          style={[readerHeader.headerAnimatedStyle, { elevation: 0 }]}
        >
          <AppSearchHeader
            editable={readerHeader.headerPointerEvents !== 'none' && !isSettingsOpen}
            left={
              <HeaderActionButton accessibilityLabel="Go back" onPress={() => router.back()}>
                <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
              </HeaderActionButton>
            }
            inputRef={headerSearch.inputRef}
            value={headerSearch.query}
            onChangeText={headerSearch.updateQuery}
            placeholder="Search…"
            onFocus={() => {
              if (isSettingsOpen) return;
              readerHeader.showHeader();
              headerSearch.setIsOpen(true);
            }}
            onSubmitEditing={() => headerSearch.navigateToSearch()}
            right={
              <HeaderActionButton
                accessibilityLabel="Open settings"
                onPress={() => {
                  setSettingsInitialPanel(undefined);
                  setIsSettingsOpen(true);
                }}
              >
                <Settings color={palette.text} size={22} strokeWidth={2.25} />
              </HeaderActionButton>
            }
          />
        </ReaderOverlayHeader>

        <FlatList
          style={{ marginTop: insets.top, flex: 1 }}
          ref={pagerRef}
          data={pagerTargets}
          extraData={pagerExtraData}
          horizontal
          pagingEnabled
          bounces={false}
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={getVerseKey}
          renderItem={renderPagerItem}
          getItemLayout={getPagerItemLayout}
          onMomentumScrollEnd={handlePagerScrollEnd}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScrollBeginDrag={readerHeader.resetHeader}
          initialScrollIndex={currentTargetIndex >= 0 ? currentTargetIndex : undefined}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews={false}
          scrollEventThrottle={16}
          nestedScrollEnabled
          scrollEnabled={isPagerScrollEnabled}
        />

        <VerseActionsSheet
          isOpen={isVerseActionsOpen}
          onClose={closeVerseActions}
          title={activeVerse?.title ?? 'Surah'}
          verseKey={activeVerse?.verseKey ?? ''}
          isPlaying={Boolean(audio.isPlaying && audio.activeVerseKey === activeVerse?.verseKey)}
          isBookmarked={activeVersePinned}
          showViewTafsir={false}
          onPlayPause={handlePlayPause}
          onBookmark={handleBookmark}
          onAddToPlan={handleAddToPlan}
          onShare={handleShare}
        />

        <BookmarkModal
          isOpen={isBookmarkModalOpen}
          onClose={() => setIsBookmarkModalOpen(false)}
          verseId={activeVerse?.verseKey ?? ''}
          verseKey={activeVerse?.verseKey ?? ''}
          metadata={activeVerseBookmarkMetadata}
        />

        {plannerVerseSummary ? (
          <AddToPlannerModal
            isOpen={isAddToPlannerOpen}
            onClose={() => setIsAddToPlannerOpen(false)}
            verseSummary={plannerVerseSummary}
          />
        ) : null}

        <ComprehensiveSearchDropdown
          isOpen={headerSearch.isOpen && !isSettingsOpen}
          query={headerSearch.query}
          onQueryChange={headerSearch.updateQuery}
          onClose={() => headerSearch.close({ clearQuery: false })}
          onNavigateToMushaf={headerSearch.navigateToMushaf}
          onNavigateToSurahVerse={headerSearch.navigateToSurahVerse}
          onNavigateToTafsir={headerSearch.navigateToTafsir}
          onNavigateToTranslation={headerSearch.navigateToTranslation}
          onNavigateToJuz={headerSearch.navigateToJuz}
          onNavigateToPage={headerSearch.navigateToPage}
          onNavigateToSearch={headerSearch.navigateToSearch}
          topInset={readerHeader.headerHeight}
        />

        <SettingsSidebar
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          showTafsirSetting
          pageType="tafsir"
          initialPanel={settingsInitialPanel}
        />
      </View>
    </View>
  );
}
