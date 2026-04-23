import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { TafsirHtml } from '@/components/tafsir/TafsirHtml';
import {
  TafsirTabPanels,
  TafsirTabs,
  type TafsirTabContentState,
} from '@/components/tafsir/TafsirTabs';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useSurahVerses } from '@/hooks/useSurahVerses';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import {
  getOfflineTafsirBatchCached,
  getOfflineTafsirCached,
  getOfflineTafsirSurahCached,
} from '@/lib/tafsir/tafsirCache';
import { getVerseDetailsCached, peekVersePreview } from '@/lib/verse/verseDetailsCache';
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

const EMPTY_PAGE_STATE: PageState = {
  signature: '',
  chapter: null,
  verse: null,
  isLoading: true,
  errorMessage: null,
  tafsirById: {},
};

const OFFLINE_TAFSIR_UNAVAILABLE_MESSAGE = 'This tafsir is not downloaded for offline reading.';
const OFFLINE_TAFSIR_PREFETCH_RADIUS = 10;

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
  const [verseRenderSignal, setVerseRenderSignal] = React.useState(0);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );
  const [activeVerse, setActiveVerse] = React.useState<{
    title: string;
    surahId: number;
    verseKey: string;
    arabicText: string;
    translationTexts: string[];
  } | null>(null);
  const [isPagerScrollEnabled, setIsPagerScrollEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!parsedRouteTarget) {
      setCurrentTarget(null);
      return;
    }
    setCurrentTarget((previous) =>
      previous && areSameTarget(previous, parsedRouteTarget) ? previous : parsedRouteTarget
    );
  }, [parsedRouteTarget]);

  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const audio = useAudioPlayer();
  const { isPinned } = useBookmarks();
  const { chapters } = useChapters();

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

  React.useEffect(() => {
    setIsPagerScrollEnabled(true);
  }, [currentTarget?.ayahId, currentTarget?.surahId]);

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
  const currentSurahVerseKeys = React.useMemo(() => {
    if (!currentSurahId) return [];

    const chapter = getChapterById(chapters, currentSurahId);
    const verseCount =
      chapter && Number.isFinite(chapter.verses_count) ? Math.trunc(chapter.verses_count) : 0;
    if (verseCount <= 0) return [];

    return Array.from({ length: verseCount }, (_value, index) => `${currentSurahId}:${index + 1}`);
  }, [chapters, currentSurahId]);
  const {
    getVerseByNumber: getCurrentSurahVerseByNumber,
    pagesSignature: currentSurahPagesSignature,
    isLoading: isCurrentSurahVersesLoading,
    errorMessage: currentSurahVerseErrorMessage,
  } = useSurahVerses({
    chapterNumber: currentSurahId ?? Number.NaN,
    translationIds,
    initialVerseNumber: currentTarget?.ayahId,
    enabled: Boolean(currentSurahId),
  });

  const headerTitle = React.useMemo(() => {
    if (currentNavigation.chapter?.name_simple) return currentNavigation.chapter.name_simple;
    if (currentTarget?.surahId) return `Surah ${currentTarget.surahId}`;
    return 'Surah';
  }, [currentNavigation.chapter?.name_simple, currentTarget?.surahId]);

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

  const [pageStateByKey, setPageStateByKey] = React.useState<Record<string, PageState>>({});
  const pageStateByKeyRef = React.useRef(pageStateByKey);
  const inflightRequestsRef = React.useRef<Set<string>>(new Set());
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    pageStateByKeyRef.current = pageStateByKey;
  }, [pageStateByKey]);

  React.useEffect(() => {
    generationRef.current += 1;
    inflightRequestsRef.current.clear();
    setPageStateByKey({});
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
      const hasVerseReady =
        existingMatchesSignature &&
        !existing.isLoading &&
        (existing.verse !== null || existing.errorMessage !== null);
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
        ? Promise.resolve(existing?.verse ?? previewVerse ?? null)
        : getVerseDetailsCached(verseKey, translationIds);
      const tafsirPromise = Promise.all(
        tafsirIdsToFetch.map(async (tafsirId) => {
          try {
            const html = await getOfflineTafsirCached(verseKey, tafsirId);
            return {
              tafsirId,
              state: html?.trim()
                ? ({ html, isLoading: false, error: null } satisfies TafsirTabContentState)
                : ({
                    html: '',
                    isLoading: false,
                    error: OFFLINE_TAFSIR_UNAVAILABLE_MESSAGE,
                  } satisfies TafsirTabContentState),
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
            verse:
              currentMatchesSignature && current.verse !== null
                ? current.verse
                : previewVerse ?? null,
            isLoading:
              !hasVerseReady &&
              !(currentMatchesSignature && current.verse !== null) &&
              previewVerse == null,
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
        const retainedVerse = current?.verse ?? previewVerse ?? verse ?? null;

        return {
          ...previous,
          [verseKey]: {
            signature: pageSignature,
            chapter,
            verse: retainedVerse,
            isLoading: false,
            errorMessage: retainedVerse ? null : verseError,
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

        const retainedVerse = current?.verse ?? previewVerse ?? verse ?? null;

        return {
          ...previous,
          [verseKey]: {
            signature: pageSignature,
            chapter,
            verse: retainedVerse,
            isLoading: false,
            errorMessage: retainedVerse ? null : verseError,
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

    const startIndex = Math.max(0, currentTargetIndex - OFFLINE_TAFSIR_PREFETCH_RADIUS);
    const endIndexExclusive = Math.min(
      pagerTargets.length,
      currentTargetIndex + OFFLINE_TAFSIR_PREFETCH_RADIUS + 1
    );
    return pagerTargets.slice(startIndex, endIndexExclusive);
  }, [currentTarget, currentTargetIndex, pagerTargets]);

  React.useEffect(() => {
    prefetchTargets.forEach((target) => {
      void loadPage(target);
    });
  }, [loadPage, prefetchTargets]);

  React.useEffect(() => {
    if (typeof activeTafsirId !== 'number') return;
    if (!currentSurahId || currentSurahVerseKeys.length === 0) return;

    const generation = generationRef.current;

    void (async () => {
      try {
        const tafsirByVerseKey = await getOfflineTafsirSurahCached({
          surahId: currentSurahId,
          tafsirId: activeTafsirId,
          verseKeys: currentSurahVerseKeys,
        });

        if (generation !== generationRef.current) return;

        setPageStateByKey((previous) => {
          let didChange = false;
          const nextState = { ...previous };

          for (const verseKey of currentSurahVerseKeys) {
            const existing = previous[verseKey];
            const existingMatchesSignature = existing?.signature === pageSignature;
            const html = tafsirByVerseKey.get(verseKey) ?? null;
            const activeTafsirState = html?.trim()
              ? ({ html, isLoading: false, error: null } satisfies TafsirTabContentState)
              : ({
                  html: '',
                  isLoading: false,
                  error: OFFLINE_TAFSIR_UNAVAILABLE_MESSAGE,
                } satisfies TafsirTabContentState);
            const nextTafsirById: Partial<Record<number, TafsirTabContentState>> = {
              ...(existingMatchesSignature ? existing?.tafsirById : {}),
              [activeTafsirId]: activeTafsirState,
            };

            const nextPageState: PageState = {
              signature: pageSignature,
              chapter: (existingMatchesSignature ? existing?.chapter : null) ?? getChapterById(chapters, currentSurahId),
              verse: existingMatchesSignature ? existing?.verse ?? null : null,
              isLoading: existingMatchesSignature ? existing?.isLoading ?? false : true,
              errorMessage: existingMatchesSignature ? existing?.errorMessage ?? null : null,
              tafsirById: nextTafsirById,
            };

            if (
              existing?.signature === nextPageState.signature &&
              existing?.chapter?.id === nextPageState.chapter?.id &&
              existing?.errorMessage === nextPageState.errorMessage &&
              existing?.isLoading === nextPageState.isLoading &&
              existing?.tafsirById?.[activeTafsirId]?.html === activeTafsirState.html &&
              existing?.tafsirById?.[activeTafsirId]?.error === activeTafsirState.error &&
              existing?.tafsirById?.[activeTafsirId]?.isLoading === activeTafsirState.isLoading
            ) {
              continue;
            }

            nextState[verseKey] = nextPageState;
            didChange = true;
          }

          return didChange ? nextState : previous;
        });
      } catch {
        // Ignore background whole-surah offline hydration failures.
      }
    })();
  }, [activeTafsirId, chapters, currentSurahId, currentSurahVerseKeys, pageSignature]);

  React.useEffect(() => {
    if (tafsirIds.length === 0 || prefetchTargets.length === 0) return;

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
              const nextTafsirState = html?.trim()
                ? ({ html, isLoading: false, error: null } satisfies TafsirTabContentState)
                : ({
                    html: '',
                    isLoading: false,
                    error: OFFLINE_TAFSIR_UNAVAILABLE_MESSAGE,
                  } satisfies TafsirTabContentState);

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

            nextState[verseKey] = {
              signature: pageSignature,
              chapter:
                (existingMatchesSignature ? existing?.chapter : null) ??
                getChapterById(chapters, target.surahId),
              verse:
                (existingMatchesSignature ? existing?.verse : null) ??
                previewVerse ??
                null,
              isLoading:
                existingMatchesSignature ? existing?.isLoading ?? false : previewVerse == null,
              errorMessage: existingMatchesSignature ? existing?.errorMessage ?? null : null,
              tafsirById: nextTafsirById,
            };
            didChange = true;
          }

          return didChange ? nextState : previous;
        });
      } catch {
        // Ignore offline batch prefetch failures and let per-verse loading handle visible pages.
      }
    })();
  }, [chapters, pageSignature, prefetchTargets, tafsirIds]);

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
      setCurrentTarget(nextTarget);
      router.setParams({
        surahId: String(nextTarget.surahId),
        ayahId: String(nextTarget.ayahId),
      });
    },
    [currentTarget, router]
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
      const verseKey = getVerseKey(item);
      const pageState = pageStateByKey[verseKey] ?? EMPTY_PAGE_STATE;
      const pageTitle = pageState.chapter?.name_simple ?? `Surah ${item.surahId}`;
      const linkedSurahVerse =
        item.surahId === currentSurahId ? getCurrentSurahVerseByNumber(item.ayahId) : undefined;
      const translationItems = linkedSurahVerse
        ? (showTranslationAttribution
            ? (linkedSurahVerse.translationItems ?? []).map((translation) => {
                if (translation.resourceName) return translation;
                const fallbackName =
                  typeof translation.resourceId === 'number'
                    ? translationsById.get(translation.resourceId)?.name ??
                      `Translation ${translation.resourceId}`
                    : undefined;
                return { ...translation, resourceName: fallbackName };
              })
            : linkedSurahVerse.translationItems ?? [])
        : buildTranslationItems({
            verse: pageState.verse,
            translationIds,
            showTranslationAttribution,
            translationsById,
          });
      const translationTexts = translationItems.map((translation) => translation.text);
      const displayVerseKey = linkedSurahVerse?.verse_key ?? pageState.verse?.verse_key ?? verseKey;
      const displayArabicText = linkedSurahVerse?.text_uthmani ?? pageState.verse?.text_uthmani ?? '';
      const verseErrorMessage =
        item.surahId === currentSurahId
          ? !linkedSurahVerse && !pageState.verse
            ? currentSurahVerseErrorMessage ?? pageState.errorMessage
            : null
          : pageState.errorMessage;
      const showVerseSkeleton =
        item.surahId === currentSurahId
          ? !linkedSurahVerse && !pageState.verse && isCurrentSurahVersesLoading
          : pageState.isLoading;
      const currentTafsirState =
        typeof activeTafsirId === 'number' ? pageState.tafsirById[activeTafsirId] : undefined;
      const isMultiTafsir = tafsirIds.length > 1;

      return (
        <View style={{ width: pageWidth }}>
          <ScrollView
            key={`${verseKey}-${pageSignature}`}
            ref={(ref) => {
              pageScrollRefsRef.current[verseKey] = ref;
            }}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 28,
              minHeight: Math.max(1, viewportHeight - 120),
            }}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
            nestedScrollEnabled
            stickyHeaderIndices={isMultiTafsir ? [2] : undefined}
            onScroll={(event) => {
              pageScrollOffsetsRef.current[verseKey] = event.nativeEvent.contentOffset.y;
            }}
            onContentSizeChange={() => {
              if ((pageScrollOffsetsRef.current[verseKey] ?? 0) > 8) return;
              requestAnimationFrame(() => {
                pageScrollRefsRef.current[verseKey]?.scrollTo({ x: 0, y: 0, animated: false });
              });
            }}
            scrollEventThrottle={16}
          >
            <View>
              {verseErrorMessage ? (
                <Text className="text-sm text-error dark:text-error-dark">{verseErrorMessage}</Text>
              ) : null}
            </View>

            <View className={verseErrorMessage ? 'mt-4' : ''} collapsable={false}>
              {linkedSurahVerse || pageState.verse ? (
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

            <View
              collapsable={false}
              className={isMultiTafsir ? 'bg-background dark:bg-background-dark' : ''}
              style={
                isMultiTafsir
                  ? {
                      elevation: 10,
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
                  onActiveTafsirChange={setActiveTafsirTabId}
                  onAddTafsir={() => setIsSettingsOpen(true)}
                  onTabsTouchStart={() => setIsPagerScrollEnabled(false)}
                  onTabsTouchEnd={() => setIsPagerScrollEnabled(true)}
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
                />
              ) : tafsirIds.length === 1 ? (
                <View className="mt-4">
                <View className="mb-4 items-center gap-3">
                  <Text className="text-center text-lg font-bold text-foreground dark:text-foreground-dark">
                    {activeTafsirName}
                  </Text>
                  <Pressable
                    onPress={() => setIsSettingsOpen(true)}
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
                  <Text className="text-sm text-error dark:text-error-dark">{currentTafsirState.error}</Text>
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
          </ScrollView>
        </View>
      );
    },
    [
      activeTafsirId,
      activeTafsirName,
      currentSurahId,
      currentSurahVerseErrorMessage,
      getCurrentSurahVerseByNumber,
      isCurrentSurahVersesLoading,
      openVerseActions,
      pageStateByKey,
      pageSignature,
      pageWidth,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.tafsirFontSize,
      settings.translationFontSize,
      showTranslationAttribution,
      tafsirIds,
      tafsirSkeletonMinHeight,
      translationIds,
      translationsById,
      verseRenderSignal,
      viewportHeight,
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
      <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
        <View className="flex-1 items-center justify-center bg-background px-6 dark:bg-background-dark">
          <Text className="text-center text-sm text-error dark:text-error-dark">
            Invalid verse reference.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
      <View className="flex-1 bg-background dark:bg-background-dark">
        <Stack.Screen
          options={{
            title: headerTitle,
            headerTitleAlign: 'center',
            headerRight: () => (
              <Pressable
                onPress={() => setIsSettingsOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                {({ pressed }) => (
                  <Settings
                    color={palette.text}
                    size={22}
                    strokeWidth={2.25}
                    style={{ marginRight: 12, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            ),
          }}
        />

        <FlatList
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
          initialScrollIndex={currentTargetIndex >= 0 ? currentTargetIndex : undefined}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
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

        <SettingsSidebar
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          showTafsirSetting
          pageType="tafsir"
        />
      </View>
    </View>
  );
}
